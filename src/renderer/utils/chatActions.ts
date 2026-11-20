// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Catálogo das ações nativas que um botão do chat pode disparar.
 * Cada ação corresponde a um evento do uiBus (disparado via `event-click` do mini-framework declarativo),
 * então a lista funciona também como lista de permissão: a IA nunca emite eventos fora dela.
 */

/** Evento disparado pelos botões de resposta pronta (envia o texto como mensagem do usuário). */
export const QUICK_REPLY_EVENT = "chat:quick-reply";

/**
 * @typedef {Object} ChatAction
 * @property {string} event - Evento do uiBus emitido ao clicar.
 * @property {string} description - Descrição (exibida para a IA).
 * @property {string[]} [params] - Parâmetros obrigatórios informados pela IA (`path`, `folder`).
 */

/** @type {Object<string, ChatAction>} */
export const CHAT_ACTIONS = {
  "open-file": {
    event: "editor:open-file",
    description: "Abre um arquivo do livro no editor (requer `path`).",
    params: ["path"],
  },
  "open-sync": {
    event: "sync:open-modal",
    description: "Abre a janela de sincronização de rascunhos pendentes.",
  },
  "open-central": {
    event: "central:open",
    description: "Abre uma central do app (requer `central`: issues, book, ai ou system; opcional `tab`).",
    params: ["central"],
  },
  "open-settings": {
    event: "settings:open",
    description: "Abre as configurações do aplicativo.",
  },
  "edit-variables": {
    event: "variables:open-modal",
    description: "Abre a edição das variáveis do arquivo aberto no editor.",
  },
  "new-chapter": {
    event: "chapter:create",
    description: "Abre o assistente de criação de capítulo.",
  },
  "new-note": {
    event: "note:create",
    description: "Abre a criação de uma nova anotação.",
  },
  "new-book": {
    event: "book:create",
    description: "Abre o assistente de criação de livro.",
  },
  "new-entity": {
    event: "entity:create",
    description:
      "Abre o assistente de nova ficha em uma pasta do mundo (requer `folder`, ex.: assets/characters).",
    params: ["folder"],
  },
};

/** Eventos que podem aparecer em botões do chat (ações + resposta pronta). */
export const ALLOWED_CHAT_EVENTS = new Set([
  QUICK_REPLY_EVENT,
  ...Object.values(CHAT_ACTIONS).map((action) => action.event),
]);

/**
 * Indica se um evento pode ser disparado por um botão do chat.
 * @param {string} event - Nome do evento.
 * @returns {boolean}
 */
export function isAllowedChatEvent(event) {
  return ALLOWED_CHAT_EVENTS.has(event);
}
