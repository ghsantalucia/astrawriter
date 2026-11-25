/**
 * @file Regras dos arquivos `index.md` do livro (capítulos em `content/` e fichas em `assets/<categoria>/`): qual
 * índice lista um arquivo, como montar a linha de link e como remover os links de arquivos excluídos.
 */

import { normalizePath } from "./helpers.js";
import { appendToBody } from "./template.js";

/** Pastas de fichas do Mundo que mantêm um índice próprio. */
const ASSET_CATEGORIES = ["characters", "places", "elements", "events"];

/**
 * Caminho (relativo ao livro) do índice que lista um arquivo de ficha, ou null se o arquivo não é listado em índice.
 * Fichas dentro de subpastas do usuário entram no índice da categoria (`assets/characters/index.md`).
 * @param {string} bookRelPath - Caminho do arquivo relativo ao livro (ex.: `assets/characters/character_001.md`).
 * @returns {string|null}
 */
export function entityIndexPath(bookRelPath) {
  const parts = normalizePath(bookRelPath).replace(/^\/+/, "").split("/");
  if (parts.length < 3 || parts[0] !== "assets") return null;
  if (!ASSET_CATEGORIES.includes(parts[1])) return null;
  if (parts[parts.length - 1].toLowerCase() === "index.md") return null;
  if (!/\.md$/i.test(parts[parts.length - 1])) return null;
  // Eventos não têm um índice à parte: a linha do tempo é o índice da categoria (ordenado cronologicamente)
  if (parts[1] === "events") {
    if (parts[parts.length - 1].toLowerCase() === "timeline.md") return null;
    return "assets/events/timeline.md";
  }
  return `assets/${parts[1]}/index.md`;
}

/**
 * Índices do livro que podem conter link para um arquivo excluído (capítulos e categorias do Mundo).
 * @param {string} bookRelPath - Caminho do arquivo relativo ao livro.
 * @returns {string[]}
 */
export function indexPathsFor(bookRelPath) {
  const rel = normalizePath(bookRelPath).replace(/^\/+/, "");
  if (rel.startsWith("content/")) return ["content/index.md"];
  const entity = entityIndexPath(rel);
  return entity ? [entity] : [];
}

/**
 * Remove título de link do texto (colchetes quebrariam o Markdown).
 * @param {string} title - Título.
 * @returns {string}
 */
function safeTitle(title) {
  return String(title || "").replace(/[[\]]/g, "");
}

/**
 * Linha de lista do índice para um arquivo.
 * @param {string} title - Título exibido.
 * @param {string} bookRelPath - Caminho do arquivo relativo ao livro.
 * @returns {string}
 */
export function indexLine(title, bookRelPath) {
  return `- [${safeTitle(title)}](${normalizePath(bookRelPath).replace(/^\/+/, "")})`;
}

/**
 * Indica se uma linha do índice é o link de um dos caminhos (com ou sem barra inicial e `#fragmento`).
 * @param {string} line - Linha do índice.
 * @param {Set<string>} paths - Caminhos relativos ao livro (minúsculos).
 * @returns {boolean}
 */
function lineLinksTo(line, paths) {
  for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) {
    let href = m[1].split("#")[0].replace(/^\/+/, "");
    try {
      href = decodeURIComponent(href);
    } catch {
      // mantém como veio
    }
    if (paths.has(href.toLowerCase())) return true;
  }
  return false;
}

/**
 * Acrescenta o link de um arquivo ao texto de um índice (sem duplicar se já estiver lá).
 * @param {string} indexContent - Conteúdo atual do índice.
 * @param {string} title - Título do arquivo.
 * @param {string} bookRelPath - Caminho do arquivo relativo ao livro.
 * @returns {string} Novo conteúdo (igual ao antigo se o link já existia).
 */
export function addIndexLink(indexContent, title, bookRelPath) {
  const paths = new Set([normalizePath(bookRelPath).replace(/^\/+/, "").toLowerCase()]);
  if (indexContent.split("\n").some((line) => lineLinksTo(line, paths)))
    return indexContent;
  return appendToBody(indexContent, indexLine(title, bookRelPath));
}

/**
 * Remove do texto de um índice as linhas que apontam para os arquivos informados.
 * @param {string} indexContent - Conteúdo atual do índice.
 * @param {string[]} bookRelPaths - Caminhos dos arquivos removidos, relativos ao livro.
 * @returns {string} Novo conteúdo (igual ao antigo se nenhuma linha apontava para eles).
 */
export function removeIndexLinks(indexContent, bookRelPaths) {
  const paths = new Set(
    bookRelPaths.map((p) => normalizePath(p).replace(/^\/+/, "").toLowerCase()),
  );
  return indexContent
    .split("\n")
    .filter((line) => !lineLinksTo(line, paths))
    .join("\n");
}
