// @ts-nocheck
/**
 * @file Persistência da Central de Revisões. Tudo fica dentro da pasta do livro, em `.system/review/` (e os digests em
 * `.system/digests/`), longe dos arquivos que o autor vê.
 *
 * - `state.json`      cache da varredura: hash de cada arquivo e os issues derivados dele (só o que mudou é reanalisado).
 * - `registered.json` issues registrados pela IA (contradições, gramática, dicas...).
 * - `dismissed.json`  issues dispensados (por id) e tipos de issue dispensados.
 * - `dictionary.json` palavras que o autor mandou aceitar ("adicionar ao dicionário").
 */

import { normalizePath } from "../utils/helpers.js";

/** Pasta (relativa ao livro) dos arquivos da Central de Revisões. */
export const REVIEW_DIR = ".system/review";
/** Pasta (relativa ao livro) dos digests (arquivos-sombra de metadados). */
export const DIGEST_DIR = ".system/digests";

/**
 * Caminho absoluto de um arquivo de `.system` do livro.
 * @param {string} bookPath - Livro.
 * @param {string} rel - Caminho relativo à raiz do livro.
 * @returns {string}
 */
export function systemPath(bookPath, rel) {
  return `${normalizePath(bookPath).replace(/\/+$/, "")}/${rel}`;
}

/**
 * Lê um JSON de `.system` (devolve o valor padrão se não existir ou estiver corrompido).
 * @template T
 * @param {string} bookPath - Livro.
 * @param {string} rel - Caminho relativo à raiz do livro.
 * @param {T} fallback - Valor padrão.
 * @returns {Promise<T>}
 */
export async function readSystemJson(bookPath, rel, fallback) {
  try {
    const raw = await window.electronAPI.readFile(systemPath(bookPath, rel));
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Grava um JSON em `.system` (cria as pastas que faltarem).
 * @param {string} bookPath - Livro.
 * @param {string} rel - Caminho relativo à raiz do livro.
 * @param {any} data - Dados.
 * @returns {Promise<boolean>}
 */
export async function writeSystemJson(bookPath, rel, data) {
  const result = await window.electronAPI.saveFile(
    systemPath(bookPath, rel),
    JSON.stringify(data, null, 1),
  );
  return Boolean(result?.success);
}

/** Estado vazio de cada arquivo persistido. */
export const EMPTY = {
  state: () => ({ version: 1, scanned: false, files: {} }),
  registered: () => ({ version: 1, issues: [] }),
  dismissed: () => ({ version: 1, issues: {}, types: {} }),
  dictionary: () => ({ version: 1, words: [] }),
  settings: () => ({ version: 1, enabled: true }),
};

/**
 * Carrega tudo o que a central persiste para um livro.
 * @param {string} bookPath - Livro.
 * @returns {Promise<{state: Object, registered: Object, dismissed: Object, dictionary: Object}>}
 */
export async function loadReviewData(bookPath) {
  const [state, registered, dismissed, dictionary, settings] = await Promise.all([
    readSystemJson(bookPath, `${REVIEW_DIR}/state.json`, EMPTY.state()),
    readSystemJson(bookPath, `${REVIEW_DIR}/registered.json`, EMPTY.registered()),
    readSystemJson(bookPath, `${REVIEW_DIR}/dismissed.json`, EMPTY.dismissed()),
    readSystemJson(bookPath, `${REVIEW_DIR}/dictionary.json`, EMPTY.dictionary()),
    readSystemJson(bookPath, `${REVIEW_DIR}/settings.json`, EMPTY.settings()),
  ]);
  return {
    state: { ...EMPTY.state(), ...state },
    registered: { ...EMPTY.registered(), ...registered },
    dismissed: { ...EMPTY.dismissed(), ...dismissed },
    dictionary: { ...EMPTY.dictionary(), ...dictionary },
    settings: { ...EMPTY.settings(), ...settings },
  };
}
