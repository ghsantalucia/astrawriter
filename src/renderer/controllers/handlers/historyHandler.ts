/**
 * @file Handler do histórico de versões de um arquivo (botão "Histórico" da toolbar): lista as versões registradas no
 * changelog, mostra a comparação lado a lado e restaura uma versão anterior (o conteúdo guardado das versões
 * posteriores é apagado, mas o registro delas permanece no changelog).
 */

import Handlebars from "handlebars";
import { uiBus } from "../../events/uiBus.js";
import { domainBus } from "../../events/domainBus.js";
import { normalizePath } from "../../utils/helpers.js";
import { toViewEntry } from "../../utils/changelogFormat.js";
import { buildComparison } from "../../utils/historyCompare.js";
import historyTpl from "../../components/Modal/templates/history.hbs?raw";
import compareTpl from "../../components/Modal/templates/historyCompare.hbs?raw";
import * as fileHandler from "./fileHandler.js";
import { onTreeChanged } from "./creationHandler.js";
import { t } from "../../../shared/i18n.js";

/**
 * Abre o modal com o histórico de versões do arquivo aberto no editor.
 * @param {Object} state - Estado global da aplicação.
 * @param {import('../../services/changelogService.js').ChangelogService} changelog - Serviço do changelog.
 * @param {Object} services - Serviços da aplicação (usados na restauração).
 * @returns {Promise<void>}
 */
export async function onHistoryOpen(state, changelog, services) {
  if (!state.currentFilePath) {
    uiBus.emit("toast:show", {
      message: t("Abra um arquivo para ver o histórico."),
      type: "info",
    });
    return;
  }

  const filePath = normalizePath(state.currentFilePath).replace(/\.temp$/, "");
  const fileTitle =
    state.currentFileMetadata?.title || filePath.split("/").pop();

  const history = await changelog.getFileHistory(filePath);
  const entries = history.entries.map((entry) => ({
    ...toViewEntry(entry),
    isCurrent: Boolean(entry.isCurrent) && entry.action !== "delete",
    canRestore: !entry.isCurrent && entry.action !== "delete",
  }));
  const restoredFrom = history.restoredFrom
    ? toViewEntry(history.restoredFrom)
    : null;

  uiBus.emit("modal:open", {
    id: "file-history-modal",
    title: t("Histórico — {title}", { title: fileTitle }),
    content: Handlebars.compile(historyTpl)({
      fileTitle,
      entries,
      restoredFrom,
    }),
    windowClass: "modal-log",
    buttons: [{ text: t("Fechar"), class: "btn-secondary" }],
    onMounted: (historyModal) => {
      historyModal.element.addEventListener("click", (e) => {
        const button = e.target.closest(".btn-history-restore");
        if (!button) return;

        const entryId = Number(button.dataset.entryId);
        openCompare({
          historyModal,
          filePath,
          fileTitle,
          entry: entries.find((item) => item.id === entryId),
          state,
          changelog,
          services,
        });
      });
    },
  });
}

/**
 * Abre a comparação lado a lado (versão atual × versão escolhida, apenas leitura, com Markdown interpretado), com o
 * aviso de que restaurar apaga o conteúdo das versões posteriores. "Cancelar" volta ao modal do histórico.
 * @param {Object} params
 * @param {Object} params.historyModal - Modal do histórico (que fica por baixo).
 * @param {string} params.filePath - Caminho do arquivo oficial.
 * @param {string} params.fileTitle - Título do arquivo.
 * @param {Object} params.entry - Versão escolhida (já formatada para exibição).
 * @param {Object} params.state - Estado global.
 * @param {import('../../services/changelogService.js').ChangelogService} params.changelog - Serviço do changelog.
 * @param {Object} params.services - Serviços da aplicação.
 * @returns {Promise<void>}
 */
async function openCompare({
  historyModal,
  filePath,
  fileTitle,
  entry,
  state,
  changelog,
  services,
}) {
  const preview = await changelog.preview(filePath, entry.id);
  if (!preview?.success) {
    uiBus.emit("toast:show", {
      message: t("Não foi possível carregar a versão: {error}", { error: preview?.error || t("erro desconhecido") }),
      type: "error",
    });
    return;
  }

  const hasDraft =
    (await window.electronAPI.readFile(`${filePath}.temp`)) !== null;
  const comparison = buildComparison(preview.current, preview.content);

  uiBus.emit("modal:open", {
    id: "history-compare-modal",
    title: t("Restaurar versão — {title}", { title: fileTitle }),
    content: Handlebars.compile(compareTpl)({
      ...comparison,
      versionTitle:
        entry.action === "original"
          ? t("Versão original (antes do primeiro registro)")
          : t("Versão de {time}", { time: entry.time }),
      actorLabel: entry.actorLabel,
      actorClass: entry.actorClass,
      hasDraft,
    }),
    windowClass: "modal-wide",
    buttons: [
      // Cancelar apenas fecha este modal: o do histórico, que estava por baixo, volta a aparecer
      { text: t("Cancelar"), class: "btn-secondary" },
      {
        text: t("Restaurar esta versão"),
        class: "btn-danger",
        onClick: async (compareModal) => {
          const done = await performRestore({
            filePath,
            fileTitle,
            entryId: entry.id,
            state,
            services,
          });
          if (done) {
            compareModal.close();
            historyModal.close();
          }
        },
      },
    ],
  });
}

/**
 * Restaura o arquivo e atualiza a interface (editor, rascunhos pendentes e árvore).
 * @param {Object} params
 * @param {string} params.filePath - Caminho do arquivo oficial.
 * @param {string} params.fileTitle - Título do arquivo.
 * @param {number} params.entryId - Registro da versão a restaurar.
 * @param {Object} params.state - Estado global.
 * @param {Object} params.services - Serviços da aplicação.
 * @returns {Promise<boolean>} Se a restauração foi concluída.
 */
async function performRestore({
  filePath,
  fileTitle,
  entryId,
  state,
  services,
}) {
  const result = await services.changelog.restore(filePath, entryId);

  if (!result?.success) {
    uiBus.emit("toast:show", {
      message: t("Não foi possível restaurar: {error}", { error: result?.error || t("erro desconhecido") }),
      type: "error",
    });
    return false;
  }

  // Recarrega o arquivo no editor e atualiza rascunhos pendentes e árvore do explorer
  uiBus.emit("toolbar:save-status", "hidden");
  uiBus.emit("editor:open-file", { path: filePath });
  await fileHandler.handlePendingTempFiles(services.file);
  await onTreeChanged(
    { bookPath: state.currentBookPath },
    state,
    services.book,
  );

  const payload = { path: filePath, entryId, removed: result.removed };
  uiBus.emit("file:restored", payload);
  domainBus.emit("file:restored", payload);

  uiBus.emit("toast:show", {
    message: t("\"{title}\" restaurado.", { title: fileTitle }),
    type: "success",
  });
  return true;
}
