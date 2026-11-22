/**
 * @file Importar livro de um arquivo (Word, LibreOffice, PDF, texto): o processo principal extrai título e capítulos; aqui o autor
 * revisa o que foi identificado (renomeia, junta com o anterior ou remove capítulos errados) e segue o assistente de criação de
 * livro normalmente (com o título já preenchido). Quando o livro é criado, os capítulos são gravados nele.
 */

import { uiBus } from "../../events/uiBus.js";
import { escapeHtml as esc } from "../../utils/helpers.js";
import * as creationHandler from "./creationHandler.js";

/** Palavras de um texto. */
const words = (text) => String(text || "").split(/\s+/).filter(Boolean).length;

/**
 * Escolhe o arquivo, extrai os capítulos e abre a tela de revisão.
 * @param {Object} state - Estado global.
 * @param {Object} creationHandlerApi - Módulo `creationHandler` (não usado; mantido pela assinatura do roteador).
 * @param {Object} creationService - Serviço de criação.
 * @returns {Promise<void>}
 */
export async function startImportFromFile(state, creationHandlerApi, creationService) {
  const result = await window.electronAPI.extractBookFile();
  if (result?.canceled) return;
  if (!result?.success) {
    uiBus.emit("toast:show", { message: result?.error || "Não foi possível ler o arquivo.", type: "error" });
    return;
  }
  openReview(state, creationService, result);
}

/**
 * Janela de revisão: título do livro e lista de capítulos editável.
 * @param {Object} state - Estado global.
 * @param {Object} creationService - Serviço de criação.
 * @param {{title: string, chapters: Array<Object>, warnings: string[], format: string}} result - Extração.
 * @returns {void}
 * @private
 */
export function openReview(state, creationService, result) {
  let chapters = result.chapters.map((c) => ({ title: c.title, text: c.text }));
  const rows = () =>
    chapters
      .map(
        (c, i) => `<div class="imp-row" data-i="${i}">
          <span class="imp-n">${i + 1}</span>
          <input class="cn-input imp-ctitle" data-i="${i}" value="${esc(c.title)}" aria-label="Título do capítulo ${i + 1}" />
          <span class="imp-words">${words(c.text).toLocaleString("pt-BR")} palavras</span>
          <button type="button" class="cn-btn small ghost" data-imp="merge" data-i="${i}" ${i === 0 ? "disabled" : ""} title="Juntar ao capítulo anterior (o texto é mantido)"><i class="fa-solid fa-turn-up"></i></button>
          <button type="button" class="cn-btn small ghost" data-imp="del" data-i="${i}" title="Remover este capítulo (o texto dele é descartado)"><i class="fa-regular fa-trash-can"></i></button>
        </div>`,
      )
      .join("");
  const summary = () => {
    const total = chapters.reduce((n, c) => n + words(c.text), 0);
    return `${chapters.length} ${chapters.length === 1 ? "capítulo" : "capítulos"} · ${total.toLocaleString("pt-BR")} palavras`;
  };
  const paint = () => {
    const list = document.getElementById("imp-list");
    if (list) list.innerHTML = rows();
    const sum = document.getElementById("imp-summary");
    if (sum) sum.textContent = summary();
  };

  const onClick = (e) => {
    const btn = e.target.closest?.("[data-imp]");
    if (!btn || !document.getElementById("imp-list")) return;
    const i = Number(btn.dataset.i);
    if (btn.dataset.imp === "del") chapters.splice(i, 1);
    else if (btn.dataset.imp === "merge" && i > 0) {
      chapters[i - 1].text = `${chapters[i - 1].text}\n\n## ${chapters[i].title}\n\n${chapters[i].text}`.trim();
      chapters.splice(i, 1);
    }
    paint();
  };
  const onInput = (e) => {
    const input = e.target.closest?.(".imp-ctitle");
    if (input) chapters[Number(input.dataset.i)].title = input.value;
  };
  const cleanup = () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("input", onInput, true);
  };
  document.addEventListener("click", onClick, true);
  document.addEventListener("input", onInput, true);

  uiBus.emit("modal:open", {
    id: "import-file-modal",
    title: "Importar livro de um arquivo",
    windowClass: "modal-wide",
    content: `<div class="imp-box">
      <label class="cn-field"><span>Título do livro</span><input id="imp-title" class="cn-input" value="${esc(result.title)}" /></label>
      <p class="cit-hint">Extraí os capítulos do arquivo (.${esc(result.format)}) pelos títulos. <strong>Confira</strong>: renomeie, junte com o anterior ou remova o que foi identificado errado. Depois você segue o assistente de criação de livro normalmente.</p>
      ${result.warnings?.length ? `<p class="imp-warn"><i class="fa-solid fa-triangle-exclamation"></i> ${result.warnings.map(esc).join(" ")}</p>` : ""}
      <p id="imp-summary" class="imp-summary">${esc(summary())}</p>
      <div id="imp-list" class="imp-list">${rows()}</div>
    </div>`,
    onClose: cleanup,
    buttons: [
      { text: "Cancelar", class: "btn-secondary", onClick: (modal) => (cleanup(), modal.close()) },
      {
        text: "Continuar para a criação do livro",
        class: "btn-primary",
        onClick: (modal) => {
          const title = ((document.getElementById("imp-title") as HTMLInputElement | null)?.value || "").trim();
          const kept = chapters.map((c) => ({ title: c.title.trim() || "Sem título", text: c.text })).filter((c) => c.text || c.title);
          if (!title) return uiBus.emit("toast:show", { message: "Dê um título ao livro.", type: "error" });
          if (kept.length === 0) return uiBus.emit("toast:show", { message: "O livro precisa de pelo menos um capítulo.", type: "error" });
          state.pendingImport = { title, chapters: kept };
          cleanup();
          modal.close();
          creationHandler.onCreateRequested({ kind: "book", prefill: { book_title: title } }, state, creationService);
        },
      },
    ],
  });
}

/**
 * Livro criado pelo assistente: se havia uma importação pendente, grava os capítulos nele e abre o livro.
 * @param {{kind?: string, bookPath?: string}} payload - Livro criado (`book:created`).
 * @param {Object} state - Estado global.
 * @param {Object} creationService - Serviço de criação.
 * @returns {Promise<void>}
 */
export async function finishPendingImport(payload, state, creationService) {
  const pending = state.pendingImport;
  if (!pending || !payload?.bookPath) return;
  state.pendingImport = null;
  try {
    const count = await creationService.importChapters(payload.bookPath, pending.chapters);
    uiBus.emit("book:selected", payload.bookPath);
    uiBus.emit("toast:show", { message: `Livro importado: ${count} ${count === 1 ? "capítulo gravado" : "capítulos gravados"}.`, type: "success" });
  } catch (error) {
    uiBus.emit("toast:show", { message: `O livro foi criado, mas a importação dos capítulos falhou: ${error.message}`, type: "error" });
  }
}
