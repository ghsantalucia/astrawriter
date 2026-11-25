/**
 * @file Funções puras sobre a árvore de arquivos do livro (`state.currentBookMap`): listagem plana, busca de destinos
 * de link interno e termos (nome e apelidos) usados pelo link automático.
 *
 * O link interno usa o caminho do arquivo a partir da raiz do livro, sempre com barra inicial
 * (ex.: `/assets/places/reino_Y.md`), a mesma sintaxe que o editor entende ao clicar em um link.
 */

import { foldText, normalizePath } from "./helpers.js";

/**
 * @typedef {Object} BookFile
 * @property {string} absPath - Caminho absoluto do arquivo oficial (.md).
 * @property {string} relPath - Caminho relativo à raiz do livro, sem barra inicial (ex.: `assets/places/reino_Y.md`).
 * @property {string} key - Nome do arquivo sem extensão.
 * @property {Object} metadata - Frontmatter do arquivo.
 */

/**
 * Achata a árvore de arquivos do livro em uma lista de arquivos Markdown oficiais.
 * @param {Object|null} tree - Árvore retornada por `get-tree`.
 * @param {string} bookPath - Caminho absoluto do livro.
 * @returns {BookFile[]}
 */
export function flattenBookTree(tree, bookPath) {
  const result = [];
  const root = normalizePath(bookPath).replace(/\/+$/, "");

  const walk = (node) => {
    if (!node) return;
    for (const [key, file] of Object.entries<any>(node.files || {})) {
      const original = normalizePath(file.originalPath || file.path || "");
      if (!original.toLowerCase().endsWith(".md")) continue;
      if (!original.startsWith(`${root}/`)) continue;
      result.push({
        absPath: original,
        relPath: original.slice(root.length + 1),
        key,
        metadata: file.metadata || {},
      });
    }
    Object.values(node.folders || {}).forEach(walk);
  };

  walk(tree);
  return result;
}

/**
 * Título de exibição de um arquivo.
 * @param {BookFile} file - Arquivo.
 * @returns {string}
 */
export function fileTitle(file) {
  return (
    file.metadata?.title || file.metadata?.data?.title?.content || file.key
  );
}

/**
 * Indica se o arquivo pode ser destino de um link interno (ficha legível, fora modelos e índices).
 * @param {BookFile} file - Arquivo.
 * @returns {boolean}
 */
export function isLinkTarget(file) {
  if (file.key === "template" || file.key === "index") return false;
  return file.metadata?.humanRead !== false;
}

/**
 * Href interno de um arquivo (`/caminho/relativo.md`).
 * @param {string} relPath - Caminho relativo à raiz do livro.
 * @returns {string}
 */
export function toInternalHref(relPath) {
  return `/${encodeURI(relPath)}`;
}

/**
 * Procura destinos de link interno por nome, título ou caminho (ignora maiúsculas e acentos).
 * @param {BookFile[]} files - Arquivos do livro.
 * @param {string} term - Termo digitado (vazio lista todos).
 * @param {number} [limit=30] - Máximo de resultados.
 * @returns {Array<{title: string, relPath: string, displayPath: string, href: string}>}
 */
export function searchLinkTargets(files, term, limit = 30) {
  const needle = foldText(String(term || "").trim());
  return files
    .filter(isLinkTarget)
    .map((file) => ({
      title: fileTitle(file),
      relPath: file.relPath,
      displayPath: `/${file.relPath.replace(/\.md$/i, "")}`,
      href: toInternalHref(file.relPath),
    }))
    .filter(
      (item) =>
        !needle ||
        foldText(item.title).includes(needle) ||
        foldText(item.displayPath).includes(needle),
    )
    .sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { numeric: true }),
    )
    .slice(0, limit);
}

/**
 * Divide o valor da variável de apelidos em uma lista (separada por vírgula, ponto e vírgula ou quebra de linha).
 * @param {string} value - Valor bruto.
 * @returns {string[]}
 */
export function splitAliases(value) {
  return String(value || "")
    .split(/[,;\n]/)
    .map((alias) => alias.trim())
    .filter(Boolean);
}

/** Tamanho mínimo de um termo para o link automático (evita ligar palavras curtas demais). */
const MIN_TERM_LENGTH = 3;

/**
 * Termos (nome e apelidos) que o link automático procura no texto, cada um apontando para o arquivo de origem.
 * Só entram as fichas do mundo (`assets/<pasta>/arquivo.md`), nunca o próprio arquivo aberto.
 * @param {BookFile[]} files - Arquivos do livro.
 * @param {string} [currentRelPath] - Caminho relativo do arquivo aberto (excluído).
 * @returns {Array<{term: string, href: string, title: string}>} Termos ordenados do maior para o menor.
 */
export function buildAutoLinkTerms(files, currentRelPath = "") {
  const terms = new Map();

  files
    .filter(
      (file) =>
        isLinkTarget(file) &&
        /^assets\/[^/]+\/[^/]+\.md$/i.test(file.relPath) &&
        file.relPath !== currentRelPath,
    )
    .forEach((file) => {
      const title = fileTitle(file);
      const names = [
        title,
        file.metadata?.data?.title?.content,
        ...splitAliases(file.metadata?.data?.aliases?.content),
      ];
      names.forEach((name) => {
        const clean = String(name || "").trim();
        if (clean.length < MIN_TERM_LENGTH) return;
        const key = foldText(clean);
        // Em caso de nome repetido, vale o primeiro arquivo encontrado
        if (!terms.has(key)) {
          terms.set(key, {
            term: clean,
            href: toInternalHref(file.relPath),
            title,
          });
        }
      });
    });

  return [...terms.values()].sort((a, b) => b.term.length - a.term.length);
}

/**
 * Conjunto de caminhos relativos (minúsculos) dos arquivos existentes, para validar links internos.
 * @param {BookFile[]} files - Arquivos do livro.
 * @returns {Set<string>}
 */
export function existingPathSet(files) {
  return new Set(files.map((file) => foldText(file.relPath)));
}
