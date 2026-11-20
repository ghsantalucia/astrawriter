// @ts-nocheck
/**
 * @file Nomes de eventos para os campos "antes" e "depois" das fichas de eventos: normalização dos itens digitados e as
 * sugestões (eventos cadastrados e eventos citados que ainda não têm ficha).
 */

import { foldText } from "./helpers.js";
import { isEventFile, splitNames } from "../review/timeline.js";

/** Tamanho máximo do nome de um evento. */
const MAX_NAME = 80;

/**
 * Normaliza um nome de evento digitado: sem espaços sobrando e sem vírgulas (a vírgula separa os itens).
 * @param {string} raw - Texto digitado.
 * @returns {string}
 */
export function normalizeEventName(raw) {
  return String(raw ?? "")
    .replace(/[,;\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME);
}

/**
 * Converte um texto (separado por vírgulas) ou uma lista em nomes de eventos, sem repetir (ignora maiúsculas e acentos).
 * @param {string|string[]|null|undefined} input - Texto ou lista.
 * @returns {string[]}
 */
export function parseEventNames(input) {
  const parts = Array.isArray(input) ? input : splitNames(input);
  const seen = new Set();
  const names = [];
  for (const part of parts) {
    const name = normalizeEventName(part);
    const key = foldText(name);
    if (name && !seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

/**
 * Nomes de eventos conhecidos no livro: os títulos das fichas e os eventos citados em "antes"/"depois" que ainda não têm
 * ficha (cadastrados "no ar").
 * @param {Array<{relPath: string, metadata?: Object}>} files - Arquivos do livro.
 * @returns {{titles: string[], pending: string[]}} `titles`: fichas existentes; `pending`: citados sem ficha.
 */
export function collectEventNames(files) {
  const titles = [];
  const known = new Set();
  const cited = [];
  for (const file of files || []) {
    if (!isEventFile(file.relPath || "")) continue;
    const meta = file.metadata || {};
    const title = String(meta.title || meta.data?.title?.content || "").trim();
    if (title) {
      titles.push(title);
      known.add(foldText(title));
    }
    splitNames(meta.data?.aliases?.content).forEach((a) => known.add(foldText(a)));
    cited.push(...splitNames(meta.data?.after?.content), ...splitNames(meta.data?.before?.content));
  }
  const pending = [];
  const seen = new Set();
  for (const name of cited.map(normalizeEventName)) {
    const key = foldText(name);
    if (name && !known.has(key) && !seen.has(key)) {
      seen.add(key);
      pending.push(name);
    }
  }
  return { titles: titles.sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })), pending };
}
