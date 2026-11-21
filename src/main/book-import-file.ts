// @ts-nocheck
/**
 * @file Importação de um livro a partir de um arquivo de texto (Word `.docx`, LibreOffice `.odt`, PDF, `.txt` ou `.md`).
 * Extrai o texto e tenta separar os capítulos pelos títulos. Nada é criado aqui: o resultado (título + capítulos) vai para a
 * tela de revisão, onde o autor corrige o que foi identificado errado antes de seguir o assistente de criação de livro.
 */

import fs from "node:fs";
import path from "node:path";
import { dialog } from "electron";
const JSZip = require("jszip");

/** Título de capítulo reconhecido pelo texto ("Capítulo 3", "CAPÍTULO IV: ...", "Chapter 2"). */
const CHAPTER_RE = /^\s*(?:cap[ií]tulo|cap\.|chapter)\s*(?:[0-9]+|[ivxlcdm]+|[a-zçãéíóú]+)\b.{0,100}$/i;

/** Limite de tamanho do arquivo (proteção). */
const MAX_BYTES = 80 * 1024 * 1024;

const entities = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&nbsp;": " " };
const decode = (t) => String(t).replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => entities[m] || m).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const stripTags = (t) => decode(String(t).replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/**
 * Converte texto corrido (txt/pdf) em blocos: títulos de capítulo e parágrafos. Linhas quebradas no meio da frase são unidas.
 * @param {string} text - Texto.
 * @returns {Array<{type: "heading"|"p", level?: number, text: string}>}
 */
export function blocksFromText(text) {
  const blocks = [];
  let current = "";
  const flush = () => {
    if (current.trim()) blocks.push({ type: "p", text: current.trim() });
    current = "";
  };
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const md = line.match(/^(#{1,6})\s+(.+)$/);
    if (md) {
      flush();
      blocks.push({ type: "heading", level: md[1].length, text: md[2].trim() });
      continue;
    }
    if (CHAPTER_RE.test(line) && line.length <= 100) {
      flush();
      blocks.push({ type: "heading", level: 1, text: line });
      continue;
    }
    // Une a linha ao parágrafo atual, a menos que a anterior termine a frase (PDF quebra linhas no meio dos parágrafos)
    if (current && /[.!?…:"”»)]$/.test(current)) flush();
    current = current ? `${current} ${line}` : line;
  }
  flush();
  return blocks;
}

/** Blocos do HTML gerado pelo mammoth (`h1..h6` e `p`). */
function blocksFromHtml(html) {
  const blocks = [];
  for (const m of html.matchAll(/<(h[1-6]|p)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)) {
    const text = stripTags(m[2]);
    if (!text) continue;
    blocks.push(m[1][0].toLowerCase() === "h" ? { type: "heading", level: Number(m[1][1]), text } : { type: "p", text });
  }
  return blocks;
}

/** Blocos do `content.xml` de um .odt (`text:h` e `text:p`). */
function blocksFromOdt(xml) {
  const blocks = [];
  for (const m of xml.matchAll(/<text:(h|p)\b([^>]*)>([\s\S]*?)<\/text:\1>/gi)) {
    const text = stripTags(m[3].replace(/<text:line-break\s*\/>/g, " ").replace(/<text:tab\s*\/>/g, " "));
    if (!text) continue;
    if (m[1].toLowerCase() === "h") {
      const level = Number((m[2].match(/outline-level="(\d+)"/) || [])[1]) || 1;
      blocks.push({ type: "heading", level, text });
    } else blocks.push({ type: "p", text });
  }
  return blocks;
}

/**
 * Separa os blocos em capítulos. Usa os títulos que parecem "Capítulo N"; se não houver, o nível de título que aparece em mais
 * de um lugar. O que vem antes do primeiro capítulo vira o título do livro (se for um título curto) ou um "Prólogo".
 * @param {Array<Object>} blocks - Blocos do documento.
 * @param {string} fallbackTitle - Título se o documento não trouxer um.
 * @returns {{title: string, chapters: Array<{title: string, text: string, words: number}>, warnings: string[]}}
 */
export function splitChapters(blocks, fallbackTitle) {
  const warnings = [];
  const headings = blocks.filter((b) => b.type === "heading");
  let isStart = () => false;
  const byRegex = headings.filter((h) => CHAPTER_RE.test(h.text));
  if (byRegex.length >= 2) {
    isStart = (b) => b.type === "heading" && CHAPTER_RE.test(b.text);
  } else {
    // O nível de título (1, 2, 3...) mais alto que se repete pelo menos 2 vezes
    for (const level of [1, 2, 3]) {
      if (headings.filter((h) => h.level === level).length >= 2) {
        isStart = (b) => b.type === "heading" && b.level === level;
        break;
      }
    }
  }

  let title = "";
  const chapters = [];
  let current = null;
  let preface = [];
  for (const b of blocks) {
    if (isStart(b)) {
      if (current) chapters.push(current);
      current = { title: b.text, parts: [] };
    } else if (current) {
      current.parts.push(b.type === "heading" ? `## ${b.text}` : b.text);
    } else {
      preface.push(b);
    }
  }
  if (current) chapters.push(current);

  // Antes do primeiro capítulo: um título curto no começo é o título do livro; o resto vira "Prólogo" se for relevante
  if (preface.length) {
    const first = preface[0];
    if (first.text.length <= 120 && (first.type === "heading" || preface.length <= 3 || first.text === first.text.toUpperCase())) {
      title = first.text;
      preface = preface.slice(1);
    }
    const prefaceText = preface.filter((b) => b.text.length > 0).map((b) => (b.type === "heading" ? `## ${b.text}` : b.text));
    if (chapters.length && prefaceText.join(" ").length >= 400) chapters.unshift({ title: "Prólogo", parts: prefaceText });
    else if (!chapters.length) chapters.push({ title: "Capítulo 1", parts: prefaceText });
  }

  if (!chapters.length) warnings.push("Não encontrei títulos de capítulo: o texto todo ficou em um capítulo. Você pode ajustar na próxima tela.");
  const result = chapters.map((c) => {
    const text = c.parts.join("\n\n");
    return { title: c.title.replace(/\s+/g, " ").trim().slice(0, 120), text, words: text.split(/\s+/).filter(Boolean).length };
  });
  return { title: title || fallbackTitle, chapters: result, warnings };
}

/**
 * Lê o arquivo e devolve os blocos do documento.
 * @param {string} file - Caminho do arquivo.
 * @returns {Promise<Array<Object>>}
 */
async function readBlocks(file) {
  const ext = path.extname(file).toLowerCase();
  const buffer = await fs.promises.readFile(file);
  if (ext === ".docx") {
    const mammoth = require("mammoth");
    const { value } = await mammoth.convertToHtml({ buffer });
    return blocksFromHtml(value);
  }
  if (ext === ".odt") {
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("content.xml")?.async("string");
    if (!xml) throw new Error("O arquivo .odt não tem conteúdo legível.");
    return blocksFromOdt(xml);
  }
  if (ext === ".pdf") {
    const parse = require("pdf-parse/lib/pdf-parse.js");
    const data = await parse(buffer);
    return blocksFromText(String(data.text || ""));
  }
  if (ext === ".txt" || ext === ".md" || ext === ".markdown") return blocksFromText(buffer.toString("utf8"));
  throw new Error("Formato não suportado. Use .docx, .odt, .pdf, .txt ou .md.");
}

/**
 * Escolhe um arquivo e extrai título e capítulos (nada é criado).
 * @param {import('electron').BrowserWindow} parent - Janela principal.
 * @returns {Promise<{success: boolean, canceled?: boolean, title?: string, chapters?: Array<Object>, warnings?: string[], format?: string, error?: string}>}
 */
export async function extractBookFromFile(parent) {
  const { canceled, filePaths } = await dialog.showOpenDialog(parent, {
    title: "Importar livro de um arquivo",
    properties: ["openFile"],
    filters: [
      { name: "Documentos", extensions: ["docx", "odt", "pdf", "txt", "md"] },
      { name: "Todos os arquivos", extensions: ["*"] },
    ],
  });
  if (canceled || !filePaths?.[0]) return { success: false, canceled: true };
  try {
    const file = filePaths[0];
    if (fs.statSync(file).size > MAX_BYTES) throw new Error("O arquivo é grande demais (limite de 80 MB).");
    const blocks = await readBlocks(file);
    if (blocks.length === 0) throw new Error("Não encontrei texto neste arquivo (PDFs escaneados, só com imagens, não são suportados).");
    const base = path.basename(file, path.extname(file)).replace(/[_-]+/g, " ").trim();
    const { title, chapters, warnings } = splitChapters(blocks, base || "Livro importado");
    return { success: true, title, chapters, warnings, format: path.extname(file).slice(1).toLowerCase() };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
