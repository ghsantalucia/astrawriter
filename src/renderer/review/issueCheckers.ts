// @ts-nocheck
/**
 * @file Verificadores determinísticos (sem IA) da Central de Revisões: links internos quebrados, palavras repetidas e
 * palavras desconhecidas. Trabalham sobre o texto Markdown bruto de um arquivo; as posições (`start`/`end`) são
 * índices no conteúdo COMPLETO do arquivo (frontmatter incluído), o que permite aplicar correções direto no texto.
 */

import { typeInfo } from "./issueTypes.js";

/** Palavra (letras, números e apóstrofo). */
const WORD = /[\p{L}\p{N}'’]+/gu;

/**
 * Hash curto e estável de um texto (FNV-1a de 32 bits, em base 36). Usado nos ids dos issues.
 * @param {string} text - Texto.
 * @returns {string}
 */
export function shortHash(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Índice onde o corpo do arquivo começa (logo depois do frontmatter YAML).
 * @param {string} content - Conteúdo completo do arquivo.
 * @returns {number}
 */
export function bodyStart(content) {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/);
  return match ? match[0].length : 0;
}

/** Troca tudo, menos as quebras de linha, por espaços (mantém as posições do texto). */
const blank = (m) => m.replace(/[^\n]/g, " ");

/**
 * Cópia do texto sem o frontmatter e sem blocos/trechos de código (trocados por espaços, mesmo tamanho).
 * @param {string} content - Conteúdo completo do arquivo.
 * @returns {string}
 */
function maskCode(content) {
  const start = bodyStart(content);
  return blank(content.slice(0, start))
    .concat(content.slice(start))
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, blank)
    .replace(/`[^`\n]*`/g, blank);
}

/**
 * Cópia do texto com o que não é prosa trocado por espaços: frontmatter, código, tags HTML e links Markdown
 * completos (nomes de fichas e endereços não são conferidos).
 * @param {string} content - Conteúdo completo do arquivo.
 * @returns {string}
 */
export function maskProse(content) {
  return maskCode(content)
    .replace(/<[^>\n]+>/g, blank)
    .replace(/!?\[[^\]\n]*\]\([^)\n]*\)/g, blank)
    .replace(/https?:\/\/\S+/g, blank);
}

/**
 * Número da linha (base 1) de uma posição do texto.
 * @param {string} content - Texto.
 * @param {number} index - Posição.
 * @returns {number}
 */
export function lineOf(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Monta um issue completo (id estável, linha e severidade do tipo) a partir do básico.
 * @param {Object} base
 * @param {string} base.type - Tipo do issue.
 * @param {string} base.file - Arquivo (relativo ao livro).
 * @param {string} base.content - Conteúdo completo do arquivo.
 * @param {number} base.start - Início do trecho.
 * @param {number} base.end - Fim do trecho.
 * @param {string} base.message - Explicação.
 * @param {Object} [base.suggestion] - `{ replace }` (texto novo) com um `label` opcional.
 * @param {Object} [base.extra] - Campos extras (ex.: `word`).
 * @param {Map<string, number>} base.seen - Contador de ocorrências do mesmo trecho (para ids distintos).
 * @returns {Object}
 */
function buildIssue({ type, file, content, start, end, message, suggestion, extra, seen }) {
  const info = typeInfo(type);
  const excerpt = content.slice(start, end);
  const key = `${file}|${type}|${excerpt}`;
  const n = seen.get(key) || 0;
  seen.set(key, n + 1);
  return {
    id: `s-${shortHash(`${key}|${n}`)}`,
    category: info.category,
    type,
    severity: info.severity,
    source: "system",
    file,
    start,
    end,
    line: lineOf(content, start),
    excerpt,
    message,
    ...(suggestion ? { suggestion } : {}),
    ...(extra || {}),
  };
}

/**
 * Links internos (`[texto](/caminho.md)`) que apontam para arquivos que não existem. Um issue por link, mesmo que o
 * mesmo link quebrado apareça várias vezes no arquivo.
 * @param {string} file - Arquivo (relativo ao livro).
 * @param {string} content - Conteúdo completo.
 * @param {Set<string>} existing - Caminhos relativos (normalizados) dos arquivos existentes.
 * @param {(href: string) => string} toRel - Converte o endereço do link em caminho relativo normalizado.
 * @returns {Object[]}
 */
export function findBrokenLinkIssues(file, content, existing, toRel) {
  const issues = [];
  const seen = new Map();
  const masked = maskCode(content);

  for (const m of masked.matchAll(
    /\[([^\]\n]*)\]\((\/?[^)\s]*?\.md)(?:#[^)\s]*)?\)/gi,
  )) {
    if (existing.has(toRel(m[2]))) continue;
    issues.push(
      buildIssue({
        type: "broken-link",
        file,
        content,
        start: m.index,
        end: m.index + m[0].length,
        message: `O link para "${m[2].replace(/^\//, "")}" aponta para um arquivo que não existe mais.`,
        suggestion: { replace: m[1], label: "Remover o link (manter o texto)" },
        extra: { target: m[2] },
        seen,
      }),
    );
  }
  return issues;
}

/**
 * Palavras repetidas em sequência ("de de"). Um issue por ocorrência.
 * @param {string} file - Arquivo (relativo ao livro).
 * @param {string} content - Conteúdo completo.
 * @returns {Object[]}
 */
export function findRepeatedWordIssues(file, content) {
  const issues = [];
  const seen = new Map();
  const masked = maskProse(content);
  let previous = null;

  for (const match of masked.matchAll(WORD)) {
    const word = match[0];
    const start = match.index;
    const end = start + word.length;
    if (
      previous &&
      word.length >= 2 &&
      /^[ \t]+$/.test(masked.slice(previous.end, start)) &&
      previous.word.toLowerCase() === word.toLowerCase() &&
      /^\p{L}+$/u.test(word)
    ) {
      issues.push(
        buildIssue({
          type: "repeated-word",
          file,
          content,
          start: previous.start,
          end,
          message: `A palavra "${word}" aparece duas vezes seguidas.`,
          suggestion: {
            replace: previous.word,
            label: `Manter só "${previous.word}"`,
          },
          extra: { word: word.toLowerCase() },
          seen,
        }),
      );
    }
    previous = { word, start, end };
  }
  return issues;
}

/**
 * Palavras candidatas à verificação ortográfica de um arquivo (3+ letras, sem números), com as posições.
 * @param {string} content - Conteúdo completo.
 * @returns {Array<{word: string, start: number, end: number}>}
 */
export function collectWords(content) {
  const masked = maskProse(content);
  const words = [];
  for (const match of masked.matchAll(WORD)) {
    const word = match[0];
    if (word.length >= 3 && !/\d/.test(word)) {
      words.push({ word, start: match.index, end: match.index + word.length });
    }
  }
  return words;
}

/**
 * Issues de palavras desconhecidas, dado o conjunto de palavras que o dicionário não reconhece.
 * @param {string} file - Arquivo (relativo ao livro).
 * @param {string} content - Conteúdo completo.
 * @param {Array<{word: string, start: number, end: number}>} words - Palavras do arquivo (ver {@link collectWords}).
 * @param {Set<string>} misspelled - Palavras desconhecidas (como digitadas).
 * @param {Object[]} [repeated] - Issues de palavra repetida (a palavra errada e repetida conta uma vez só).
 * @returns {Object[]}
 */
export function findTypoIssues(file, content, words, misspelled, repeated = []) {
  const issues = [];
  const seen = new Map();
  for (const w of words) {
    if (!misspelled.has(w.word)) continue;
    if (repeated.some((r) => w.start >= r.start && w.end <= r.end)) continue;
    issues.push(
      buildIssue({
        type: "typo",
        file,
        content,
        start: w.start,
        end: w.end,
        message: `"${w.word}" não foi reconhecida pelo dicionário.`,
        extra: { word: w.word },
        seen,
      }),
    );
  }
  return issues;
}

/**
 * Chave de comparação de palavras para o dicionário do livro (sem diferenciar maiúsculas; acentos importam).
 * @param {string} word - Palavra.
 * @returns {string}
 */
export function dictionaryKey(word) {
  return String(word || "").trim().toLowerCase();
}
