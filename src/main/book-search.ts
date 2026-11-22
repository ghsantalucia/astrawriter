/**
 * @file Busca de texto nos arquivos Markdown de um livro (por título e por conteúdo), executada no processo principal
 * para não precisar trafegar o conteúdo de todos os arquivos até o renderer.
 */

import fs from "node:fs";
import path from "node:path";
import { findMatches, foldText } from "../shared/looseText.js";
import { parseTags } from "../shared/tags.js";
const matter = require("gray-matter");

/** Nome (sem extensão) do arquivo-modelo de cada pasta; nunca entra nos resultados. */
const TEMPLATE_FILE_KEY = "template";

/** Quantidade de caracteres exibidos de cada lado do trecho encontrado. */
const SNIPPET_RADIUS = 36;

/**
 * Remove as marcações Markdown (títulos, citações, listas, negrito, itálico, código, links etc.) deixando só o texto.
 * Usado para que o trecho exibido na busca apareça limpo, sem formatação.
 * @param {string} markdown - Texto em Markdown.
 * @returns {string} Texto simples.
 */
export function stripMarkdown(markdown) {
  return String(markdown ?? "")
    .replace(/\r/g, "")
    .replace(/^\s*(\x60\x60\x60|~~~).*$/gm, " ")
    .replace(/^\s*([-*_]\s*){3,}$/gm, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*(>\s?)+/gm, "")
    .replace(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/gm, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\|/g, " ")
    .replace(/(\*\*|__|~~|\*|\x60)/g, "")
    .replace(/(^|\s)_+|_+(?=\s|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Monta o trecho limpo (sem Markdown) ao redor da primeira ocorrência do termo (busca tolerante).
 * @param {string} markdown - Texto original em Markdown.
 * @param {string} term - Termo pesquisado.
 * @returns {string|null} Trecho em texto simples, ou null se o termo não aparece.
 */
function cleanSnippet(markdown, term) {
  const plain = stripMarkdown(markdown);
  const [first] = findMatches(plain, term);
  if (!first) return null;
  return buildSnippet(plain, first.start, first.end - first.start);
}

/**
 * Extrai um trecho curto do texto ao redor do primeiro ponto onde o termo aparece.
 * @param {string} text - Texto original.
 * @param {number} index - Posição onde o termo foi encontrado.
 * @param {number} length - Tamanho do termo.
 * @returns {string} Trecho em linha única, com reticências nas pontas cortadas.
 */
function buildSnippet(text, index, length) {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + length + SNIPPET_RADIUS);
  const piece = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${piece}${end < text.length ? "…" : ""}`;
}

/**
 * Reúne o `content` preenchido de todas as variáveis (frontmatter `data`), inclusive as aninhadas.
 * @param {Object|undefined} data - Objeto `data` do frontmatter.
 * @returns {string[]} Valores não vazios.
 */
function collectVariableValues(data) {
  const values = [];
  if (!data || typeof data !== "object") return values;

  for (const node of Object.values(data)) {
    if (!node || typeof node !== "object") continue;
    if ("content" in node || "placeholder" in node || "required" in node) {
      if ((node as any).content) values.push(String((node as any).content));
    } else {
      values.push(...collectVariableValues(node));
    }
  }
  return values;
}

/**
 * Lista os arquivos .md de um diretório, priorizando o rascunho (.md.temp) quando existir.
 * @param {fs.Dirent[]} entries - Entradas do diretório.
 * @param {string} dir - Caminho do diretório.
 * @returns {Array<{key: string, originalPath: string, activePath: string}>}
 */
function collectMarkdownFiles(entries, dir) {
  const files = new Map();

  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const lower = entry.name.toLowerCase();
    if (!lower.endsWith(".md") && !lower.endsWith(".md.temp")) continue;

    const key = entry.name.replace(/\.temp$/i, "").replace(/\.md$/i, "");
    if (key === TEMPLATE_FILE_KEY) continue;

    const originalPath = path.join(dir, `${key}.md`);
    const tempPath = `${originalPath}.temp`;
    files.set(key, {
      key,
      originalPath,
      activePath: fs.existsSync(tempPath) ? tempPath : originalPath,
    });
  }

  return [...files.values()];
}

/**
 * Compara dois resultados da pesquisa:
 *  1. mais termos encontrados primeiro;
 *  2. empate: a ordem dos termos digitados (quem casa com o primeiro termo vem antes);
 *  3. empate: ordem alfabética do título.
 * @param {{matched: number[], title: string}} a
 * @param {{matched: number[], title: string}} b
 * @returns {number}
 */
export function compareResults(a, b) {
  if (a.matched.length !== b.matched.length) {
    return b.matched.length - a.matched.length;
  }
  for (let i = 0; i < a.matched.length; i++) {
    if (a.matched[i] !== b.matched[i]) return a.matched[i] - b.matched[i];
  }
  return a.title.localeCompare(b.title, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

/**
 * Separa a pesquisa em termos (separados por vírgula), na ordem digitada. Termos começados por "#" pesquisam tags (várias
 * tags no mesmo termo, separadas por espaço, precisam existir todas); os demais pesquisam título, texto e variáveis.
 * @param {string} query - Texto digitado.
 * @returns {Array<{index: number, kind: "text"|"tag", text?: string, wanted?: string[]}>}
 */
export function parseQuery(query) {
  const terms = [];
  String(query ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .forEach((term) => {
      if (term.startsWith("#")) {
        const wanted = term
          .split(/\s+/)
          .map((t) => foldText(t.replace(/^#+/, "")))
          .filter(Boolean);
        if (wanted.length > 0) {
          terms.push({ index: terms.length, kind: "tag", wanted });
        }
      } else {
        terms.push({ index: terms.length, kind: "text", text: term });
      }
    });
  return terms;
}

/**
 * Procura os termos em todos os arquivos Markdown do livro (título, conteúdo, variáveis e tags). Com vários termos
 * separados por vírgula, o arquivo entra no resultado se casar com **qualquer** um deles.
 * @param {string} bookPath - Caminho absoluto da pasta do livro.
 * @param {string} term - Pesquisa (ignora maiúsculas, acentos, pontuação e artigos).
 * @returns {Promise<Array<{path: string, relativePath: string, title: string, matchType: "title"|"content"|"tag", snippet: string}>>}
 * Resultados ordenados (título primeiro, depois o resto, ambos alfabéticos).
 */
export async function searchBook(bookPath, term) {
  const terms = parseQuery(term);
  if (!bookPath || terms.length === 0 || !fs.existsSync(bookPath)) return [];

  const results = [];

  /**
   * Percorre o diretório recursivamente, ignorando pastas ocultas (ex.: .system).
   * @param {string} dir - Diretório atual.
   * @returns {Promise<void>}
   */
  async function walk(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const file of collectMarkdownFiles(entries, dir)) {
      try {
        const raw = await fs.promises.readFile(file.activePath, "utf8");
        const parsed = matter(raw);
        const title = parsed.data?.title || `${file.key}.md`;
        const relativePath = path
          .relative(bookPath, file.originalPath)
          .replace(/\\/g, "/");
        const base = { path: file.originalPath, relativePath, title };

        const body = parsed.content || "";
        const variables = collectVariableValues(parsed.data?.data).join("\n");
        const tags = parseTags(parsed.data?.tags);

        // Confere cada termo: quais casam (na ordem digitada) e onde
        const matched = [];
        let titleHit = false;
        let snippet = null;
        const shownTags = [];
        for (const t of terms) {
          if (t.kind === "text") {
            const inTitle = findMatches(title, t.text).length > 0;
            const inText =
              cleanSnippet(body, t.text) ?? cleanSnippet(variables, t.text);
            if (!inTitle && inText === null) continue;
            matched.push(t.index);
            titleHit ||= inTitle;
            if (snippet === null && inText !== null) snippet = inText;
          } else {
            const sets = t.wanted.map((w) =>
              tags.filter((tag) => foldText(tag).includes(w)),
            );
            if (!sets.every((found) => found.length > 0)) continue;
            matched.push(t.index);
            sets.forEach((found) => shownTags.push(...found));
          }
        }
        if (matched.length === 0) continue;

        results.push({
          ...base,
          matchType: titleHit ? "title" : snippet !== null ? "content" : "tag",
          snippet: titleHit ? "" : (snippet ?? ""),
          tags: [...new Set(shownTags)],
          matched,
        });
      } catch (err) {
        console.error(`[SEARCH] Erro ao ler ${file.activePath}:`, err);
      }
    }

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        await walk(path.join(dir, entry.name));
      }
    }
  }

  await walk(bookPath);
  return results.sort(compareResults);
}
