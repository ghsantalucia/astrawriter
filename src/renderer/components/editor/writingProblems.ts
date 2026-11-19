// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Localiza no documento (ProseMirror) os problemas de escrita mostrados no rodapé: palavras que o dicionário não
 * reconhece e palavras repetidas em sequência ("de de"). Usado para o aviso levar o cursor de um problema ao próximo.
 */

/** Palavra (letras, números e apóstrofo). */
const WORD = /[\p{L}\p{N}'’]+/gu;

/**
 * Indica se a palavra entra na verificação ortográfica (3+ letras e sem números).
 * @param {string} word - Palavra.
 * @returns {boolean}
 */
export function isCheckableWord(word) {
  return word.length >= 3 && !/\d/.test(word);
}

/**
 * Texto de um bloco de texto com a posição do documento de cada caractere (nós que não são texto viram espaço).
 * @param {import('prosemirror-model').Node} block - Bloco (parágrafo, título, linha...).
 * @param {number} blockPos - Posição do bloco no documento.
 * @returns {{text: string, positions: Array<number|null>}}
 */
function blockText(block, blockPos) {
  let text = "";
  const positions = [];
  const skipped = [];
  block.forEach((child, offset) => {
    if (child.isText) {
      // Textos linkados (nomes de fichas, links externos) e código nunca são conferidos
      const skip = child.marks.some(
        (m) => m.type.name === "link" || m.type.name === "code",
      );
      for (let i = 0; i < child.text.length; i++) {
        text += child.text[i];
        positions.push(blockPos + 1 + offset + i);
        skipped.push(skip);
      }
    } else {
      text += " ";
      positions.push(null);
      skipped.push(true);
    }
  });

  // No modo Markdown os links, o código e o HTML aparecem como texto: também ficam de fora
  for (const m of text.matchAll(/\]\([^)]*\)|<[^>]+>|`[^`]*`/g)) {
    for (let i = m.index; i < m.index + m[0].length; i++) skipped[i] = true;
  }
  return { text, positions, skipped };
}

/**
 * Problemas de escrita do documento, na ordem do texto.
 * @param {import('prosemirror-model').Node} doc - Documento.
 * @param {Set<string>} misspelled - Palavras que o dicionário não reconhece (como digitadas).
 * @param {Object} [options]
 * @param {boolean} [options.includeRepeated=true] - Se palavras repetidas em sequência também contam.
 * @param {Set<string>} [options.ignoredRepeats] - Palavras (minúsculas) cuja repetição o usuário mandou ignorar.
 * @returns {Array<{from: number, to: number, kind: "spelling"|"repeated", word: string, removeFrom?: number}>}
 */
export function findWritingProblemRanges(
  doc,
  misspelled,
  { includeRepeated = true, ignoredRepeats = new Set() } = {},
) {
  const ranges = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const { text, positions, skipped } = blockText(node, pos);

    let previous = null;
    for (const match of text.matchAll(WORD)) {
      const word = match[0];
      const start = match.index;
      const end = start + word.length;
      const from = positions[start];
      const to = positions[end - 1] === null ? null : positions[end - 1] + 1;
      if (from === null || to === null || skipped[start]) {
        previous = null;
        continue;
      }

      if (misspelled.has(word)) {
        ranges.push({ from, to, kind: "spelling", word });
      }

      // Repetida: mesma palavra logo depois da anterior, separada só por espaços
      if (
        includeRepeated &&
        previous &&
        word.length >= 2 &&
        /^\s+$/.test(text.slice(previous.end, start)) &&
        previous.word.toLowerCase() === word.toLowerCase() &&
        !ignoredRepeats.has(word.toLowerCase()) &&
        /^\p{L}+$/u.test(word)
      ) {
        ranges.push({
          from: previous.from,
          to,
          kind: "repeated",
          word,
          removeFrom: positions[previous.end - 1] + 1,
        });
      }
      previous = { word, end, from };
    }
    return false;
  });

  // Uma palavra errada e repetida conta uma vez só (como "repetida")
  const repeatedRanges = ranges.filter((r) => r.kind === "repeated");
  return ranges
    .filter(
      (r) =>
        r.kind === "repeated" ||
        !repeatedRanges.some((rep) => r.from >= rep.from && r.to <= rep.to),
    )
    .sort((a, b) => a.from - b.from);
}
