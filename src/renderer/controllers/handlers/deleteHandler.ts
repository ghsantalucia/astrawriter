// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Handler da exclusão de arquivos (anotações e fichas do mundo) e de capítulos inteiros a partir do explorer:
 * pede a confirmação, executa a exclusão e atualiza editor, rascunhos pendentes, estado do livro e árvore.
 */

import { uiBus } from "../../events/uiBus.js";
import { normalizePath } from "../../utils/helpers.js";
import { parseMarkdown } from "../../utils/markdown.js";
import { canDeleteFile, chapterNumber } from "../../utils/deletePermission.js";
import * as fileHandler from "./fileHandler.js";
import { onTreeChanged } from "./creationHandler.js";

/**
 * Escapa texto para uso seguro em HTML.
 * @param {string} text - Texto original.
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

/**
 * Verifica se o livro está livre para exclusões (a IA trabalhando trava o projeto).
 * @param {Object} state - Estado global.
 * @returns {boolean}
 */
function ensureUnlocked(state) {
  if (state.currentBookMetadata?.ai_lock || state.aiLockState) {
    uiBus.emit("toast:show", {
      message: "A IA está trabalhando neste livro. Aguarde para excluir.",
      type: "info",
    });
    return false;
  }
  return true;
}

/**
 * Trata o clique no botão de excluir de um arquivo: valida a permissão e abre a confirmação.
 * @param {{data: {path: string}}} payload - Dados do botão (caminho absoluto do arquivo).
 * @param {Object} state - Estado global.
 * @param {import('../../services/deletionService.js').DeletionService} deletion - Serviço de exclusão.
 * @param {Object} services - Serviços da aplicação.
 * @returns {Promise<void>}
 */
export async function onFileDeleteRequest(payload, state, deletion, services) {
  if (!ensureUnlocked(state)) return;

  const path = normalizePath(payload.data?.path);
  const book = normalizePath(state.currentBookPath).replace(/\/+$/, "");
  const rel = path.slice(book.length + 1);

  const text = await window.electronAPI.readFile(path);
  if (text === null) return;
  const { metadata } = parseMarkdown(text);

  if (!canDeleteFile(metadata, rel, "user")) {
    uiBus.emit("toast:show", {
      message: "Este arquivo não pode ser excluído.",
      type: "error",
    });
    return;
  }

  const title = metadata.title || path.split("/").pop();
  const hasDraft = (await window.electronAPI.readFile(`${path}.temp`)) !== null;

  uiBus.emit("modal:open", {
    id: "confirm-delete-file-modal",
    title: "Excluir arquivo?",
    content: `<p>O arquivo <strong>${escapeHtml(title)}</strong> será excluído.</p>
      ${hasDraft ? "<p>O rascunho não sincronizado dele também será apagado.</p>" : ""}
      <p>A exclusão fica registrada no changelog do livro.</p>`,
    buttons: [
      { text: "Cancelar", class: "btn-secondary" },
      {
        text: "Excluir",
        class: "btn-danger",
        onClick: async (modal) => {
          modal.close();
          try {
            await deletion.deleteFile(path);
            await afterDeletion({ state, services, deletedPath: path });
            uiBus.emit("toast:show", {
              message: `"${title}" excluído.`,
              type: "success",
            });
          } catch (error) {
            uiBus.emit("toast:show", {
              message: `Não foi possível excluir: ${error.message}`,
              type: "error",
            });
          }
        },
      },
    ],
  });
}

/**
 * Trata o clique no botão de excluir de um capítulo: abre a confirmação com o resumo do que será apagado e
 * renumerado.
 * @param {{data: {folder: string, title: string}}} payload - Dados do botão (pasta do capítulo e título exibido).
 * @param {Object} state - Estado global.
 * @param {import('../../services/deletionService.js').DeletionService} deletion - Serviço de exclusão.
 * @param {Object} services - Serviços da aplicação.
 * @returns {Promise<void>}
 */
export async function onChapterDeleteRequest(
  payload,
  state,
  deletion,
  services,
) {
  if (!ensureUnlocked(state)) return;

  const folderName = payload.data?.folder;
  const title = payload.data?.title || folderName;
  if (chapterNumber(folderName) === null) return;

  let summary;
  try {
    summary = await deletion.describeChapterDeletion(folderName);
  } catch (error) {
    uiBus.emit("toast:show", { message: error.message, type: "error" });
    return;
  }

  const renumber = summary.renumbered.length
    ? `<p>Os capítulos seguintes serão renumerados para não ficar nenhum buraco (${summary.renumbered
        .map(
          (r) =>
            `${String(r.from).padStart(2, "0")} → ${String(r.to).padStart(2, "0")}`,
        )
        .join(", ")}).</p>`
    : "";

  uiBus.emit("modal:open", {
    id: "confirm-delete-chapter-modal",
    title: "Excluir capítulo?",
    content: `<p>O capítulo <strong>${escapeHtml(title)}</strong> será excluído com <strong>todos os arquivos e subpastas</strong> (${summary.files} ${summary.files === 1 ? "arquivo" : "arquivos"}).</p>
      ${summary.drafts ? `<p>${summary.drafts} ${summary.drafts === 1 ? "rascunho não sincronizado será apagado" : "rascunhos não sincronizados serão apagados"} junto.</p>` : ""}
      ${renumber}
      <p>A exclusão e os ajustes feitos pelo sistema ficam registrados no changelog do livro.</p>`,
    buttons: [
      { text: "Cancelar", class: "btn-secondary" },
      {
        text: "Excluir capítulo",
        class: "btn-danger",
        onClick: async (modal) => {
          modal.close();
          try {
            const result = await deletion.deleteChapter(folderName);
            await afterDeletion({
              state,
              services,
              deletedPath: `${normalizePath(state.currentBookPath)}/content/${folderName}`,
              renumbered: result.renumbered,
            });
            uiBus.emit("toast:show", {
              message: `"${title}" excluído.`,
              type: "success",
            });
          } catch (error) {
            // Mesmo com falha parcial, a árvore precisa refletir o que aconteceu no disco
            await afterDeletion({ state, services, renumbered: [] });
            uiBus.emit("toast:show", {
              message: `Não foi possível excluir: ${error.message}`,
              type: "error",
            });
          }
        },
      },
    ],
  });
}

/**
 * Atualiza a interface depois de uma exclusão: arquivo aberto, estado do explorer persistido, rascunhos pendentes e
 * árvore de arquivos.
 * @param {Object} params
 * @param {Object} params.state - Estado global.
 * @param {Object} params.services - Serviços da aplicação.
 * @param {string} [params.deletedPath] - Arquivo ou pasta excluídos (caminho absoluto).
 * @param {Array<{from: string, to: string}>} [params.renumbered] - Pastas de capítulo renumeradas.
 * @returns {Promise<void>}
 */
async function afterDeletion({
  state,
  services,
  deletedPath,
  renumbered = [],
}) {
  const book = normalizePath(state.currentBookPath).replace(/\/+$/, "");
  const content = `${book}/content`;
  const deleted = deletedPath ? normalizePath(deletedPath) : null;
  const open = state.currentFilePath
    ? normalizePath(state.currentFilePath).replace(/\.temp$/, "")
    : null;

  // Arquivo aberto: foi excluído (limpa o editor) ou mudou de pasta (reabre no novo caminho)
  let reopen = null;
  if (open && deleted && (open === deleted || open.startsWith(`${deleted}/`))) {
    state.currentFilePath = null;
    state.currentFileMetadata = {};
    uiBus.emit("editor:reset");
  } else if (open) {
    const mapping = renumbered.find((r) =>
      open.startsWith(`${content}/${r.from}/`),
    );
    if (mapping) {
      reopen = open.replace(
        `${content}/${mapping.from}/`,
        `${content}/${mapping.to}/`,
      );
    }
  }

  // O estado do explorer salvo no config.json acompanha as pastas renumeradas
  const explorer = state.currentBookMetadata?.explorer_state;
  if (explorer) {
    const bookName = book.split("/").pop();
    const remap = (value) => {
      let result = normalizePath(value);
      for (const { from, to } of renumbered) {
        result = result
          .replace(`/content/${from}`, `/content/${to}`)
          .replace(`${bookName}/content/${from}`, `${bookName}/content/${to}`);
      }
      return result;
    };
    if (Array.isArray(explorer.open_folders)) {
      explorer.open_folders = explorer.open_folders
        .filter(
          (p) =>
            !deleted || !normalizePath(p).endsWith(deleted.slice(book.length)),
        )
        .map(remap);
    }
    if (explorer.open_file) {
      explorer.open_file =
        deleted && normalizePath(explorer.open_file).startsWith(deleted)
          ? null
          : remap(explorer.open_file);
    }
    services.book.updateConfig?.();
  }

  await onTreeChanged({ bookPath: book }, state, services.book);
  await fileHandler.handlePendingTempFiles(services.file);
  if (reopen) uiBus.emit("editor:open-file", { path: reopen });
}

/**
 * Atualiza a interface depois de uma alteração de estrutura feita pela IA (pasta criada, arquivo ou pasta movidos ou
 * excluídos, versão restaurada): explorer, rascunhos e o arquivo aberto no editor.
 * @param {{deletedPath?: string, movedFrom?: string, movedTo?: string, restoredPath?: string}} payload - O que mudou.
 * @param {Object} state - Estado global.
 * @param {Object} services - Serviços da aplicação.
 * @returns {Promise<void>}
 */
export async function onStructureChanged(payload, state, services) {
  if (!state.currentBookPath) return;
  const { deletedPath, movedFrom, movedTo, restoredPath } = payload || {};
  const open = state.currentFilePath
    ? normalizePath(state.currentFilePath).replace(/\.temp$/, "")
    : null;

  // Arquivo (ou pasta) aberto que mudou de lugar: reabre no novo caminho
  let reopen = null;
  if (open && movedFrom && movedTo) {
    const from = normalizePath(movedFrom);
    if (open === from || open.startsWith(`${from}/`)) {
      reopen = normalizePath(movedTo) + open.slice(from.length);
      state.currentFilePath = null;
      state.currentFileMetadata = {};
      uiBus.emit("editor:reset");
    }
  }

  await afterDeletion({ state, services, deletedPath });
  if (reopen) uiBus.emit("editor:open-file", { path: reopen });

  // Versão restaurada: recarrega o arquivo se ele está aberto
  if (restoredPath && open === normalizePath(restoredPath)) {
    uiBus.emit("toolbar:save-status", "hidden");
    uiBus.emit("editor:open-file", { path: open });
  }
}
