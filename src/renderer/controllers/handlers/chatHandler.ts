// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Handler para orquestração de eventos e mensagens do chat.
 */

import { uiBus } from "../../events/uiBus.js";
import { domainBus } from "../../events/domainBus.js";

/** Indica se uma mensagem está sendo processada (evita respostas prontas simultâneas). */
let isBusy = false;

/** Rótulo de cada tipo de item criado, usado nos avisos do sistema no chat. */
const CREATION_LABELS = {
  book: "Livro",
  chapter: "Capítulo",
  entity: "Ficha",
  note: "Anotação",
};

/**
 * Mostra (e grava no histórico) uma mensagem "system" no chat, usada para eventos importantes realizados pela IA.
 * @param {{text: string}} payload - Texto do aviso.
 * @param {Object} aiService - Instância do AiService.
 * @returns {Promise<void>}
 */
export async function onSystemNotice({ text }, aiService) {
  if (!text) return;

  const message = {
    role: "system",
    content: text,
    timestamp: new Date().toISOString(),
  };
  uiBus.emit("chat:render-message", message);
  await aiService?.saveMessage(message);
}

/**
 * Avisa no chat quando um item (livro, capítulo, ficha ou anotação) foi criado pela IA. Criações feitas pelo
 * usuário não geram aviso.
 * @param {{kind: string, title: string, source: "ui"|"ai"}} payload - Dados do item criado.
 * @param {Object} aiService - Instância do AiService.
 * @returns {Promise<void>}
 */
export async function onCreationNotice(payload, aiService) {
  if (payload?.source !== "ai") return;
  const label = CREATION_LABELS[payload.kind] || "Item";
  await onSystemNotice(
    { text: `${label} "${payload.title}" - Criado` },
    aiService,
  );
}

/**
 * Trata o clique em um botão de resposta pronta: envia o texto do botão como se o usuário o tivesse digitado.
 * @param {{data: {message: string}}} payload - Contexto do evento declarativo (`data-message` do botão).
 * @param {Object} aiService - Instância do AiService.
 * @returns {Promise<void>}
 */
export async function onQuickReply({ data }, aiService) {
  if (isBusy || !data?.message) return;
  await onSendMessage({ promptText: data.message }, aiService);
}

/**
 * Trata o envio de uma mensagem digitada pelo usuário no chat.
 * @param {Object} data
 * @param {string} data.promptText - O texto da mensagem digitada pelo usuário.
 * @param {Object} aiService - Instância do AiService.
 */
export async function onSendMessage({ promptText }, aiService) {
  if (!promptText || !promptText.trim()) return;

  isBusy = true;
  try {
    // 1. Cria a estrutura da mensagem do usuário
    const userMessage = {
      role: "user",
      content: promptText,
      timestamp: new Date().toISOString(),
    };

    // 2. Salva no disco (AGUARDA a gravação ser concluída)
    if (aiService) {
      await aiService.saveMessage(userMessage);
    }

    // 3. Renderiza a mensagem do usuário na interface
    uiBus.emit("chat:render-message", userMessage);

    // 4. Define a UI como carregando (bloqueia textarea/botão de enviar)
    uiBus.emit("chat:set-loading", true);

    // 5. Obtém o histórico da sessão mais recente para enviar como contexto ao gateway
    let history = [];
    if (aiService) {
      const historyData = await aiService.loadChatHistoryPaged({
        sessionOffset: 0,
      });
      history = historyData.messages || [];
    }

    // 6. Envia o texto limpo para o AiService e aguarda a resposta da IA
    const { text: responseText, buttons } = await aiService.sendMessage({
      prompt: promptText,
      history,
    });

    // 7. Cria a estrutura da mensagem do assistente (com os botões que a IA pediu, se houver)
    const assistantMessage = {
      role: "assistant",
      content: responseText,
      timestamp: new Date().toISOString(),
    };
    if (buttons?.length > 0) assistantMessage.buttons = buttons;

    // 8. Salva a resposta da IA no disco
    if (aiService) {
      await aiService.saveMessage(assistantMessage);
    }

    // 9. Renderiza a resposta da IA no chat
    uiBus.emit("chat:render-message", assistantMessage);
  } catch (error) {
    // Interrompida pelo autor (botão de parar): só um aviso discreto na conversa
    if (error?.name === "AbortError") {
      await onSystemNotice({ text: "Você interrompeu a IA." }, aiService);
      return;
    }
    console.error("[ChatHandler] Falha ao processar mensagem do chat:", error);

    uiBus.emit("toast:show", { message: error.message, type: "error" });

    // Mostra o motivo do erro na conversa e o grava no histórico (marcado como erro: não vai de contexto para a IA)
    const errorMessage = {
      role: "assistant",
      content: `**Não consegui responder.** ${error.message || "Ocorreu um erro ao processar sua solicitação."}`,
      timestamp: new Date().toISOString(),
      error: true,
    };
    uiBus.emit("chat:render-message", errorMessage);
    try {
      await aiService?.saveMessage(errorMessage);
    } catch (saveError) {
      console.error("[ChatHandler] Não foi possível gravar o erro no histórico:", saveError);
    }
  } finally {
    // 10. Libera o carregamento da UI independente do resultado
    isBusy = false;
    uiBus.emit("chat:set-loading", false);
  }
}

/**
 * Carrega o histórico de mensagens do chat para a sessão atual do livro ativo.
 * Se o lote inicial tiver <= 20 mensagens, busca arquivos anteriores até acumular >= 50 mensagens.
 *
 * @param {number} offset - Qual arquivo de log deve ser carregado (normalmente 0 no carregamento inicial).
 * @param {Object} aiService - Instância do AiService.
 */
export async function loadHistory(offset, aiService) {
  try {
    if (!aiService) {
      console.warn(
        "[ChatHandler] AiService indisponível para carregar o histórico.",
      );
      return;
    }

    let accumulatedMessages = [];
    let currentOffset = offset;
    let hasMore = true;

    // Loop de acumulação inicial: se <= 20 mensagens, carrega anteriores até totalizar >= 50 ou acabar os arquivos
    while (hasMore && accumulatedMessages.length <= 20) {
      const result = await aiService.loadChatHistoryPaged({
        sessionOffset: currentOffset,
      });

      if (!result || !Array.isArray(result.messages)) {
        break;
      }

      // Como o arquivo mais antigo é retornado nas chamadas com offset maior,
      // prependemos (ou concatenamos na ordem cronológica anterior) as mensagens novas
      accumulatedMessages = [...result.messages, ...accumulatedMessages];
      hasMore = Boolean(result.hasMore);

      // Avança para o próximo arquivo se ainda precisar de mais mensagens
      if (accumulatedMessages.length < 50 && hasMore) {
        currentOffset++;
      } else {
        break; // Atingiu o mínimo de 50 ou não há mais logs
      }
    }

    // Emite o histórico completo acumulado de uma só vez para o componente renderizar
    if (accumulatedMessages.length > 0 || !hasMore) {
      uiBus.emit("chat:render-history", {
        messages: accumulatedMessages,
        hasMore,
        offsetUsed: currentOffset, // Repassa o último offset utilizado para sincronizar o ChatComponent
      });
    }
  } catch (error) {
    console.error(
      "[ChatHandler] Erro ao carregar histórico na troca de livro:",
      error,
    );
  }
}

/**
 * Busca mais histórico antigo quando o usuário rola o chat até o topo (Infinite Scroll).
 * @param {number} offset - Próximo índice de arquivo a buscar.
 * @param {Object} aiService - Instância do AiService.
 */
export async function fetchMoreHistory(offset, aiService) {
  try {
    if (!aiService) return;

    const result = await aiService.loadChatHistoryPaged({
      sessionOffset: offset,
    });

    // Permite disparar o evento mesmo com mensagens vazias se hasMore for false
    if (result && Array.isArray(result.messages)) {
      uiBus.emit("chat:append-history", result);
    }
  } catch (error) {
    console.error("[ChatHandler] Erro ao buscar mais histórico antigo:", error);
  }
}
