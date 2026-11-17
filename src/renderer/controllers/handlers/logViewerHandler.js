/**
 * @file Handler dos visualizadores de logs da tela de configurações: o changelog do livro (lista corrida com
 * rolagem infinita, do registro mais recente para o mais antigo) e o log de erros da IA.
 */

import Handlebars from "handlebars";
import { uiBus } from "../../events/uiBus.js";
import { formatDateTime, toViewEntry } from "../../utils/changelogFormat.js";
import viewerTpl from "../../components/Modal/templates/changelogViewer.hbs?raw";
import rowsTpl from "../../components/Modal/templates/changelogRows.hbs?raw";
import errorLogTpl from "../../components/Modal/templates/aiErrorLog.hbs?raw";

/** Distância (px) do fim da lista a partir da qual o próximo arquivo de log é carregado. */
const LOAD_THRESHOLD = 120;

/**
 * Abre o modal com o changelog do livro atual. Ao rolar até o fim do arquivo de log carregado, o próximo arquivo
 * (mais antigo) é carregado automaticamente, até acabarem os arquivos.
 * @param {Object} state - Estado global da aplicação.
 * @param {import('../../services/changelogService.js').ChangelogService} changelog - Serviço do changelog.
 * @returns {void}
 */
export function onChangelogViewerOpen(state, changelog) {
  if (!state.currentBookPath) {
    uiBus.emit("toast:show", {
      message: "Selecione um livro para ver o changelog.",
      type: "info",
    });
    return;
  }

  uiBus.emit("settings:close");
  uiBus.emit("modal:open", {
    id: "changelog-viewer-modal",
    title: "Changelog do livro",
    content: Handlebars.compile(viewerTpl)({}),
    windowClass: "modal-log",
    buttons: [{ text: "Fechar", class: "btn-secondary" }],
    onMounted: (modal) => mountChangelogList(modal.element, changelog),
  });
}

/**
 * Liga a lista do changelog ao seu contêiner: carrega o arquivo de log mais recente e, conforme o usuário rola,
 * os mais antigos.
 * @param {HTMLElement} root - Elemento do modal.
 * @param {import('../../services/changelogService.js').ChangelogService} changelog - Serviço do changelog.
 * @returns {void}
 */
function mountChangelogList(root, changelog) {
  const scroll = root.querySelector("#changelog-scroll");
  const list = root.querySelector("#changelog-list");
  const status = root.querySelector("#changelog-status");
  const render = Handlebars.compile(rowsTpl);

  let nextFile = null;
  let started = false;
  let done = false;
  let loading = false;

  const loadMore = async () => {
    if (loading || done) return;
    loading = true;
    status.textContent = "Carregando…";

    const page = await changelog.getPage(started ? nextFile : null);
    started = true;

    if (page.file === null) {
      done = true;
      status.textContent = "Nenhum registro ainda.";
    } else {
      list.insertAdjacentHTML(
        "beforeend",
        render({ entries: page.entries.map(toViewEntry) }),
      );
      nextFile = page.older;
      if (!nextFile) {
        done = true;
        status.textContent = "Fim do histórico.";
      } else {
        status.textContent = "";
      }
    }
    loading = false;

    // Se o conteúdo carregado ainda não preenche a área visível, continua carregando
    if (!done && scroll.scrollHeight <= scroll.clientHeight + LOAD_THRESHOLD) {
      loadMore();
    }
  };

  scroll.addEventListener("scroll", () => {
    const remaining =
      scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight;
    if (remaining < LOAD_THRESHOLD) loadMore();
  });

  loadMore();
}

/**
 * Abre o modal com o log de erros retornados pela IA.
 * @returns {Promise<void>}
 */
export async function onAiErrorLogOpen() {
  uiBus.emit("settings:close");

  const raw = (await window.electronAPI.readAiErrorLog()) || [];
  const entries = raw.map((e) => ({
    time: formatDateTime(e.ts),
    provider: e.provider,
    model: e.model,
    status: e.status,
    message: e.message,
    details: e.details,
  }));

  uiBus.emit("modal:open", {
    id: "ai-error-log-modal",
    title: "Log de erros da IA",
    content: Handlebars.compile(errorLogTpl)({ entries }),
    windowClass: "modal-log",
    buttons: [
      {
        text: "Limpar log",
        class: "btn-danger",
        // Pede confirmação (por cima do log) antes de apagar
        onClick: (logModal) => {
          if (entries.length === 0) {
            uiBus.emit("toast:show", {
              message: "O log de erros já está vazio.",
              type: "info",
            });
            return;
          }
          uiBus.emit("modal:open", {
            id: "confirm-clear-ai-log-modal",
            title: "Limpar o log de erros da IA?",
            content: `<p>Todos os <strong>${entries.length} ${entries.length === 1 ? "registro" : "registros"}</strong> do log de erros da IA serão apagados.</p>
              <p>Esta ação não pode ser desfeita.</p>`,
            buttons: [
              { text: "Cancelar", class: "btn-secondary" },
              {
                text: "Limpar log",
                class: "btn-danger",
                onClick: async (confirmModal) => {
                  confirmModal.close();
                  await window.electronAPI.clearAiErrorLog();
                  logModal.close();
                  uiBus.emit("toast:show", {
                    message: "Log de erros da IA limpo.",
                    type: "success",
                  });
                },
              },
            ],
          });
        },
      },
      { text: "Fechar", class: "btn-secondary" },
    ],
  });
}
