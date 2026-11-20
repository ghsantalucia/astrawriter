// @ts-nocheck
/**
 * @file Tecla Esc global: fecha, um por vez, a camada aberta mais acima (gaveta de configurações, janela/modal, central ou
 * gaveta do chat). Funciona como o "X" da camada; janelas que obrigam uma decisão (modal sem "X") não fecham com Esc, e
 * enquanto uma delas estiver aberta o Esc não fecha nada por baixo dela. Menus e painéis pequenos (dropdowns, menu de
 * exportar, localizar e substituir, links) tratam o próprio Esc e têm prioridade.
 */

import { uiBus } from "../events/uiBus.js";

/** Elementos cujo Esc é tratado por eles mesmos (o primeiro Esc fecha só eles). */
const OWN_ESCAPE = ".dropdown.open, .export-menu:not(.hidden), .central-switcher:not(.hidden), .find-replace, .link-popup, .writing-menu, .tag-suggest";

/**
 * Liga a tecla Esc global.
 * @param {Object} deps
 * @param {{activeModals: Array<Object>}} deps.modalManager - Gerenciador da pilha de modais.
 * @returns {void}
 */
export function setupEscapeKey({ modalManager }) {
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
      // Gravando um novo atalho: o Esc só cancela a gravação
      if (document.body.dataset.recordingShortcut) return;
      // Menus e painéis que tratam o próprio Esc
      if (document.querySelector(".dropdown.open, .export-menu:not(.hidden), .central-switcher:not(.hidden)")) return;
      if (e.target?.closest?.(OWN_ESCAPE)) return;

      const consume = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      // 1. Gaveta de configurações (fica acima dos modais)
      if (document.getElementById("settings-container")?.classList.contains("open")) {
        consume();
        uiBus.emit("settings:close");
        return;
      }

      // 2. Modal do topo da pilha (um modal sem "X" obriga o autor a decidir: o Esc não faz nada)
      const top = modalManager?.activeModals?.[modalManager.activeModals.length - 1];
      if (top) {
        consume();
        if (top.modalConfig?.closable !== false) top.close();
        return;
      }

      // 3. Central aberta
      const central = document.getElementById("central-overlay");
      if (central && !central.classList.contains("hidden")) {
        consume();
        uiBus.emit("central:close");
        return;
      }

      // 4. Gaveta do chat (só se o foco não estiver escrevendo no editor)
      if (document.getElementById("chat-container")?.classList.contains("expanded") && !e.target?.closest?.("#markdown-editor")) {
        consume();
        document.activeElement?.blur?.();
        uiBus.emit("ai-chat:toggle");
        uiBus.emit("explorer:keyboard-restore");
      }
    },
    true,
  );
}
