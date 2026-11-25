/**
 * @file Atalhos de teclado do app: as ações que têm atalho (com o padrão de cada uma), a personalização pelo usuário e o
 * despachante global. Há também a lista dos atalhos **fixos** (setas do explorer, Esc, atalhos do editor), que só são
 * explicados, nunca personalizados. Teclas reservadas não podem ser usadas em atalhos personalizados.
 */

import { uiBus } from "../events/uiBus.js";
import { appSettings } from "../utils/appSettings.js";
import { t } from "../../shared/i18n.js";

/** Ações com atalho (editável). `run` dispara a ação. */
export const SHORTCUT_ACTIONS = [
  { id: "file.sync", group: t("Arquivo"), label: t("Sincronizar alterações"), default: "Ctrl+S", run: () => document.getElementById("btn-save")?.click() },
  { id: "file.history", group: t("Arquivo"), label: t("Histórico de versões do arquivo"), default: "Ctrl+H", run: () => uiBus.emit("history:open-modal") },
  { id: "file.autolink", group: t("Arquivo"), label: t("Auto-link dos nomes de fichas"), default: "Ctrl+Shift+L", run: () => uiBus.emit("autolink:run") },
  { id: "file.export", group: t("Arquivo"), label: t("Menu Exportar"), default: "Ctrl+E", run: () => uiBus.emit("export:toggle-menu") },
  { id: "file.data", group: t("Arquivo"), label: t("Dados do arquivo (abrir/fechar)"), default: "Ctrl+D", run: () => uiBus.emit("file-data:toggle") },
  { id: "chapter.new", group: t("Capítulo"), label: t("Novo capítulo"), default: "Ctrl+Alt+N", run: () => uiBus.emit("chapter:create") },
  { id: "chapter.draft", group: t("Capítulo"), label: t("Ir ao Manuscrito"), default: "Ctrl+Alt+1", run: () => document.querySelector<HTMLElement>('.chapter-tab[data-kind="draft"]')?.click() },
  { id: "chapter.outline", group: t("Capítulo"), label: t("Ir ao Esboço"), default: "Ctrl+Alt+2", run: () => document.querySelector<HTMLElement>('.chapter-tab[data-kind="outline"]')?.click() },
  { id: "chapter.analysis", group: t("Capítulo"), label: t("Ir à Análise"), default: "Ctrl+Alt+3", run: () => document.querySelector<HTMLElement>('.chapter-tab[data-kind="analysis"]')?.click() },
  { id: "explorer.search", group: t("Navegação"), label: t("Pesquisar no livro"), default: "Ctrl+K", run: () => document.getElementById("explorer-search-input")?.focus() },
  { id: "chat.toggle", group: t("Navegação"), label: t("Abrir/fechar o chat de IA"), default: "Ctrl+Shift+A", run: () => uiBus.emit("ai-chat:toggle") },
  { id: "settings.open", group: t("Centrais"), label: t("Configurações"), default: "Ctrl+,", run: () => uiBus.emit("settings:open") },
  { id: "central.issues", group: t("Centrais"), label: t("Central de Revisões"), default: "Ctrl+Shift+R", run: () => uiBus.emit("central:open", { central: "issues" }) },
  { id: "central.book", group: t("Centrais"), label: t("Central do Livro"), default: "Ctrl+Shift+B", run: () => uiBus.emit("central:open", { central: "book" }) },
  { id: "central.ai", group: t("Centrais"), label: t("Central de IA"), default: "Ctrl+Shift+I", run: () => uiBus.emit("central:open", { central: "ai" }) },
  { id: "central.system", group: t("Centrais"), label: t("Central do Sistema"), default: "Ctrl+Shift+Y", run: () => uiBus.emit("central:open", { central: "system" }) },
  { id: "narrator.toggle", group: t("Ferramentas"), label: t("Ouvir o arquivo (narrador)"), default: "Ctrl+Shift+O", run: () => uiBus.emit("narrator:toggle") },
  { id: "productivity.toggle", group: t("Ferramentas"), label: t("Iniciar/pausar o cronômetro"), default: "Ctrl+Shift+P", run: () => uiBus.emit("productivity:toggle") },
  { id: "theme.toggle", group: t("Ferramentas"), label: t("Alternar tema claro/escuro"), default: "Ctrl+Shift+T", run: () => uiBus.emit("theme:toggle", { value: !document.body.classList.contains("dark-theme") }) },
  { id: "zoom.in", group: t("Ferramentas"), label: t("Aumentar a fonte do app"), default: "Ctrl+=", run: () => appSettings.set("ui.zoom", appSettings.get("ui.zoom") + 10) },
  { id: "zoom.out", group: t("Ferramentas"), label: t("Diminuir a fonte do app"), default: "Ctrl+-", run: () => appSettings.set("ui.zoom", appSettings.get("ui.zoom") - 10) },
  { id: "zoom.reset", group: t("Ferramentas"), label: t("Tamanho padrão da fonte do app"), default: "Ctrl+0", run: () => appSettings.set("ui.zoom", 100) },
];

/** Atalhos fixos: só explicação (não são personalizáveis). */
export const FIXED_SHORTCUTS = [
  { group: t("Esc"), keys: "Esc", text: t("Fecha a camada aberta mais acima: configurações, janela, central ou gaveta do chat (uma por vez). Janelas que exigem uma decisão não fecham.") },
  { group: t("Explorer"), keys: "↑ ↓", text: t("Navega pelos arquivos e pastas.") },
  { group: t("Explorer"), keys: "→ ←", text: t("Percorre as opções do item marcado (criar, renomear, editar, excluir...). Não abre nem fecha pastas.") },
  { group: t("Explorer"), keys: "Enter", text: t("Em uma pasta, abre ou fecha; em um arquivo, abre no editor; com uma opção escolhida (→ ←), aciona a opção. Na última linha, vai para o chat.") },
  { group: t("Explorer"), keys: "Esc", text: t("Sai da navegação por teclado.") },
  { group: t("Chat de IA"), keys: "Enter", text: t("Envia a mensagem.") },
  { group: t("Chat de IA"), keys: "↑ ↓", text: t("No campo de texto, percorre as mensagens que você já enviou.") },
  { group: t("Editor"), keys: "Ctrl+F", text: t("Localizar e substituir no arquivo aberto.") },
  { group: t("Editor"), keys: "Ctrl+B · Ctrl+I", text: t("Negrito e itálico.") },
  { group: t("Editor"), keys: "Ctrl+Z · Ctrl+Y", text: t("Desfaz e refaz.") },
  { group: t("Editor"), keys: "Ctrl+C · Ctrl+X · Ctrl+V", text: t("Copia, recorta e cola.") },
  { group: t("Campos"), keys: t("Enter · vírgula"), text: t("Nos campos de tags e de eventos, confirma o item digitado.") },
];

/** Teclas que nunca podem ser usadas em atalhos personalizados (navegação, edição e teclas do sistema). */
const RESERVED_KEYS = new Set(["Escape", "Tab", "Enter", " ", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Backspace", "Delete", "Insert", "F5", "F12", "CapsLock", "ContextMenu"]);
/** Combinações do editor e do sistema que o app não deixa redefinir. */
const RESERVED_COMBOS = new Set(["Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+A", "Ctrl+Z", "Ctrl+Y", "Ctrl+B", "Ctrl+I", "Ctrl+U", "Ctrl+F", "Ctrl+W", "Ctrl+Q", "Alt+F4", "Ctrl+Shift+Z"]);

/**
 * Nome da tecla de um evento (letras e números pelo código físico: não mudam com o layout nem com o Shift).
 * @param {KeyboardEvent} e - Evento.
 * @returns {string|null} Tecla ou null se for só um modificador.
 */
function keyName(e) {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^Digit\d$/.test(e.code)) return e.code.slice(5);
  if (/^Numpad\d$/.test(e.code)) return e.code.slice(6);
  const punct = { Comma: ",", Period: ".", Equal: "=", Minus: "-", NumpadAdd: "=", NumpadSubtract: "-", Slash: "/", Semicolon: ";", Backslash: "\\", BracketLeft: "[", BracketRight: "]", Quote: "'", Backquote: "`" };
  if (punct[e.code]) return punct[e.code];
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

/**
 * Combinação de um evento no formato `Ctrl+Alt+Shift+Tecla`.
 * @param {KeyboardEvent} e - Evento.
 * @returns {string|null}
 */
export function comboOf(e) {
  const key = keyName(e);
  if (!key) return null;
  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  return [...mods, key].join("+");
}

/**
 * Confere se uma combinação pode ser usada em um atalho personalizado.
 * @param {string} combo - Combinação.
 * @param {string} [actionId] - Ação que receberia o atalho (ela mesma não conta como conflito).
 * @param {ShortcutService} service - Serviço (para achar conflitos).
 * @returns {string|null} Mensagem de erro ou null se está tudo certo.
 */
export function checkCombo(combo, actionId, service) {
  const parts = String(combo || "").split("+");
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  if (!key) return t("Aperte a combinação desejada.");
  if (RESERVED_KEYS.has(key)) return t("A tecla {key} é reservada (navegação e edição) e não pode ser usada em atalhos.", { key: key === " " ? t("Espaço") : key });
  const isFunction = /^F([1-9]|1[01])$/.test(key);
  if (!isFunction && !mods.includes("Ctrl") && !mods.includes("Alt")) return t("Use Ctrl ou Alt junto com a tecla, para não atrapalhar a digitação.");
  if (RESERVED_COMBOS.has(combo)) return t("{combo} é um atalho do editor/sistema e não pode ser redefinido.", { combo });
  const owner = service.owner(combo, actionId);
  if (owner) return t("{combo} já é usado em “{label}”.", { combo, label: owner.label });
  return null;
}

/**
 * Serviço dos atalhos.
 * @class
 */
export class ShortcutService {
  declare recording: any;

  constructor() {
    /** Enquanto o usuário grava um novo atalho, os atalhos do app não disparam. */
    this.recording = false;
  }

  /** Liga o despachante global. @returns {void} */
  init() {
    document.addEventListener(
      "keydown",
      (e) => {
        if (this.recording || e.repeat || e.isComposing) return;
        const combo = comboOf(e);
        if (!combo) return;
        const action = SHORTCUT_ACTIONS.find((a) => this.binding(a.id) === combo);
        if (!action) return;
        // Em campos de texto de janelas (ex.: formulários) só atalhos com Ctrl/Alt valem, e nunca os do editor já tratados
        e.preventDefault();
        e.stopPropagation();
        action.run();
      },
      true,
    );
  }

  /**
   * Atalho atual de uma ação (o personalizado ou o padrão; "" se o usuário o removeu).
   * @param {string} id - Id da ação.
   * @returns {string}
   */
  binding(id) {
    const custom = appSettings.get("shortcuts.custom") || {};
    if (id in custom) return custom[id];
    return SHORTCUT_ACTIONS.find((a) => a.id === id)?.default || "";
  }

  /**
   * Ação que já usa uma combinação.
   * @param {string} combo - Combinação.
   * @param {string} [exceptId] - Ação a ignorar.
   * @returns {Object|undefined}
   */
  owner(combo, exceptId) {
    return SHORTCUT_ACTIONS.find((a) => a.id !== exceptId && this.binding(a.id) === combo);
  }

  /**
   * Define o atalho de uma ação (validado).
   * @param {string} id - Id da ação.
   * @param {string} combo - Nova combinação ("" remove o atalho).
   * @returns {void}
   * @throws {Error} Se a combinação não pode ser usada.
   */
  set(id, combo) {
    if (combo) {
      const problem = checkCombo(combo, id, this);
      if (problem) throw new Error(problem);
    }
    const action = SHORTCUT_ACTIONS.find((a) => a.id === id);
    const custom = { ...(appSettings.get("shortcuts.custom") || {}) };
    if (action && combo === action.default) delete custom[id];
    else custom[id] = combo;
    appSettings.set("shortcuts.custom", custom);
  }

  /**
   * Volta uma ação ao atalho padrão.
   * @param {string} id - Id da ação.
   * @returns {void}
   */
  reset(id) {
    const custom = { ...(appSettings.get("shortcuts.custom") || {}) };
    delete custom[id];
    appSettings.set("shortcuts.custom", custom);
  }

  /** Volta todos os atalhos ao padrão. @returns {void} */
  resetAll() {
    appSettings.set("shortcuts.custom", {});
  }

  /**
   * Grava o próximo atalho digitado (usado pela tela de atalhos).
   * @returns {Promise<string|null>} Combinação digitada, ou null se cancelou com Esc.
   */
  capture() {
    return new Promise((resolve) => {
      this.recording = true;
      document.body.dataset.recordingShortcut = "1";
      const finish = (value) => {
        document.removeEventListener("keydown", onKey, true);
        // O Esc que cancelou não pode fechar a central junto
        setTimeout(() => {
          this.recording = false;
          delete document.body.dataset.recordingShortcut;
        }, 0);
        resolve(value);
      };
      const onKey = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") return finish(null);
        const combo = comboOf(e);
        if (combo) finish(combo);
      };
      document.addEventListener("keydown", onKey, true);
    });
  }
}
