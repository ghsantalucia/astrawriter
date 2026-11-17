/**
 * @file Exportação do arquivo aberto no editor para Markdown, Word (.docx) e PDF. O PDF é gerado pelo próprio Chromium do
 * Electron (impressão de uma janela invisível); o Word usa a biblioteca html-to-docx a partir do HTML do texto.
 */

import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, dialog } from "electron";
const htmlToDocx = require("html-to-docx");

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
  const document = buildHtml(title, html);

  if (format === "md") {
    await fs.promises.writeFile(target, markdown, "utf8");
  } else if (format === "docx") {
    const data = await htmlToDocx(document, null, {
      title,
      font: "Georgia",
      fontSize: 24,
      pageNumber: false,
    });
    await fs.promises.writeFile(target, Buffer.from(data));
  } else {
    await fs.promises.writeFile(target, await renderPdf(document));
  }
  return { success: true, path: target };
}
