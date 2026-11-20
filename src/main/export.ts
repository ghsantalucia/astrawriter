// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Exportação do arquivo aberto no editor para Markdown, Word (.docx) e PDF. O PDF é gerado pelo próprio Chromium do
 * Electron (impressão de uma janela invisível); o Word usa a biblioteca html-to-docx a partir do HTML do texto.
 */

import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, dialog } from "electron";
const htmlToDocx = require("html-to-docx");
const JSZip = require("jszip");

/** Formatos aceitos: extensão e filtro do diálogo de salvar. */
const FORMATS = {
  md: { ext: "md", label: "Markdown" },
  docx: { ext: "docx", label: "Documento do Word" },
  pdf: { ext: "pdf", label: "PDF" },
};

/**
 * Nome de arquivo seguro a partir do título.
 * @param {string} title - Título do arquivo.
 * @returns {string}
 */
function safeName(title) {
  const clean = String(title || "documento")
    .replace(/[\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.slice(0, 80) || "documento";
}

/**
 * Escapa texto para HTML.
 * @param {string} text - Texto.
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

/**
 * Documento HTML completo, com estilo de impressão (usado no PDF e no Word).
 * @param {string} title - Título.
 * @param {string} body - HTML do texto.
 * @returns {string}
 */
function buildHtml(title, body) {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; font-size: 12pt; line-height: 1.6; color: #1b1b1f; }
  h1 { font-size: 22pt; margin: 0 0 14pt; }
  h2 { font-size: 16pt; margin: 18pt 0 8pt; }
  h3 { font-size: 13pt; margin: 14pt 0 6pt; }
  p { margin: 0 0 9pt; text-align: justify; }
  blockquote { margin: 8pt 0; padding: 2pt 12pt; border-left: 3px solid #bbb; color: #555; }
  code { font-family: Consolas, monospace; font-size: 10.5pt; background: #f1f1f1; padding: 0 3pt; }
  pre { background: #f5f5f5; padding: 8pt; white-space: pre-wrap; }
  table { border-collapse: collapse; margin: 8pt 0; }
  th, td { border: 1px solid #999; padding: 4pt 8pt; }
  hr { border: none; border-top: 1px solid #bbb; margin: 14pt 0; }
  img { max-width: 100%; }
</style></head><body>${body}</body></html>`;
}

/**
 * Gera o PDF imprimindo o HTML em uma janela invisível (sem JavaScript).
 * @param {string} html - Documento HTML.
 * @returns {Promise<Buffer>}
 */
async function renderPdf(html) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true },
  });
  try {
    await win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
    return await win.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      margins: { top: 0.9, bottom: 0.9, left: 0.9, right: 0.9 },
    });
  } finally {
    win.destroy();
  }
}

/**
 * Pergunta onde salvar e exporta o documento.
 * @param {import('electron').BrowserWindow} parent - Janela principal (dona do diálogo).
 * @param {{format: "md"|"docx"|"pdf", title: string, markdown: string, html: string}} payload - Documento.
 * @returns {Promise<{success: boolean, canceled?: boolean, path?: string, error?: string}>}
 */
export async function exportDocument(
  parent,
  { format, title, markdown, html },
) {
  const spec = FORMATS[format];
  if (!spec)
    return { success: false, error: "Formato de exportação inválido." };

  const { canceled, filePath } = await dialog.showSaveDialog(parent, {
    title: "Exportar arquivo",
    defaultPath: `${safeName(title)}.${spec.ext}`,
    filters: [{ name: spec.label, extensions: [spec.ext] }],
  });
  if (canceled || !filePath) return { success: false, canceled: true };

  const target = path.extname(filePath) ? filePath : `${filePath}.${spec.ext}`;
  await fs.promises.writeFile(target, await renderDocument(format, title, markdown, html));
  return { success: true, path: target };
}

/**
 * Gera o conteúdo de um documento no formato pedido.
 * @param {"md"|"docx"|"pdf"} format - Formato.
 * @param {string} title - Título.
 * @param {string} markdown - Texto em Markdown (usado no .md).
 * @param {string} html - HTML do texto (usado no Word e no PDF).
 * @returns {Promise<string|Buffer>}
 */
async function renderDocument(format, title, markdown, html) {
  if (format === "md") return markdown;
  const document = buildHtml(title, html);
  if (format === "docx") {
    const data = await htmlToDocx(document, null, { title, font: "Georgia", fontSize: 24, pageNumber: false });
    return Buffer.from(data);
  }
  return renderPdf(document);
}

/** Pastas que não entram no zip do projeto (dados internos do app); rascunhos `.temp` também ficam de fora. */
const ZIP_SKIP_DIRS = new Set([".system", ".git", "node_modules"]);

/**
 * Adiciona uma pasta (recursivamente) a um zip.
 * @param {JSZip} zip - Zip de destino.
 * @param {string} dir - Pasta de origem.
 * @param {string} prefix - Prefixo dentro do zip.
 * @param {{drafts?: boolean}} [options] - `drafts: true` inclui os rascunhos `.temp` (usado no backup).
 * @returns {Promise<void>}
 */
export async function addDirToZip(zip, dir, prefix, options = {}) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ZIP_SKIP_DIRS.has(entry.name)) continue;
      await addDirToZip(zip, full, `${prefix}${entry.name}/`, options);
    } else if (options.drafts || !entry.name.endsWith(".temp")) {
      zip.file(`${prefix}${entry.name}`, await fs.promises.readFile(full));
    }
  }
}

/**
 * Exporta o livro: o projeto inteiro em zip, os capítulos em um zip (um arquivo por capítulo) ou um arquivo único com
 * todos os capítulos. Os capítulos já chegam do renderer com o Markdown e o HTML prontos.
 * @param {import('electron').BrowserWindow} parent - Janela principal.
 * @param {Object} payload
 * @param {"project"|"chapters"|"single"} payload.kind - O que exportar.
 * @param {"md"|"docx"|"pdf"} [payload.format] - Formato dos capítulos.
 * @param {string} payload.title - Título do livro.
 * @param {string} [payload.bookPath] - Pasta do livro (kind "project").
 * @param {Array<{title: string, markdown: string, html: string}>} [payload.chapters] - Capítulos em ordem.
 * @returns {Promise<{success: boolean, canceled?: boolean, path?: string, count?: number, error?: string}>}
 */
export async function exportBook(parent, { kind, format = "md", title, bookPath, chapters = [] }) {
  const spec = FORMATS[format];
  if (!["project", "chapters", "single"].includes(kind) || !spec) {
    return { success: false, error: "Opção de exportação inválida." };
  }
  if (kind === "project" && (!bookPath || !fs.existsSync(bookPath))) {
    return { success: false, error: "Pasta do livro não encontrada." };
  }
  if (kind !== "project" && chapters.length === 0) {
    return { success: false, error: "O livro ainda não tem capítulos para exportar." };
  }

  const isZip = kind !== "single";
  const ext = isZip ? "zip" : spec.ext;
  const suffix = kind === "project" ? " (projeto)" : kind === "chapters" ? " (capítulos)" : "";
  const { canceled, filePath } = await dialog.showSaveDialog(parent, {
    title: "Exportar livro",
    defaultPath: `${safeName(title)}${suffix}.${ext}`,
    filters: [{ name: isZip ? "Arquivo ZIP" : spec.label, extensions: [ext] }],
  });
  if (canceled || !filePath) return { success: false, canceled: true };
  const target = path.extname(filePath) ? filePath : `${filePath}.${ext}`;

  if (kind === "project") {
    const zip = new JSZip();
    await addDirToZip(zip, bookPath, `${safeName(title)}/`);
    await fs.promises.writeFile(target, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
    return { success: true, path: target };
  }

  if (kind === "chapters") {
    const zip = new JSZip();
    for (const [i, chapter] of chapters.entries()) {
      const name = `${String(i + 1).padStart(2, "0")} - ${safeName(chapter.title)}.${spec.ext}`;
      zip.file(name, await renderDocument(format, chapter.title, chapter.markdown, chapter.html));
    }
    await fs.promises.writeFile(target, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
    return { success: true, path: target, count: chapters.length };
  }

  // Arquivo único: título do livro e os capítulos, cada um começando em página nova
  const pageBreak = '<div style="page-break-after: always"></div>';
  const markdown = `# ${title}\n\n${chapters.map((c) => c.markdown.trim()).join("\n\n---\n\n")}\n`;
  const html = `<h1>${escapeHtml(title)}</h1>${pageBreak}${chapters.map((c) => c.html).join(pageBreak)}`;
  await fs.promises.writeFile(target, await renderDocument(format, title, markdown, html));
  return { success: true, path: target, count: chapters.length };
}
