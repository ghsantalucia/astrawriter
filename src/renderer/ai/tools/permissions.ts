/**
 * @file Resolução de arquivos do livro e verificação de permissões da IA (aiRead / aiWrite).
 *
 * As permissões ficam no frontmatter de cada .md (o disco é a fonte da verdade,
 * por isso a árvore é relida a cada chamada). A flag do próprio arquivo é a que vale:
 * o `folder.yml` descreve a pasta, não restringe os arquivos dentro dela.
 */

import { t } from "../../../shared/i18n.js";
import { normalizePath } from "../../utils/helpers.js";

/**
 * Valida um caminho relativo à raiz do livro e o divide em segmentos.
 * Tolera `./`, barra inicial e caminhos absolutos que apontem para dentro do livro.
 * @param {string} relPath
 * @param {string} [bookPath] - Caminho absoluto do livro (para aceitar caminhos absolutos).
 * @returns {string[]}
 */
export function parseRelativePath(relPath, bookPath = "") {
  let normalized = normalizePath(String(relPath || "")).trim();
  const book = normalizePath(bookPath).replace(/\/+$/, "");

  if (book && normalized.toLowerCase().startsWith(`${book.toLowerCase()}/`)) {
    normalized = normalized.slice(book.length + 1);
  }

  const segments = normalized
    .split("/")
    .filter((segment) => segment && segment !== ".");
  const last = segments[segments.length - 1] || "";

  if (
    segments.length === 0 ||
    segments.some((s) => s === ".." || s.startsWith(".")) ||
    /^[a-z]:$/i.test(segments[0])
  ) {
    throw new Error(
      t('Caminho inválido: "{relPath}". Use caminhos relativos à raiz do livro (ex: content/plot.md).', { relPath }),
    );
  }
  if (!/\.md$/i.test(last)) {
    throw new Error(t("Apenas arquivos .md podem ser acessados."));
  }
  return segments;
}

/**
 * Localiza um arquivo .md na árvore do livro atual.
 * @param {Object} state
 * @param {string} relPath
 * @returns {Promise<{relPath: string, title: string, originalPath: string, isTemp: boolean, metadata: Object}>}
 */
export async function locateFile(state, relPath) {
  if (!state.currentBookPath) throw new Error(t("Nenhum livro selecionado."));

  const segments = parseRelativePath(relPath, state.currentBookPath);
  const tree = await window.electronAPI.getTree(
    normalizePath(state.currentBookPath),
  );
  if (!tree) throw new Error(t("Não foi possível ler a estrutura do livro."));

  let node = tree;
  for (const folderName of segments.slice(0, -1)) {
    node = node.folders?.[folderName];
    if (!node) throw new Error(t("Arquivo não encontrado: {relPath}", { relPath }));
  }

  const fileKey = segments[segments.length - 1].replace(/\.md$/i, "");
  const file = node.files?.[fileKey];
  if (!file || !/\.md(\.temp)?$/i.test(file.originalPath || "")) {
    throw new Error(t("Arquivo não encontrado: {relPath}", { relPath }));
  }

  return {
    relPath: segments.join("/"),
    title: file.metadata?.title || fileKey,
    originalPath: file.originalPath,
    isTemp: Boolean(file.isTemp),
    metadata: file.metadata || {},
  };
}

/**
 * Indica se a IA possui a permissão ("aiRead" | "aiWrite") sobre o arquivo.
 * @param {{metadata: Object}} located
 * @param {"aiRead"|"aiWrite"} flag
 * @returns {boolean}
 */
export function hasPermission(located, flag) {
  const value = located.metadata?.[flag];
  return value === true || value === "true";
}

/**
 * Lança erro se a IA não tiver a permissão necessária.
 * @param {{metadata: Object, relPath: string, title: string}} located
 * @param {"aiRead"|"aiWrite"} flag
 */
export function assertPermission(located, flag) {
  if (!hasPermission(located, flag)) {
    const params = { title: located.title, flag };
    throw new Error(
      flag === "aiRead"
        ? t('Acesso negado: o autor não permitiu leitura da IA no arquivo "{title}" ({flag} está desativado).', params)
        : t('Acesso negado: o autor não permitiu escrita da IA no arquivo "{title}" ({flag} está desativado).', params),
    );
  }
}

// ========== Pastas ========== //

/**
 * Valida o caminho de uma pasta relativo à raiz do livro e o divide em segmentos.
 * @param {string} relPath - Caminho informado pela IA (ex.: `notes/ideias`).
 * @param {string} [bookPath] - Caminho absoluto do livro (para aceitar caminhos absolutos).
 * @returns {string[]}
 * @throws {Error} Se o caminho é inválido, oculto ou aponta para um arquivo.
 */
export function parseFolderPath(relPath, bookPath = "") {
  let normalized = normalizePath(String(relPath || "")).trim();
  const book = normalizePath(bookPath).replace(/\/+$/, "");
  if (book && normalized.toLowerCase().startsWith(`${book.toLowerCase()}/`)) {
    normalized = normalized.slice(book.length + 1);
  }

  const segments = normalized
    .split("/")
    .filter((segment) => segment && segment !== ".");
  if (
    segments.length === 0 ||
    segments.some((s) => s === ".." || s.startsWith(".")) ||
    /^[a-z]:$/i.test(segments[0]) ||
    /\.[a-z0-9]+$/i.test(segments[segments.length - 1])
  ) {
    throw new Error(
      t('Caminho de pasta inválido: "{relPath}". Use caminhos relativos à raiz do livro (ex.: notes/ideias).', { relPath }),
    );
  }
  return segments;
}

/**
 * Localiza o nó de uma pasta na árvore do livro atual.
 * @param {Object} state - Estado global.
 * @param {string[]} segments - Segmentos do caminho da pasta.
 * @returns {Promise<{node: Object, metadata: Object, tree: Object}>}
 * @throws {Error} Se a pasta não existe.
 */
export async function locateFolder(state, segments) {
  if (!state.currentBookPath) throw new Error(t("Nenhum livro selecionado."));
  const tree = await window.electronAPI.getTree(
    normalizePath(state.currentBookPath),
  );
  if (!tree) throw new Error(t("Não foi possível ler a estrutura do livro."));

  let node = tree;
  for (const name of segments) {
    node = node.folders?.[name];
    if (!node) throw new Error(t("Pasta não encontrada: {path}", { path: segments.join("/") }));
  }
  return { node, metadata: node.metadata || {}, tree };
}

/**
 * Lista todos os arquivos `.md` (com o frontmatter) dentro de uma pasta, incluindo subpastas.
 * @param {Object} node - Nó da pasta na árvore.
 * @param {string} prefix - Caminho relativo ao livro da pasta (sem barra final).
 * @returns {Array<{relPath: string, title: string, metadata: Object}>}
 */
export function collectFolderFiles(node, prefix) {
  const out = [];
  for (const [key, file] of Object.entries(node.files || {}) as [string, any][]) {
    if (!/\.md(\.temp)?$/i.test(file.originalPath || "")) continue;
    out.push({
      relPath: `${prefix}/${key}.md`,
      title: file.metadata?.title || key,
      metadata: file.metadata || {},
    });
  }
  for (const [name, sub] of Object.entries(node.folders || {})) {
    if (name.startsWith(".")) continue;
    out.push(...collectFolderFiles(sub, `${prefix}/${name}`));
  }
  return out;
}

/**
 * Lança erro se a pasta não tiver a permissão da IA (`aiRead` / `aiWrite` / `aiDelete` no `folder.yml`).
 * @param {Object} metadata - Metadados (folder.yml) da pasta.
 * @param {"aiRead"|"aiWrite"|"aiDelete"} flag - Permissão exigida.
 * @param {string} folderLabel - Nome da pasta para a mensagem.
 * @returns {void}
 */
export function assertFolderPermission(metadata, flag, folderLabel) {
  const value = metadata?.[flag];
  if (value === true || value === "true") return;
  const params = { folder: folderLabel, flag };
  const messages = {
    aiRead: t('Acesso negado: o autor não permitiu leitura da IA na pasta "{folder}" ({flag} não está ativo).', params),
    aiWrite: t('Acesso negado: o autor não permitiu escrita da IA na pasta "{folder}" ({flag} não está ativo).', params),
    aiDelete: t('Acesso negado: o autor não permitiu exclusão da IA na pasta "{folder}" ({flag} não está ativo).', params),
  };
  throw new Error(
    messages[flag] ||
      t('Acesso negado: o autor não permitiu {action} da IA na pasta "{folder}" ({flag} não está ativo).', { ...params, action: flag }),
  );
}
