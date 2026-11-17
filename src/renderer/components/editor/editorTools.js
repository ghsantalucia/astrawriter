/**
 * @file Ferramentas do editor que operam diretamente no documento do ProseMirror (usado pelo Toast UI Editor):
 * decoração dos links internos (automático e arquivo inexistente), busca/substituição de texto e link automático.
 */

import { foldText } from "../../utils/helpers.js";

/** Fragmento que marca um link criado pelo botão de link automático (ainda não revisado/sincronizado). */
export const AUTO_LINK_FRAGMENT = "#auto";

/**
 * Indica se um href aponta para um arquivo Markdown do livro (e não para a web).
 * @param {string} href - Endereço do link.
 * @returns {boolean}
 */
export function isInternalHref(href) {
  if (!href || /^(https?:|mailto:|tel:|\/\/)/i.test(href)) return false;
  return href.split(/[?#]/)[0].toLowerCase().endsWith(".md");
}

/**
 * Caminho relativo à raiz do livro (minúsculo, sem barra inicial, `?` ou `#`) apontado por um href interno.
 * @param {string} href - Endereço do link interno.
 * @returns {string}
 */
export function hrefToRelPath(href) {
  let path = String(href || "").split(/[?#]/)[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    // mantém o caminho como veio
  }
  return foldText(path.replace(/^[/\\]+/, "").replace(/\\/g, "/"));
}

/**
 * Remove o marcador de link automático de todos os links do texto Markdown (usado ao sincronizar, quando os links
 * passam a valer como links normais).
 * @param {string} markdown - Texto Markdown.
 * @returns {string}
 */
export function stripAutoLinkMarks(markdown) {
  return String(markdown ?? "").replace(/(\]\([^)\s]*?\.md)#auto(\))/g, "$1$2");
}

// ========== Links quebrados ========== //

/**
 * Localiza os links internos que apontam para arquivos inexistentes, na ordem do documento.
 * No modo formatado usa a marca de link; no modo Markdown procura `](caminho.md)` no texto.
 * @param {import('prosemirror-model').Node} doc - Documento do ProseMirror.
 * @param {Set<string>} existing - Caminhos relativos (minúsculos) dos arquivos existentes.
 * @param {boolean} markdownMode - Se o documento é o do modo Markdown.
 * @returns {Array<{from: number, to: number}>}
 */
export function findBrokenLinkRanges(doc, existing, markdownMode) {
  const ranges = [];
  const push = (from, to, href) => {
    const last = ranges[ranges.length - 1];
    if (last && last.href === href && last.to === from) last.to = to;
    else ranges.push({ from, to, href });
  };

  doc.descendants((node, pos) => {
    if (markdownMode) {
      if (!node.isTextblock) return true;
      const text = node.textContent;
      for (const m of text.matchAll(
        /\[[^\]\n]*\]\((\/?[^)\s]*?\.md)(?:#[^)\s]*)?\)/gi,
      )) {
        if (!existing.has(hrefToRelPath(m[1]))) {
          push(pos + 1 + m.index, pos + 1 + m.index + m[0].length, m[1]);
        }
      }
      return false;
    }
    if (!node.isText) return true;
    const href = node.marks.find((m) => m.type.name === "link")?.attrs?.linkUrl;
    if (isInternalHref(href) && !existing.has(hrefToRelPath(href))) {
      push(pos, pos + node.nodeSize, href);
    }
    return false;
  });
  return ranges.map(({ from, to }) => ({ from, to }));
}

// ========== Busca ========== //

/**
 * Procura um termo no documento (ignorando maiúsculas e acentos), bloco de texto por bloco de texto.
 * @param {import('prosemirror-model').Node} doc - Documento do ProseMirror.
 * @param {string} term - Termo procurado.
 * @returns {Array<{from: number, to: number}>} Ocorrências em posições do documento.
 */
export function findMatches(doc, term) {
  const needle = foldText(String(term ?? ""));
  if (!needle) return [];

  const matches = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;

    let text = "";
    const segments = [];
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText) {
        segments.push({
          at: text.length,
          pos: start,
          length: child.text.length,
        });
        text += child.text;
      } else {
        // Nós inline que não são texto (imagens, quebras): ocupam um caractere que nunca casa
        segments.push({ at: text.length, pos: start, length: 1 });
        text += "￼";
      }
    });

    const toPos = (index) => {
      const seg = segments.find(
        (s) => index >= s.at && index < s.at + s.length,
      );
      return seg ? seg.pos + (index - seg.at) : null;
    };

    const folded = foldText(text);
    let index = folded.indexOf(needle);
    while (index !== -1) {
      const from = toPos(index);
      const last = toPos(index + needle.length - 1);
      if (from !== null && last !== null) matches.push({ from, to: last + 1 });
      index = folded.indexOf(needle, index + needle.length);
    }
    return false;
  });
  return matches;
}

/**
 * Substitui ocorrências no documento em uma única transação (da última para a primeira, para as posições valerem).
 * @param {import('prosemirror-view').EditorView} view - View do ProseMirror.
 * @param {Array<{from: number, to: number}>} matches - Ocorrências a substituir.
 * @param {string} replacement - Texto que entra no lugar.
 * @returns {number} Quantidade de substituições.
 */
export function replaceMatches(view, matches, replacement) {
  if (matches.length === 0) return 0;
  const tr = view.state.tr;
  [...matches]
    .sort((a, b) => b.from - a.from)
    .forEach(({ from, to }) => tr.insertText(replacement, from, to));
  view.dispatch(tr);
  return matches.length;
}

// ========== Link automático ========== //

/** Tipos de bloco em que o link automático não age. */
const SKIPPED_BLOCKS = new Set(["codeBlock", "heading"]);

/** Caractere que faz parte de uma palavra (para exigir palavra inteira). */
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * Cria links internos (marcados como automáticos) para todas as ocorrências dos termos no texto livre do
 * documento. Não mexe em títulos, blocos de código, textos já linkados nem em código inline.
 * @param {import('prosemirror-view').EditorView} view - View do ProseMirror (modo visual).
 * @param {Array<{term: string, href: string}>} terms - Termos, do maior para o menor.
 * @returns {number} Quantidade de links criados.
 */
export function applyAutoLinks(view, terms) {
  const { schema, doc } = view.state;
  const linkType = schema.marks.link;
  if (!linkType || terms.length === 0) return 0;

  const tr = view.state.tr;
  let count = 0;

  doc.descendants((node, pos) => {
    if (SKIPPED_BLOCKS.has(node.type.name)) return false;
    if (!node.isTextblock) return true;

    node.forEach((child, offset) => {
      if (!child.isText) return;
      if (
        child.marks.some(
          (m) => m.type.name === "link" || m.type.name === "code",
        )
      )
        return;

      const folded = foldText(child.text);
      const found = [];
      terms.forEach(({ term, href }) => {
        const needle = foldText(term);
        let index = folded.indexOf(needle);
        while (index !== -1) {
          const before = folded[index - 1];
          const after = folded[index + needle.length];
          const whole =
            !(before && WORD_CHAR.test(before)) &&
            !(after && WORD_CHAR.test(after));
          if (whole)
            found.push({ start: index, end: index + needle.length, href });
          index = folded.indexOf(needle, index + needle.length);
        }
      });

      // Termos maiores vêm primeiro; ocorrências que se sobrepõem a uma já aceita são descartadas
      const accepted = [];
      found
        .sort((a, b) => a.start - b.start || b.end - a.end)
        .forEach((match) => {
          if (
            accepted.every((a) => match.start >= a.end || match.end <= a.start)
          )
            accepted.push(match);
        });

      const base = pos + 1 + offset;
      accepted.forEach((match) => {
        const mark = linkType.create({
          linkUrl: `${match.href}${AUTO_LINK_FRAGMENT}`,
        });
        tr.addMark(base + match.start, base + match.end, mark);
        count += 1;
      });
    });
    return false;
  });

  if (count > 0) view.dispatch(tr);
  return count;
}

/**
 * Remove o link que envolve um elemento `<a>` do editor visual.
 * @param {import('prosemirror-view').EditorView} view - View do ProseMirror (modo visual).
 * @param {HTMLElement} anchor - Elemento `<a>` do link.
 * @returns {boolean} Se algum link foi removido.
 */
export function removeLinkAt(view, anchor) {
  const linkType = view.state.schema.marks.link;
  if (!linkType) return false;
  const from = view.posAtDOM(anchor, 0);
  const to = view.posAtDOM(anchor, anchor.childNodes.length);
  if (!(to > from)) return false;
  view.dispatch(view.state.tr.removeMark(from, to, linkType));
  return true;
}

// ========== Plugin do ProseMirror ========== //

/**
 * Cria o plugin do Toast UI Editor que decora o documento:
 *  - links internos para arquivos que não existem mais (classe `wiki-broken` + tooltip);
 *  - ocorrências da busca (`find-match` e `find-current`), nos dois modos do editor.
 *
 * As decorações são recalculadas a cada atualização do estado, sempre consistentes com o documento atual.
 * @param {Object} api - Dados dinâmicos consultados pelo plugin.
 * @param {() => Set<string>} api.getExisting - Caminhos relativos (minúsculos) dos arquivos existentes.
 * @param {() => {term: string, current: number}} api.getFind - Busca ativa (termo vazio = sem busca).
 * @param {(doc: Object) => Array<{from: number, to: number, kind: string}>} [api.getProblemRanges] - Problemas de escrita a sublinhar.
 * @param {() => boolean} [api.isLocked] - Se o editor está somente leitura (o ProseMirror deixa de ser editável).
 * @param {(pmState: Object) => void} [api.onContext] - Recebe as classes do ProseMirror (ex.: `TextSelection`).
 * @returns {import('@toast-ui/editor').PluginFn}
 */
export function createEditorPlugin(api) {
  return ({ pmState, pmView }) => {
    const { Plugin, PluginKey } = pmState;
    const { Decoration, DecorationSet } = pmView;
    api.onContext?.(pmState);

    const build = (name, withLinks) =>
      new Plugin({
        key: new PluginKey(name),
        props: {
          editable: () => !api.isLocked?.(),
          decorations(state) {
            const decorations = [];

            if (withLinks) {
              const existing = api.getExisting();
              state.doc.descendants((node, pos) => {
                if (!node.isText) return true;
                const link = node.marks.find((m) => m.type.name === "link");
                const href = link?.attrs?.linkUrl;
                if (
                  isInternalHref(href) &&
                  !existing.has(hrefToRelPath(href))
                ) {
                  decorations.push(
                    Decoration.inline(pos, pos + node.nodeSize, {
                      class: "wiki-broken",
                      "data-tooltip": "Este arquivo não existe mais",
                    }),
                  );
                }
                return false;
              });
            }

            const { term, current } = api.getFind();
            if (term) {
              findMatches(state.doc, term).forEach((match, index) => {
                decorations.push(
                  Decoration.inline(match.from, match.to, {
                    class:
                      index === current
                        ? "find-match find-current"
                        : "find-match",
                  }),
                );
              });
            }

            // Problemas de escrita (sublinhado ondulado próprio, no lugar do corretor do Chromium)
            (api.getProblemRanges?.(state.doc) || []).forEach((range) => {
              decorations.push(
                Decoration.inline(range.from, range.to, {
                  class:
                    range.kind === "repeated"
                      ? "writing-repeated"
                      : "writing-spell",
                }),
              );
            });

            return decorations.length
              ? DecorationSet.create(state.doc, decorations)
              : DecorationSet.empty;
          },
        },
      });

    return {
      wysiwygPlugins: [() => build("dw-decorations-ww", true)],
      markdownPlugins: [() => build("dw-decorations-md", false)],
    };
  };
}
