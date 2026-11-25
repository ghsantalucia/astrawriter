/**
 * @file Link automático sobre texto Markdown (sem o editor): transforma em links internos as ocorrências dos nomes e
 * apelidos das fichas do livro. É a versão em texto do botão "Linkar termos" do editor, usada pela IA em arquivos que
 * não estão abertos. Os links nascem com o marcador `#auto` (revisão pendente até a sincronização).
 */

import { foldText } from "./helpers.js";

/** Marcador de link automático (o mesmo do editor). */
const AUTO_FRAGMENT = "#auto";

/** Caractere que faz parte de uma palavra (para exigir palavra inteira). */
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/** Trechos de uma linha em que não se deve linkar: código inline, links, imagens e HTML. */
const PROTECTED = /(`[^`]*`|!?\[[^\]]*\]\([^)]*\)|<[^>]+>)/;

/**
 * Linka os termos em um trecho de texto livre (sem links nem código).
 * @param {string} text - Trecho.
 * @param {Array<{term: string, href: string}>} terms - Termos, do maior para o menor.
 * @returns {{text: string, count: number}}
 */
function linkSegment(text, terms) {
  const folded = foldText(text);
  if (folded.length !== text.length) return { text, count: 0 };

  const found = [];
  for (const { term, href } of terms) {
    const needle = foldText(term);
    if (!needle) continue;
    let index = folded.indexOf(needle);
    while (index !== -1) {
      const before = folded[index - 1];
      const after = folded[index + needle.length];
      const whole =
        !(before && WORD_CHAR.test(before)) &&
        !(after && WORD_CHAR.test(after));
      if (whole) found.push({ start: index, end: index + needle.length, href });
      index = folded.indexOf(needle, index + needle.length);
    }
  }

  // Termos maiores vêm primeiro; ocorrências sobrepostas a uma já aceita são descartadas
  const accepted = [];
  found
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .forEach((match) => {
      if (accepted.every((a) => match.start >= a.end || match.end <= a.start)) {
        accepted.push(match);
      }
    });

  let result = "";
  let cursor = 0;
  for (const match of accepted) {
    result += text.slice(cursor, match.start);
    result += `[${text.slice(match.start, match.end)}](${match.href}${AUTO_FRAGMENT})`;
    cursor = match.end;
  }
  result += text.slice(cursor);
  return { text: result, count: accepted.length };
}

/**
 * Cria links internos para as ocorrências dos termos no corpo Markdown. Títulos também são linkados; não mexe em blocos de código,
 * código inline, imagens nem textos que já são links.
 * @param {string} body - Corpo Markdown (sem frontmatter).
 * @param {Array<{term: string, href: string}>} terms - Termos, do maior para o menor.
 * @returns {{body: string, count: number}} Novo corpo e quantidade de links criados.
 */
export function applyAutoLinksToMarkdown(body, terms) {
  if (!terms.length) return { body, count: 0 };

  let count = 0;
  let inFence = false;
  const lines = String(body ?? "")
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence || /^( {4}|\t)/.test(line)) return line;

      return line
        .split(PROTECTED)
        .map((piece, index) => {
          if (index % 2 === 1) return piece; // trecho protegido
          const linked = linkSegment(piece, terms);
          count += linked.count;
          return linked.text;
        })
        .join("");
    });

  return { body: lines.join("\n"), count };
}
