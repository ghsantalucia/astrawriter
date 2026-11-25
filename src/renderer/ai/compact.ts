/**
 * @file "Otimizar instruções": enxuga os textos de instrução que o app envia à IA (prompt de sistema, descrição das tools e
 * texto das skills) para gastar menos tokens, sem mudar o sentido. Nunca é aplicado ao texto do autor (capítulos, fichas,
 * mensagens do chat). É determinístico: tira enfeites de Markdown, linhas em branco, preâmbulos e palavras de enchimento.
 */

import { t } from "../../shared/i18n.js";

/** Trocas seguras de expressões longas por curtas (a IA entende igual). */
const SHORTEN: Array<[RegExp, string]> = [
  [/\b(?:é importante|importante) (?:que você|lembrar|notar) (?:de )?(?:que )?/gi, ""],
  [/\bLembre-se de que\s+/gi, ""],
  [/\bPor favor,?\s+/gi, ""],
  [/\bVocê deve\s+/g, ""],
  [/\bVocê precisa\s+/g, ""],
  [/\bpor exemplo\b/gi, "ex."],
  [/\bou seja\b/gi, "isto é"],
  [/\bde forma (?:geral|resumida)\b/gi, "em geral"],
  [/\bno entanto\b/gi, "mas"],
  [/\bpor outro lado\b/gi, "mas"],
];

/**
 * Enxuga um texto de instruções.
 * @param {string} text - Instruções.
 * @returns {string}
 */
export function compactInstructions(text) {
  let out = String(text ?? "").replace(/\r\n/g, "\n");
  // Blocos de código ficam como estão (podem ser exemplos literais)
  const blocks = [];
  out = out.replace(/```[\s\S]*?```/g, (m) => {
    blocks.push(m);
    return `@@BLOCO${blocks.length - 1}@@`;
  });
  out = out
    .replace(/^\s*(?:---|\*\*\*|___)\s*$/gm, "") // linhas horizontais
    .replace(/^>\s?/gm, "") // citações
    .replace(/\*\*(.+?)\*\*/g, "$1") // negrito
    .replace(/^#{1,6}\s+/gm, "# ") // títulos: um nível só
    .replace(/[ \t]+$/gm, "")
    .replace(/[ \t]{2,}/g, " ");
  for (const [re, to] of SHORTEN) out = out.replace(re, to);
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out.replace(/@@BLOCO(\d+)@@/g, (_, i) => blocks[Number(i)]);
}

/**
 * Descrição curta de uma tool: as duas primeiras frases, no máximo 240 caracteres.
 * @param {string} description - Descrição completa.
 * @returns {string}
 */
export function compactDescription(description) {
  const text = compactInstructions(description).replace(/\s*\n\s*/g, " ");
  const sentences = text.split(/(?<=[.!?])\s+/);
  let out = sentences.slice(0, 2).join(" ");
  if (out.length > 240) out = `${out.slice(0, 237).trimEnd()}…`;
  return out;
}

/** Pedido de respostas curtas (acrescentado ao prompt de sistema quando as instruções são otimizadas). */
export const CONCISE_NOTE =
  "\n\n" + t("# Estilo\nResponda curto e direto: sem preâmbulo, sem repetir o pedido e sem resumir o que acabou de fazer. Isto não vale para textos do livro que o autor pedir (escreva-os por completo, no estilo dele).");
