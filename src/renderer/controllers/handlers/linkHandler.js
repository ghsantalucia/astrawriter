/**
 * @file Handler do "Linkar termos": procura, no texto do arquivo aberto, os nomes e apelidos das fichas do livro e
 * pede ao editor para transformá-los em links internos (marcados como automáticos até a sincronização).
 */

import { uiBus } from "../../events/uiBus.js";
import { buildAutoLinkTerms, flattenBookTree } from "../../utils/bookFiles.js";
import { normalizePath } from "../../utils/helpers.js";

/**
 * Trata o clique no botão "Linkar termos".
 * @param {Object} state - Estado global da aplicação.
 * @returns {void}
 */
export function onAutoLink(state) {
  if (!state.currentFilePath || !state.currentBookPath) {
    uiBus.emit("toast:show", {
      message: "Abra um arquivo para linkar os termos.",
      type: "info",
    });
    return;
  }
  if (!state.currentFileMetadata?.humanWrite || state.aiLockState) {
    uiBus.emit("toast:show", {
      message: "Este arquivo está somente leitura no momento.",
      type: "info",
    });
    return;
  }

  const book = normalizePath(state.currentBookPath).replace(/\/+$/, "");
  const current = normalizePath(state.currentFilePath)
    .replace(/\.temp$/, "")
    .slice(book.length + 1);

  const files = flattenBookTree(state.currentBookMap, state.currentBookPath);
  const terms = buildAutoLinkTerms(files, current);

  if (terms.length === 0) {
    uiBus.emit("toast:show", {
      message:
        "O livro ainda não tem fichas (personagens, locais...) para linkar.",
      type: "info",
    });
    return;
  }

  uiBus.emit("editor:apply-autolinks", { terms });
}
