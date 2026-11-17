/**
 * @file Regras de permissão de exclusão de arquivos e pastas, para o usuário e para a IA.
 *
 * Regras (em ordem):
 *  1. Arquivos da escrita (`content/`) nunca são excluídos individualmente: a única forma de removê-los é excluir a
 *     pasta do capítulo inteiro.
 *  2. Índices (`index.md`) e modelos (`template.md`) nunca podem ser excluídos.
 *  3. Quem não pode EDITAR o arquivo (`humanWrite` / `aiWrite`) também não pode excluí-lo.
 *  4. O frontmatter pode decidir: `userDelete` / `aiDelete` (`false` bloqueia, `true` libera).
 *  5. Sem o campo: o usuário pode excluir tudo o que pode editar; a IA só exclui com `aiDelete: true` explícito.
 */

import { normalizePath } from "./helpers.js";

/** Nomes de arquivo que nunca podem ser excluídos. */
const PROTECTED_NAMES = new Set(["index.md", "template.md"]);

/**
 * Indica se um arquivo pode ser excluído.
 * @param {Object} metadata - Frontmatter do arquivo (`humanWrite`, `aiWrite`, `userDelete`, `aiDelete`).
 * @param {string} bookRelPath - Caminho do arquivo relativo à raiz do livro (ex.: `notes/note_001.md`).
 * @param {"user"|"ai"} [who="user"] - Quem quer excluir.
 * @returns {boolean}
 */
export function canDeleteFile(metadata, bookRelPath, who = "user") {
  const rel = normalizePath(bookRelPath).replace(/^\/+/, "");
  const name = rel.split("/").pop().toLowerCase();

  if (rel.toLowerCase().startsWith("content/")) return false;
  if (PROTECTED_NAMES.has(name)) return false;

  const meta = metadata || {};
  const canEdit =
    who === "ai" ? meta.aiWrite === true : meta.humanWrite === true;
  if (!canEdit) return false;

  const flag = who === "ai" ? meta.aiDelete : meta.userDelete;
  if (flag === false) return false;
  if (flag === true) return true;
  return who === "user";
}

/** Padrão do nome de uma pasta de capítulo. */
const CHAPTER_FOLDER = /^chapter_(\d+)$/i;

/**
 * Indica se um caminho (relativo ao livro) é uma pasta de capítulo.
 * @param {string} bookRelPath - Caminho relativo ao livro (ex.: `content/chapter_002`).
 * @returns {boolean}
 */
export function isChapterFolder(bookRelPath) {
  const parts = normalizePath(bookRelPath)
    .replace(/^\/+|\/+$/g, "")
    .split("/");
  return (
    parts.length === 2 &&
    parts[0] === "content" &&
    CHAPTER_FOLDER.test(parts[1])
  );
}

/**
 * Número de uma pasta de capítulo (`chapter_003` -> 3).
 * @param {string} folderName - Nome da pasta.
 * @returns {number|null}
 */
export function chapterNumber(folderName) {
  const match = String(folderName).match(CHAPTER_FOLDER);
  return match ? Number(match[1]) : null;
}
