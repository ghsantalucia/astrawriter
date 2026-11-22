/**
 * @file Busca "tolerante" em textos, compartilhada entre o processo principal (busca nos arquivos) e a interface
 * (destaque dos resultados). Ignora maiúsculas, acentos, pontuação (vírgulas, travessões, hífens...) e as palavras
 * pequenas (artigos, conjunções e preposições):
 *   "vira lata"        encontra "vira-lata"
 *   "grimório eldoria" encontra "Grimório de Eldoria"
 *   "grande magnífico" encontra "o grande e magnífico"
 */

/** Artigos, conjunções e preposições que podem ser omitidos na pesquisa (já sem acentos). */
const STOPWORDS = new Set([
  "o",
  "a",
  "os",
  "as",
  "um",
  "uma",
  "uns",
  "umas",
  "e",
  "ou",
  "mas",
  "nem",
  "que",
  "se",
  "de",
  "do",
  "da",
  "dos",
  "das",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "por",
  "pelo",
  "pela",
  "pelos",
  "pelas",
  "para",
  "pra",
  "com",
  "sem",
  "ao",
  "aos",
  "a",
  "à",
  "num",
  "numa",
  "sob",
  "sobre",
  "ate",
  "the",
  "of",
  "and",
  "an",
  "in",
  "on",
  "to",
]);

/**
 * Normaliza um texto (minúsculas e sem acentos) preservando o comprimento, para que os índices valham no original.
 * @param {string} text - Texto original.
 * @returns {string}
 */
export function foldText(text) {
  return String(text ?? "").replace(/[^]/g, (char) => {
    const base = char.normalize("NFD")[0] || char;
    return base.toLowerCase()[0] || base;
  });
}

/**
 * Divide o texto (já normalizado) em palavras, com a posição de cada uma no original.
 * @param {string} folded - Texto normalizado.
 * @returns {Array<{word: string, start: number, end: number}>}
 */
function tokenize(folded) {
  return [...folded.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({
    word: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));
}

/**
 * Palavras significativas do termo pesquisado (sem artigos/conjunções/preposições e sem pontuação).
 * @param {string} term - Termo digitado.
 * @returns {string[]}
 */
export function looseWords(term) {
  return tokenize(foldText(term))
    .map((t) => t.word)
    .filter((w) => !STOPWORDS.has(w));
}

/**
 * Todas as ocorrências do termo no texto, de forma tolerante (ver o topo do arquivo). Também aceita a ocorrência
 * literal (ignorando só maiúsculas/acentos), útil enquanto a palavra ainda está sendo digitada.
 * @param {string} text - Texto original.
 * @param {string} term - Termo pesquisado.
 * @returns {Array<{start: number, end: number}>} Trechos do texto original, ordenados e sem sobreposição.
 */
export function findMatches(text, term) {
  const source = String(text ?? "");
  const folded = foldText(source);
  const literal = foldText(String(term ?? "").trim());
  if (!literal) return [];

  const ranges = [];
  for (let i = folded.indexOf(literal); i !== -1;) {
    ranges.push({ start: i, end: i + literal.length });
    i = folded.indexOf(literal, i + literal.length);
  }

  const words = looseWords(term);
  if (words.length > 0 && (words.length > 1 || words[0] !== literal)) {
    const tokens = tokenize(folded).filter((t) => !STOPWORDS.has(t.word));
    // Para um termo de uma palavra, o literal acima já cobre; para várias, as palavras precisam ser sequenciais
    for (let i = 0; i + words.length <= tokens.length; i++) {
      const fits = words.every((w, k) => {
        const token = tokens[i + k].word;
        return k === words.length - 1 ? token.startsWith(w) : token === w;
      });
      if (fits) {
        ranges.push({
          start: tokens[i].start,
          end: tokens[i + words.length - 1].end,
        });
      }
    }
  }

  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start < last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}
