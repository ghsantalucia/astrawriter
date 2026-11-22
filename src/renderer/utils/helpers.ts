/**
 * @file Funções auxiliares genéricas para apoio à interface do usuário, controle de menus e normalizações.
 */

import { DEFAULT_TREE_METADATA } from "../core/state.js";
import { foldText, findMatches } from "../../shared/looseText.js";

/**
 * Garante que todas as chaves obrigatórias do objeto de metadados existam com valores padrão (fallbacks).
 * @param {Object} rawMetadata Metadados lidos do YAML
 * @param {string} fallbackTitle Título alternativo caso não informado
 * @returns {Object} Metadados normalizados
 */
export function normalizeItemMetadata(rawMetadata, fallbackTitle = "") {
  const metadata = {
    ...DEFAULT_TREE_METADATA,
    ...rawMetadata,
  };

  if (!metadata.title) {
    metadata.title = fallbackTitle;
  }

  return metadata;
}

/**
 * Normaliza caminhos de arquivo para evitar quebras em seletores CSS ou chamadas do Node/IPC.
 */
export function normalizePath(p) {
  return (p || "").replace(/\\/g, "/");
}

/**
 * Transforma um caminho completo em um caminho relativo a partir da pasta 'books',
 * garantindo que a pasta do livro imediatamente abaixo de 'books' comece com 'book_'.
 * @param {string} fullPath - O caminho completo do arquivo.
 * @returns {string|null} O caminho relativo ou null caso o formato seja inválido.
 */
export function getRelativePath(fullPath) {
  if (!fullPath) return null;

  const normalizedPath = fullPath.replace(/\\/g, "/");
  const parts = normalizedPath.split("/");
  const booksIndex = parts.indexOf("books");

  if (booksIndex === -1 || booksIndex + 1 >= parts.length) {
    return null;
  }

  const bookFolderName = parts[booksIndex + 1];
  if (!bookFolderName || !bookFolderName.startsWith("book_")) {
    return null;
  }

  // Retorna tudo após a pasta 'books'
  return parts.slice(booksIndex + 1).join("/");
}

/**
 * Utilitário simples para sanitizar textos HTML.
 */
export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

/** Nome (sem extensão) do arquivo-modelo de cada pasta; ele nunca aparece no explorer, na busca nem para a IA. */
export const TEMPLATE_FILE_KEY = "template";

export { foldText };

/**
 * Escapa o texto e destaca (com `<mark>`) as ocorrências do termo, ignorando maiúsculas, acentos, pontuação e
 * artigos/conjunções (mesma regra da busca).
 * @param {string} text - Texto original.
 * @param {string} term - Termo a destacar.
 * @returns {string} HTML seguro com os trechos destacados.
 */
export function highlightMatch(text, term) {
  const source = String(text ?? "");
  let html = "";
  let cursor = 0;

  // Vários termos separados por vírgula (os "#tag" não destacam texto); trechos sobrepostos se unem
  const ranges = String(term ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t && !t.startsWith("#"))
    .flatMap((t) => findMatches(source, t))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  for (const range of ranges) {
    if (range.start < cursor) continue;
    html += escapeHtml(source.slice(cursor, range.start));
    html += `<mark>${escapeHtml(source.slice(range.start, range.end))}</mark>`;
    cursor = range.end;
  }

  return html + escapeHtml(source.slice(cursor));
}

/**
 * Gera um identificador curto e único para correlacionar eventos (ex.: wizards abertos em paralelo).
 * @param {string} [prefix="id"] - Prefixo do identificador.
 * @returns {string}
 */
export function uniqueId(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
