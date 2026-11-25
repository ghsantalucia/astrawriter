/**
 * @file Ferramenta que permite à IA anexar botões à sua resposta no chat.
 *
 * Há dois tipos de botão:
 *  1. Resposta pronta (`reply`): ao clicar, o texto é enviado como mensagem do usuário.
 *  2. Ação do sistema (`action`): ao clicar, dispara um evento nativo do app (abrir arquivo, sincronizar, criar capítulo…).
 * Os botões são só dados (`{label, event, data}`): a interface os renderiza com `event-click` e `data-*`,
 * e apenas eventos da lista de permissão (`utils/chatActions.js`) são aceitos.
 */

import { t } from "../../../shared/i18n.js";
import { normalizePath } from "../../utils/helpers.js";
import { CHAT_ACTIONS, QUICK_REPLY_EVENT } from "../../utils/chatActions.js";
import { locateFile, parseRelativePath } from "./permissions.js";

/** Máximo de botões por resposta. */
const MAX_BUTTONS = 8;

/**
 * Converte o pedido da IA em um botão `{label, event, data}`, validando a ação e os parâmetros.
 * @param {{label: string, reply?: string, action?: string, path?: string, folder?: string}} request - Botão solicitado.
 * @param {Object} ctx - Contexto das ferramentas.
 * @returns {Promise<{label: string, event: string, data: Object}>}
 * @throws {Error} Se a ação é desconhecida ou faltam parâmetros.
 */
async function buildButton(request, ctx) {
  const label = String(request?.label || "").trim();
  if (!label) throw new Error(t("Todo botão precisa de um 'label'."));

  // Resposta pronta: envia o texto (ou o próprio rótulo) como mensagem do usuário
  if (!request.action) {
    const message = String(request.reply || label).trim();
    return { label, event: QUICK_REPLY_EVENT, data: { message } };
  }

  const action = CHAT_ACTIONS[request.action];
  if (!action) {
    throw new Error(
      t('Ação desconhecida: "{action}". Disponíveis: {available}.', { action: request.action, available: Object.keys(CHAT_ACTIONS).join(", ") }),
    );
  }

  for (const param of action.params || []) {
    if (!request[param]) {
      throw new Error(
        t("A ação \"{action}\" requer o parâmetro '{param}'.", { action: request.action, param }),
      );
    }
  }

  switch (request.action) {
    case "open-file": {
      // Valida o caminho e a existência do arquivo (sem exigir permissão de leitura da IA: quem abre é o autor)
      const bookPath = normalizePath(ctx.state.currentBookPath).replace(
        /\/+$/,
        "",
      );
      const segments = parseRelativePath(request.path, bookPath);
      await locateFile(ctx.state, segments.join("/"));
      return {
        label,
        event: action.event,
        data: { "absolute-path": `${bookPath}/${segments.join("/")}` },
      };
    }
    case "open-central":
      if (!["issues", "book", "ai", "system"].includes(String(request.central))) {
        throw new Error(t('A ação "open-central" aceita central: issues, book, ai ou system.'));
      }
      return { label, event: action.event, data: { central: String(request.central), ...(request.tab ? { tab: String(request.tab) } : {}) } };
    case "new-entity":
      return {
        label,
        event: action.event,
        data: { folder: String(request.folder).replace(/^\/+|\/+$/g, "") },
      };
    default:
      return { label, event: action.event, data: {} };
  }
}

/**
 * Registra a ferramenta de botões do chat.
 * @param {import('./registry.js').ToolRegistry} registry
 */
export function registerChatTools(registry) {
  const actionList = Object.entries(CHAT_ACTIONS)
    .map(([id, action]) => `${id}: ${action.description}`)
    .join(" | ");

  registry.register({
    name: "show_buttons",
    description: t("Anexa botões clicáveis à sua resposta (exibidos em grade, 2 por linha). Use para oferecer escolhas rápidas ao autor ou atalhos para ações do app. Botão de resposta pronta: informe 'label' (e opcionalmente 'reply', o texto enviado como se o autor o tivesse digitado). Botão de ação: informe 'action' ({actionList}). Depois de chamar, escreva sua resposta normalmente (os botões aparecem abaixo dela).", { actionList }),
    parameters: {
      type: "object",
      properties: {
        buttons: {
          type: "array",
          description: t("Botões a exibir (máximo {max}).", { max: MAX_BUTTONS }),
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: t("Texto do botão (curto).") },
              reply: {
                type: "string",
                description:
                  t("Resposta pronta enviada ao clicar (padrão: o próprio label). Ignorado se houver 'action'."),
              },
              action: {
                type: "string",
                enum: Object.keys(CHAT_ACTIONS),
                description: t("Ação nativa do app executada ao clicar."),
              },
              path: {
                type: "string",
                description:
                  t("Para action='open-file': caminho do arquivo relativo ao livro."),
              },
              folder: {
                type: "string",
                description:
                  t("Para action='new-entity': pasta da ficha (ex.: assets/characters)."),
              },
              central: {
                type: "string",
                description: t("Para action='open-central': issues, book, ai ou system."),
              },
              tab: {
                type: "string",
                description: t("Para action='open-central': aba da central (opcional, ex.: model)."),
              },
            },
            required: ["label"],
          },
        },
      },
      required: ["buttons"],
    },
    async execute({ buttons }, ctx) {
      if (!Array.isArray(buttons) || buttons.length === 0) {
        throw new Error(t("Informe ao menos um botão."));
      }
      if (!Array.isArray(ctx.buttons)) ctx.buttons = [];
      if (ctx.buttons.length + buttons.length > MAX_BUTTONS) {
        throw new Error(t("No máximo {max} botões por resposta.", { max: MAX_BUTTONS }));
      }

      const built = [];
      for (const request of buttons)
        built.push(await buildButton(request, ctx));
      ctx.buttons.push(...built);

      return t("{count} botão(ões) registrado(s). Eles aparecerão abaixo da sua resposta; escreva agora o texto da resposta.", { count: built.length });
    },
  });
}
