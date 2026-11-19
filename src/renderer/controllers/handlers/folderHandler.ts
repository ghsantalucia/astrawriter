// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Handler das pastas do usuário (criar, renomear, excluir) e da movimentação de arquivos por arrastar e soltar.
 */

import { uiBus } from "../../events/uiBus.js";
import { escapeHtml } from "../../utils/helpers.js";
import * as fileHandler from "./fileHandler.js";
import { onTreeChanged } from "./creationHandler.js";

/**
 * Atualiza a árvore do explorer e a lista de rascunhos após uma alteração de pastas/arquivos.
 * @param {Object} state - Estado global.
 * @param {Object} services - Serviços da aplicação.
 * @returns {Promise<void>}
 */
async function refresh(state, services) {
  await onTreeChanged(
    { bookPath: state.currentBookPath },
    state,
    services.book,
  );
  await fileHandler.handlePendingTempFiles(services.file);
}

/**
 * Abre um modal com um campo de texto e devolve o valor digitado ao confirmar.
 * @param {Object} params
 * @param {string} params.title - Título do modal.
 * @param {string} params.label - Rótulo do campo.
 * @param {string} [params.value=""] - Valor inicial.
 * @param {string} params.confirmLabel - Texto do botão de confirmação.
 * @param {(value: string) => Promise<void>} params.onConfirm - Executada ao confirmar.
 * @returns {void}
 */
function askName({ title, label, value = "", confirmLabel, onConfirm }) {
  uiBus.emit("modal:open", {
    id: "folder-name-modal",
    title,
    content: `<label class="modal-field"><span>${escapeHtml(label)}</span>
      <input type="text" class="modal-input" value="${escapeHtml(value)}" maxlength="60" autocomplete="off" /></label>`,
    buttons: [
      { text: "Cancelar", class: "btn-secondary" },
      {
        text: confirmLabel,
        class: "btn-primary",
        onClick: async (modal) => {
          const input = modal.element.querySelector(".modal-input");
          const text = input?.value.trim();
          if (!text) {
            input?.focus();
            return;
          }
          modal.close();
          await onConfirm(text);
        },
      },
    ],
    onMounted: (modal) => {
      const input = modal.element.querySelector(".modal-input");
      input?.focus();
      input?.select();
      input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter")
          modal.element.querySelector(".btn-primary")?.click();
      });
    },
  });
}

/**
 * Trata o pedido de nova pasta (botão da mini toolbar ou da pasta).
 * @param {{data?: {parent?: string}}} payload - Dados do botão (`parent`: pasta pai relativa ao livro).
 * @param {Object} state - Estado global.
 * @param {import('../../services/folderService.js').FolderService} folders - Serviço de pastas.
 * @param {Object} services - Serviços da aplicação.
 * @returns {void}
 */
export function onFolderCreate(payload, state, folders, services) {
  const parent = payload?.data?.parent || "notes";
  if (!folders.canCreateIn(parent)) {
    uiBus.emit("toast:show", {
      message: "Não é permitido criar pastas neste local.",
      type: "error",
    });
    return;
  }

  askName({
    title: "Nova pasta",
    label: "Nome da pasta",
    confirmLabel: "Criar pasta",
    onConfirm: async (name) => {
      try {
        await folders.createFolder(parent, name);
        await refresh(state, services);
        uiBus.emit("toast:show", {
          message: `Pasta "${name}" criada.`,
          type: "success",
        });
      } catch (error) {
        uiBus.emit("toast:show", { message: error.message, type: "error" });
      }
    },
  });
}

/**
 * Trata o pedido de renomear uma pasta do usuário.
 * @param {{data: {folder: string, title: string}}} payload - Dados do botão.
 * @param {Object} state - Estado global.
 * @param {import('../../services/folderService.js').FolderService} folders - Serviço de pastas.
 * @param {Object} services - Serviços da aplicação.
 * @returns {void}
 */
export function onFolderRename(payload, state, folders, services) {
  const { folder, title } = payload.data || {};
  askName({
    title: "Renomear pasta",
    label: "Novo nome",
    value: title || "",
    confirmLabel: "Renomear",
    onConfirm: async (name) => {
      try {
        await folders.renameFolder(folder, name);
        await refresh(state, services);
      } catch (error) {
        uiBus.emit("toast:show", { message: error.message, type: "error" });
      }
    },
  });
}

/**
 * Trata o pedido de excluir uma pasta do usuário: avisa sempre que os arquivos dentro dela também serão excluídos.
 * @param {{data: {folder: string}}} payload - Dados do botão.
 * @param {Object} state - Estado global.
 * @param {import('../../services/folderService.js').FolderService} folders - Serviço de pastas.
 * @param {Object} services - Serviços da aplicação.
 * @returns {Promise<void>}
 */
export async function onFolderDelete(payload, state, folders, services) {
  if (state.currentBookMetadata?.ai_lock || state.aiLockState) {
    uiBus.emit("toast:show", {
      message: "A IA está trabalhando neste livro. Aguarde para excluir.",
      type: "info",
    });
    return;
  }
  const rel = payload.data?.folder;
  let summary;
  try {
    summary = await folders.describeFolder(rel);
  } catch (error) {
    uiBus.emit("toast:show", { message: error.message, type: "error" });
    return;
  }

  uiBus.emit("modal:open", {
    id: "confirm-delete-folder-modal",
    title: "Excluir pasta?",
    content: `<p>A pasta <strong>${escapeHtml(summary.title)}</strong> será excluída.</p>
      <p><strong>Todos os arquivos e subpastas dentro dela também serão excluídos</strong> (${summary.files} ${summary.files === 1 ? "arquivo" : "arquivos"}${summary.drafts ? `, ${summary.drafts} rascunho(s) não sincronizado(s)` : ""}).</p>
      <p>A exclusão fica registrada no changelog do livro.</p>`,
    buttons: [
      { text: "Cancelar", class: "btn-secondary" },
      {
        text: "Excluir pasta",
        class: "btn-danger",
        onClick: async (modal) => {
          modal.close();
          try {
            await folders.deleteFolder(rel);
            await closeIfInside(state, rel);
            await refresh(state, services);
            uiBus.emit("toast:show", {
              message: `Pasta "${summary.title}" excluída.`,
              type: "success",
            });
          } catch (error) {
            await refresh(state, services);
            uiBus.emit("toast:show", { message: error.message, type: "error" });
          }
        },
      },
    ],
  });
}

/**
 * Se o arquivo aberto estava dentro da pasta excluída, limpa o editor.
 * @param {Object} state - Estado global.
 * @param {string} rel - Pasta excluída (relativa ao livro).
 * @returns {Promise<void>}
 */
async function closeIfInside(state, rel) {
  const book = state.currentBookPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const open = (state.currentFilePath || "").replace(/\\/g, "/");
  if (open.startsWith(`${book}/${rel}/`)) {
    state.currentFilePath = null;
    state.currentFileMetadata = {};
    uiBus.emit("editor:reset");
  }
}

/**
 * Trata o soltar de um arquivo sobre uma pasta (arrastar e soltar). Movimentos entre categorias diferentes são
 * recusados com um aviso.
 * @param {{file: string, dest: string}} payload - Arquivo (absoluto) e pasta de destino (relativa ao livro).
 * @param {Object} state - Estado global.
 * @param {import('../../services/folderService.js').FolderService} folders - Serviço de pastas.
 * @param {Object} services - Serviços da aplicação.
 * @returns {Promise<void>}
 */
export async function onFileMove({ file, dest }, state, folders, services) {
  if (state.currentBookMetadata?.ai_lock || state.aiLockState) {
    uiBus.emit("toast:show", {
      message:
        "A IA está trabalhando neste livro. Aguarde para mover arquivos.",
      type: "info",
    });
    return;
  }
  const book = state.currentBookPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const fileRel = file.replace(/\\/g, "/").slice(book.length + 1);
  const check = folders.checkMove(fileRel, dest);
  if (!check.ok) {
    uiBus.emit("toast:show", { message: check.reason, type: "error" });
    return;
  }

  try {
    const wasOpen =
      (state.currentFilePath || "")
        .replace(/\\/g, "/")
        .replace(/\.temp$/, "") === file.replace(/\\/g, "/");
    // Salva o que estiver pendente do arquivo aberto antes de mover
    const { to } = await folders.moveFile(file, dest);
    await refresh(state, services);
    if (wasOpen) uiBus.emit("editor:open-file", { path: to });
    uiBus.emit("toast:show", { message: "Arquivo movido.", type: "success" });
  } catch (error) {
    await refresh(state, services);
    uiBus.emit("toast:show", { message: error.message, type: "error" });
  }
}

/**
 * Trata o soltar de uma pasta do usuário sobre outra pasta (mesma regra de categoria dos arquivos).
 * @param {{folder: string, dest: string}} payload - Pasta movida e pasta de destino (relativas ao livro).
 * @param {Object} state - Estado global.
 * @param {import('../../services/folderService.js').FolderService} folders - Serviço de pastas.
 * @param {Object} services - Serviços da aplicação.
 * @returns {Promise<void>}
 */
export async function onFolderMove({ folder, dest }, state, folders, services) {
  if (state.currentBookMetadata?.ai_lock || state.aiLockState) {
    uiBus.emit("toast:show", {
      message: "A IA está trabalhando neste livro. Aguarde para mover pastas.",
      type: "info",
    });
    return;
  }
  const check = folders.checkFolderMove(folder, dest);
  if (!check.ok) {
    uiBus.emit("toast:show", { message: check.reason, type: "error" });
    return;
  }
  try {
    await folders.moveFolder(folder, dest);
    await closeIfInside(state, folder);
    await refresh(state, services);
    uiBus.emit("toast:show", { message: "Pasta movida.", type: "success" });
  } catch (error) {
    await refresh(state, services);
    uiBus.emit("toast:show", { message: error.message, type: "error" });
  }
}

/**
 * Bloqueia/libera a escrita da IA em todas as anotações (alterna `aiWrite` no `folder.yml` de `notes`; arquivos e
 * subpastas herdam).
 * @param {Object} state - Estado global.
 * @param {Object} services - Serviços da aplicação.
 * @returns {Promise<void>}
 */
export async function onToggleNotesAiWrite(state, services) {
  try {
    const allowed =
      state.currentBookMap?.folders?.notes?.metadata?.aiWrite === true;
    await services.folders.setFlag("notes", "aiWrite", !allowed);
    await refresh(state, services);
    uiBus.emit("toast:show", {
      message: allowed
        ? "A IA não pode mais alterar as anotações."
        : "A IA agora pode alterar as anotações.",
      type: "success",
    });
  } catch (error) {
    uiBus.emit("toast:show", { message: error.message, type: "error" });
  }
}
