// @ts-nocheck
/**
 * @file Citações (retrolinks): em quais arquivos do livro um arquivo é citado por um link Markdown, com o parágrafo de cada
 * citação. O índice do livro todo é montado sob demanda (uma leitura de cada arquivo) e guardado até algo mudar.
 */

import { uiBus } from "../events/uiBus.js";
import { domainBus } from "../events/domainBus.js";
import { flattenBookTree, fileTitle } from "./bookFiles.js";

/** Máximo de arquivos lidos para montar o índice. */
const MAX_FILES = 600;

/** Índice por livro: `Map<alvo (minúsculo), Citation[]>`. */
const cache = new Map();

/** Descarta o índice (algo mudou nos arquivos). @returns {void} */
export function invalidateBacklinks() {
  cache.clear();
}
for (const event of ["temp-file:synced", "temp-file:saved", "sync:completed", "book:changed"]) uiBus.on(event, invalidateBacklinks);
for (const event of ["file:created", "file:deleted", "chapter:created", "chapter:deleted"]) domainBus.on(event, invalidateBacklinks);

/**
 * Caminho do livro (minúsculo, sem barra inicial) apontado por um link, ou null se não for um link interno.
 * @param {string} href - Endereço do link.
 * @returns {string|null}
 */
function targetOf(href) {
  if (!href || /^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) return null;
  let path = href.split(/[?#]/)[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    // mantém como veio
  }
  path = path.replace(/\\/g, "/").replace(/^\.?\/+/, "");
  return /\.md$/i.test(path) ? path.toLowerCase() : null;
}

/**
 * Monta o índice de citações do livro.
 * @param {string} bookPath - Caminho do livro.
 * @returns {Promise<Map<string, Array<Object>>>}
 */
async function buildIndex(bookPath) {
  const index = new Map();
  const tree = await window.electronAPI.getTree(bookPath);
  const files = flattenBookTree(tree, bookPath).slice(0, MAX_FILES);
  const re = /\[([^\]\n]*)\]\(\s*([^)\s]+?)(?:\s+"[^"]*")?\s*\)/g;
  for (const file of files) {
    // Índices e linha do tempo só listam links: não contam como citações
    if (/(^|\/)(index|timeline)\.md$/i.test(file.relPath)) continue;
    const text = await window.electronAPI.readFile(file.absPath);
    if (!text) continue;
    // Parágrafos com a posição inicial de cada um (o frontmatter não conta)
    const bodyStart = text.startsWith("---") ? Math.max(0, text.indexOf("\n---", 3) + 4) : 0;
    const paragraphs = [];
    let pos = bodyStart;
    for (const chunk of text.slice(bodyStart).split(/\n{2,}/)) {
      const start = text.indexOf(chunk, pos);
      paragraphs.push({ start, end: start + chunk.length, text: chunk.trim() });
      pos = start + chunk.length;
    }
    const seenText = new Map();
    for (const m of text.slice(bodyStart).matchAll(re)) {
      const target = targetOf(m[2]);
      if (!target || target === file.relPath.toLowerCase()) continue;
      const at = bodyStart + m.index;
      const paragraph = paragraphs.find((p) => at >= p.start && at <= p.end)?.text || m[0];
      const label = m[1] || target;
      const occurrence = seenText.get(label) || 0;
      seenText.set(label, occurrence + 1);
      if (!index.has(target)) index.set(target, []);
      index.get(target).push({ rel: file.relPath, title: fileTitle(file), paragraph, label, occurrence });
    }
  }
  return index;
}

/**
 * Citações de um arquivo em outros arquivos do livro.
 * @param {string} bookPath - Caminho do livro.
 * @param {string} rel - Caminho do arquivo citado, relativo ao livro.
 * @returns {Promise<Array<{rel: string, title: string, paragraph: string, label: string, occurrence: number}>>}
 */
export async function citationsOf(bookPath, rel) {
  if (!bookPath || !rel) return [];
  if (!cache.has(bookPath)) cache.set(bookPath, buildIndex(bookPath).catch(() => new Map()));
  const index = await cache.get(bookPath);
  return index.get(String(rel).replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase()) || [];
}
