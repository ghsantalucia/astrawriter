// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Regras das tags dos arquivos (variável especial `tags` do frontmatter): normalização, leitura do texto digitado
 * e cor automática (sempre a mesma para a mesma tag, por hash). Compartilhado entre o processo principal e a interface.
 */

/** Quantidade de cores da paleta (classes `.tag-c0` ... `.tag-c<N-1>` em `assets/css/components/tags.css`). */
export const TAG_COLOR_COUNT = 40;

/** Tamanho máximo de uma tag. */
export const TAG_MAX_LENGTH = 40;

/**
 * Normaliza uma tag: minúsculas, sem "#", espaços internos viram hífen e só ficam letras (com acento),
 * números e `- _ / .`.
 * @param {string} raw - Texto digitado.
 * @returns {string} Tag válida ou "" se não sobrar nada.
 */
export function normalizeTag(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zà-öø-ÿ0-9\-_/.]/g, "")
    .replace(/^-+/, "")
    .slice(0, TAG_MAX_LENGTH);
}

/**
 * Converte uma lista/texto (separado por vírgulas) em tags normalizadas, sem repetição, na ordem digitada.
 * @param {string|string[]|undefined|null} input - Lista de tags ou texto com vírgulas.
 * @returns {string[]}
 */
export function parseTags(input) {
  const parts = Array.isArray(input) ? input : String(input ?? "").split(",");
  const seen = new Set();
  const tags = [];
  for (const part of parts) {
    const tag = normalizeTag(part);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
}

/**
 * Índice (0 a TAG_COLOR_COUNT-1) da cor da tag: hash FNV-1a das letras, portanto nunca muda para a mesma tag.
 * @param {string} tag - Tag (já normalizada).
 * @returns {number}
 */
export function tagColorIndex(tag) {
  let hash = 2166136261;
  for (const char of String(tag)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % TAG_COLOR_COUNT;
}
