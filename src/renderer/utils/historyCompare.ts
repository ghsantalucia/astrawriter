/**
 * @file Comparação visual entre duas versões de um arquivo Markdown: cada lado é exibido com o Markdown
 * interpretado, e os trechos que diferem (removidos à esquerda, incluídos à direita) recebem um fundo sutil,
 * como em um diff de código.
 */

import { marked } from "marked";
import DOMPurify from "dompurify";
import { diffLines } from "./diff.js";
import { splitFrontmatter } from "./markdown.js";

/**
 * Agrupa linhas consecutivas com o mesmo estado (alterada ou não) em trechos que serão interpretados juntos como
 * Markdown. Linhas em branco acompanham o trecho anterior, para não quebrar parágrafos e listas.
 * @param {Array<{text: string}>} lines - Linhas do texto.
 * @param {(line: Object) => boolean} isChanged - Indica se a linha foi alterada.
 * @returns {Array<{changed: boolean, text: string}>}
 */
function groupSegments(lines, isChanged) {
  const segments = [];
  let current = null;

  lines.forEach((line) => {
    if (line.text.trim() === "" && current) {
      current.lines.push(line.text);
      return;
    }
    const changed = isChanged(line);
    if (!current || current.changed !== changed) {
      current = { changed, lines: [] };
      segments.push(current);
    }
    current.lines.push(line.text);
  });

  return segments.map((s) => ({
    changed: s.changed,
    text: s.lines.join("\n"),
  }));
}

/**
 * Converte os trechos em HTML (Markdown interpretado e sanitizado), marcando os alterados.
 * @param {Array<{changed: boolean, text: string}>} segments - Trechos.
 * @param {"removed"|"added"} kind - Tipo de marcação dos trechos alterados.
 * @returns {string} HTML.
 */
function renderSegments(segments, kind) {
  return segments
    .filter((s) => s.text.trim() !== "")
    .map((segment) => {
      const html = DOMPurify.sanitize(
        marked.parse(segment.text, { gfm: true }) as string,
      );
      return `<div class="diff-seg${segment.changed ? ` diff-seg-${kind}` : ""}">${html}</div>`;
    })
    .join("");
}

/**
 * Prepara a comparação entre o texto atual e uma versão do histórico.
 * @param {string|null} currentText - Conteúdo atual do arquivo (com frontmatter).
 * @param {string|null} versionText - Conteúdo da versão escolhida (com frontmatter).
 * @returns {{currentHtml: string, versionHtml: string, identical: boolean, metadataOnly: boolean}}
 */
export function buildComparison(currentText, versionText) {
  const current = splitFrontmatter(currentText ?? "");
  const version = splitFrontmatter(versionText ?? "");
  const { oldLines, newLines } = diffLines(current.body, version.body);

  return {
    currentHtml: renderSegments(
      groupSegments(oldLines, (l) => l.deleted),
      "removed",
    ),
    versionHtml: renderSegments(
      groupSegments(newLines, (l) => l.added),
      "added",
    ),
    identical: (currentText ?? "") === (versionText ?? ""),
    metadataOnly:
      current.body === version.body &&
      current.frontmatter !== version.frontmatter,
  };
}
