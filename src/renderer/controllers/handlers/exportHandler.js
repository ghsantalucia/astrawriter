/**
 * @file Exportação do arquivo aberto no editor (Markdown, Word ou PDF) pelo botão "Exportar" da toolbar.
 */

import { marked } from "marked";
import DOMPurify from "dompurify";
import { uiBus } from "../../events/uiBus.js";

/** Nomes dos formatos nas mensagens ao usuário. */
const FORMAT_LABELS = { md: "Markdown", docx: "Word", pdf: "PDF" };

/**
 * HTML do texto para Word e PDF: links internos do livro (que não existem fora do app) viram texto simples.
 * @param {string} markdown - Texto em Markdown.
 * @returns {string}
 */
function toExportHtml(markdown) {
  const html = DOMPurify.sanitize(marked.parse(markdown, { gfm: true }));
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (!/^(https?:|mailto:)/i.test(href)) link.replaceWith(...link.childNodes);
  });
  return doc.body.innerHTML;
}

/**
 * Exporta o arquivo aberto no formato escolhido (o app pergunta onde salvar).
 * @param {{data: {format: "md"|"docx"|"pdf"}}} payload - Evento do botão do menu.
 * @param {Object} state - Estado global da aplicação.
 * @returns {Promise<void>}
 */
export async function onExportFile({ data }, state) {
  const format = data?.format;
  if (!state.currentFilePath || !state.editor) {
    uiBus.emit("toast:show", {
      message: "Abra um arquivo para exportar.",
      type: "info",
    });
    return;
  }

  const markdown = state.editor.getMarkdown();
  const title = state.currentFileMetadata?.title || "documento";

  try {
    const result = await window.electronAPI.exportFile({
      format,
      title,
      markdown,
      html: format === "md" ? "" : toExportHtml(markdown),
    });
    if (result?.canceled) return;
    if (!result?.success)
      throw new Error(result?.error || "Falha ao exportar.");
    uiBus.emit("toast:show", {
      message: `Arquivo exportado em ${FORMAT_LABELS[format]}.`,
      type: "success",
    });
  } catch (error) {
    uiBus.emit("toast:show", { message: error.message, type: "error" });
  }
}
