// @ts-nocheck
/**
 * @file Varredura incremental de um livro para a Central de Revisões: lê os arquivos Markdown (o rascunho `.md.temp`
 * tem prioridade sobre o oficial) e devolve o conteúdo só dos que mudaram desde a última análise.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Calcula o hash SHA-1 de um texto.
 * @param {string} text - Texto.
 * @returns {string}
 */
function sha1(text) {
  return crypto.createHash("sha1").update(text, "utf8").digest("hex");
}

/**
 * Lista os arquivos Markdown do livro (ignora pastas ocultas como `.system`).
 * @param {string} dir - Pasta.
 * @param {string} root - Raiz do livro.
 * @param {Map<string, {official: boolean, temp: boolean}>} found - Acumulador por caminho relativo (sem `.temp`).
 * @returns {Promise<void>}
 */
async function walk(dir, root, found) {
  let entries = [];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, root, found);
      continue;
    }
    const lower = entry.name.toLowerCase();
    if (!lower.endsWith(".md") && !lower.endsWith(".md.temp")) continue;
    const isTemp = lower.endsWith(".md.temp");
    const rel = path
      .relative(root, isTemp ? full.slice(0, -5) : full)
      .split(path.sep)
      .join("/");
    const info = found.get(rel) || { official: false, temp: false };
    if (isTemp) info.temp = true;
    else info.official = true;
    found.set(rel, info);
  }
}

/**
 * Varre o livro e informa quais arquivos mudaram.
 * @param {string} bookPath - Caminho absoluto do livro.
 * @param {Object<string, string>} [known] - Hash da última versão analisada, por caminho relativo.
 * @param {string[]|null} [only] - Se informado, só estes arquivos (caminho relativo) têm o conteúdo lido; os demais voltam
 *   como não alterados.
 * @returns {Promise<Array<{rel: string, path: string, isTemp: boolean, hash: string, changed: boolean, content: string|null}>>}
 */
export async function scanBook(bookPath, known = {}, only = null) {
  const wanted = Array.isArray(only) ? new Set(only) : null;
  const found = new Map();
  await walk(bookPath, bookPath, found);

  const files = [];
  for (const [rel, info] of found) {
    const official = path.join(bookPath, ...rel.split("/"));
    if (wanted && !wanted.has(rel)) {
      files.push({
        rel,
        path: official,
        isTemp: info.temp,
        isNew: info.temp && !info.official,
        hash: known[rel] || null,
        changed: false,
        content: null,
      });
      continue;
    }
    const active = info.temp ? `${official}.temp` : official;
    let content = "";
    try {
      content = await fs.promises.readFile(active, "utf8");
    } catch {
      continue;
    }
    const hash = sha1(content);
    const changed = known[rel] !== hash;
    files.push({
      rel,
      path: official,
      isTemp: info.temp,
      isNew: info.temp && !info.official,
      hash,
      changed,
      content: changed ? content : null,
    });
  }
  return files;
}

/**
 * Soma arquivos e espaço em disco de uma pasta (recursivo).
 * @param {string} dir - Pasta.
 * @returns {Promise<{files: number, bytes: number}>}
 */
async function sumDir(dir) {
  let files = 0;
  let bytes = 0;
  let entries = [];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return { files, bytes };
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const inner = await sumDir(full);
      files += inner.files;
      bytes += inner.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += (await fs.promises.stat(full).catch(() => ({ size: 0 }))).size;
    }
  }
  return { files, bytes };
}

/**
 * Estatísticas de disco de um livro: arquivos e espaço do conteúdo (sem o changelog e o chat), e o espaço que o
 * changelog (inclui o conteúdo guardado para rollback) e os registros do chat ocupam.
 * @param {string} bookPath - Pasta do livro.
 * @returns {Promise<{files: number, bytes: number, changelogBytes: number, changelogFiles: number, chatlogBytes: number}>}
 */
export async function bookDiskStats(bookPath) {
  const total = await sumDir(bookPath);
  const changelog = await sumDir(path.join(bookPath, ".system", "changelog"));
  const chatlog = await sumDir(path.join(bookPath, ".system", "chatlog"));
  const system = await sumDir(path.join(bookPath, ".system"));
  return {
    // "arquivos do livro" não conta nada dentro de .system (são dados internos do app)
    files: total.files - system.files,
    bytes: total.bytes - changelog.bytes - chatlog.bytes,
    systemFiles: system.files - changelog.files - chatlog.files,
    changelogBytes: changelog.bytes,
    changelogFiles: changelog.files,
    chatlogBytes: chatlog.bytes,
  };
}
