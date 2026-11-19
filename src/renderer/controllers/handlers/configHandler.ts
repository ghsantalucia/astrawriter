// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Handler para gerenciar alterações no arquivo config.json dos projetos.
 */

import { uiBus } from "../../events/uiBus.js";
import { domainBus } from "../../events/domainBus.js";
import { normalizePath } from "../../utils/helpers.js";
import { spellService } from "../../services/spellService.js";
import * as bookHandler from "./bookHandler.js";

export async function onConfigChanged(payload, state, bookService) {
  const bookList = await bookHandler.fetchBooks(state, bookService);

  //
  const pertenceAoLivro = normalizePath(payload.filePath).includes(
    normalizePath(state.currentBookPath),
  );

  if (pertenceAoLivro) {
    const currentBookConfig = bookList.find(
      (b) => b.fullPath === state.currentBookPath,
    );

    onCurrentConfigChanged(state, currentBookConfig);
  } else {
    // TODO: handler do config secundário
  }
}

/**
 * Persiste a conta de IA ativa e o modelo escolhidos (a chave de API é configurada na Central de IA).
 * @param {Object} data
 * @param {string} data.accountId - Id da conta selecionada.
 * @param {string} [data.model] - Modelo escolhido.
 * @param {Object} aiService - Instância do AiService.
 */
export async function onAiSettingsSave(data, aiService) {
  try {
    const saved = await aiService.selectAccount(data.accountId, data.model);
    if (!saved) {
      uiBus.emit("toast:show", {
        message: "Não foi possível salvar as configurações de IA.",
        type: "error",
      });
    }
  } catch (err) {
    console.error("[ConfigHandler] Erro ao salvar configurações de IA:", err);
    uiBus.emit("toast:show", {
      message: "Erro ao salvar configurações de IA.",
      type: "error",
    });
  }
}

/**
 * Busca os modelos disponíveis do provider e avisa a interface. Falhas (chave inválida,
 * sem rede) são silenciosas: o select continua com a lista padrão.
 * @param {Object} data
 * @param {string} data.provider - ID do provider.
 * @param {Object} aiService - Instância do AiService.
 */
export async function onAiModelsRequested({ provider, accountId }, aiService) {
  try {
    const models = await aiService.listModels(provider, accountId);
    if (models) uiBus.emit("ai-settings:models-loaded", { provider, models });
  } catch (err) {
    console.warn("[ConfigHandler] Não foi possível listar modelos:", err);
  }
}

/**
 * Processa a alteração de um arquivo config.json do projeto atual detectada no sistema de arquivos.
 * @param {Object} state - Estado global da aplicação.
 * @param {Object|string} config - Conteúdo parseado do config.json ou string JSON.
 */
export async function onCurrentConfigChanged(state, config) {
  try {
    if (!state || !config) return;

    const { book_title, ai_lock } = config;

    // 1. Sempre que QUALQUER config.json mudar, atualizamos a lista de livros da sidebar
    // para garantir que se o título de um livro fechado mudou, o <select> reflita isso.
    uiBus.emit("books:refresh-list");

    // Título do livro atual
    if (book_title !== undefined) {
      const payload = { title: book_title, filePath: state.currentBookPath };
      uiBus.emit("book:title", payload);
    }

    // Lock de IA do livro atual
    if (ai_lock) {
      uiBus.emit("book:ai-locked");
    } else {
      uiBus.emit("book:ai-unlocked");
    }
  } catch (err) {
    console.error(
      "[ConfigHandler] Erro ao processar alteração do config.json:",
      err,
    );
  }
}

/** Chave do idioma da correção ortográfica no armazenamento local. */
const SPELL_LANGUAGE_KEY = "app_spell_language";

/**
 * Aplica o idioma de correção ortográfica salvo (usado ao iniciar o app) e sincroniza o seletor.
 * @returns {Promise<void>}
 */
export async function applySavedSpellLanguage() {
  const language = localStorage.getItem(SPELL_LANGUAGE_KEY) || "pt-BR";
  const select = document.getElementById("spell-language-select");
  if (select) select.value = language;

  const enabled = isSpellcheckEnabled();
  const toggle = document.getElementById("spellcheck-toggle");
  if (toggle) toggle.checked = enabled;
}

/** Chave (armazenamento local) que liga/desliga a correção ortográfica e gramatical. */
const SPELL_ENABLED_KEY = "app_spellcheck_enabled";

/**
 * Se a correção ortográfica e gramatical está ligada (padrão: ligada).
 * @returns {boolean}
 */
export function isSpellcheckEnabled() {
  return localStorage.getItem(SPELL_ENABLED_KEY) !== "false";
}

/**
 * Liga/desliga a correção ortográfica e gramatical e avisa o editor para atualizar o rodapé.
 * @param {{value: boolean}} payload - Evento do switch.
 * @returns {Promise<void>}
 */
export async function onSpellcheckToggled({ value }) {
  localStorage.setItem(SPELL_ENABLED_KEY, String(Boolean(value)));
  uiBus.emit("spellcheck:changed", { enabled: Boolean(value) });
}

/**
 * Troca o idioma da correção ortográfica e o persiste.
 * @param {{value: string}} payload - Evento do seletor (idioma escolhido).
 * @returns {Promise<void>}
 */
export async function onSpellLanguageChanged({ value }) {
  localStorage.setItem(SPELL_LANGUAGE_KEY, value);
  spellService.reset();
  uiBus.emit("spellcheck:changed", { enabled: isSpellcheckEnabled() });
  uiBus.emit("toast:show", {
    message: "Idioma da correção ortográfica alterado.",
    type: "success",
  });
}
