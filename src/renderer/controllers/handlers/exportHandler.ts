// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Exportação do arquivo aberto no editor (Markdown, Word ou PDF) pelo botão "Exportar" da toolbar.
 */

import { marked } from "marked";
import DOMPurify from "dompurify";
import { uiBus } from "../../events/uiBus.js";
import { splitFrontmatter } from "../../utils/markdown.js";

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

/**
 * Capítulos do livro em ordem, com o texto mais recente (o rascunho `.temp`, se existir). Esboço e análise não entram.
 * @param {string} bookPath - Pasta do livro.
 * @returns {Promise<Array<{title: string, markdown: string, html: string}>>}
 */
export async function collectChapters(bookPath) {
  const root = `${bookPath.replace(/[\\/]+$/, "")}/content`;
  const dirs = (await window.electronAPI.listDir(root))
    .filter((e) => e.isDirectory && /^chapter_/i.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const chapters = [];
  for (const dir of dirs) {
    const draft = `${root}/${dir}/2_draft.md`;
    const raw = (await window.electronAPI.readFile(`${draft}.temp`)) ?? (await window.electronAPI.readFile(draft));
    if (raw === null || raw === undefined) continue;
    const meta = (await window.electronAPI.readFile(`${root}/${dir}/folder.yml`)) || "";
    const title = meta.match(/^title:\s*"?([^"\r\n]+?)"?\s*$/m)?.[1] || dir;
    const markdown = splitFrontmatter(raw).body.trim();
    chapters.push({ title, markdown, html: toExportHtml(markdown) });
  }
  return chapters;
}

/**
 * Exporta o livro (o app pergunta onde salvar).
 * @param {{kind: "project"|"chapters"|"single", format: "md"|"docx"|"pdf"}} options - O que e em que formato.
 * @param {string} bookPath - Pasta do livro.
 * @param {string} title - Título do livro.
 * @returns {Promise<{success: boolean, canceled?: boolean, count?: number}>}
 */
export async function exportBook({ kind, format }, bookPath, title) {
  const chapters = kind === "project" ? [] : await collectChapters(bookPath);
  const result = await window.electronAPI.exportBook({ kind, format, title, bookPath, chapters });
  if (!result?.success && !result?.canceled) throw new Error(result?.error || "Falha ao exportar o livro.");
  return result;
}
