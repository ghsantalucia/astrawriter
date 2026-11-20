// @ts-nocheck
/**
 * @file Importação de um livro a partir de um .zip (o zip do "Projeto completo" gerado pela exportação do app). O zip é
 * tratado como dado não confiável: caminhos que saem da pasta do livro são recusados, o tamanho e a quantidade de arquivos
 * têm limite, e nada do zip é executado. Os dados internos do app (`.system`) e os rascunhos (`.temp`) não são importados.
 */

import fs from "node:fs";
import path from "node:path";
import { dialog } from "electron";
import { booksDir } from "./paths.js";
const JSZip = require("jszip");

/** Limites de segurança do zip (descompactado). */
const MAX_FILES = 20000;
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Próximo nome livre de pasta de livro (`book_NNN`).
 * @param {string} dir - Pasta dos livros.
 * @returns {string}
 */
function nextBookFolder(dir) {
  let max = 0;
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const m = name.match(/^book_(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `book_${String(max + 1).padStart(3, "0")}`;
}

/**
 * Caminho relativo seguro (sem `..`, sem raiz, sem letra de unidade) ou null.
 * @param {string} rel - Caminho dentro do zip.
 * @returns {string|null}
 */
function safeRelative(rel) {
  const clean = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean || /^[a-zA-Z]:/.test(clean) || clean.split("/").some((p) => p === ".." || p === "")) return null;
  return clean;
}

/**
 * Escolhe um .zip e importa o livro que há dentro.
 * @param {import('electron').BrowserWindow} parent - Janela principal.
 * @returns {Promise<{success: boolean, canceled?: boolean, folderName?: string, bookPath?: string, title?: string, files?: number, error?: string}>}
 */
export async function importBook(parent) {
  const { canceled, filePaths } = await dialog.showOpenDialog(parent, {
    title: "Importar livro",
    properties: ["openFile"],
    filters: [{ name: "Livro exportado (zip)", extensions: ["zip"] }],
  });
  if (canceled || !filePaths?.[0]) return { success: false, canceled: true };

  let zip;
  try {
    zip = await JSZip.loadAsync(await fs.promises.readFile(filePaths[0]));
  } catch {
    return { success: false, error: "Não foi possível ler o arquivo: ele não parece ser um zip válido." };
  }

  const files = Object.values(zip.files).filter((f) => !f.dir);
  // A pasta do livro é a que contém o config.json (na raiz do zip ou dentro de uma única pasta)
  const configEntry = files
    .filter((f) => /(^|\/)config\.json$/.test(f.name) && f.name.split("/").length <= 2)
    .sort((a, b) => a.name.split("/").length - b.name.split("/").length)[0];
  if (!configEntry) return { success: false, error: "Este zip não contém um livro (config.json não encontrado)." };

  let config;
  try {
    config = JSON.parse(await configEntry.async("string"));
  } catch {
    return { success: false, error: "O config.json do livro está inválido." };
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { success: false, error: "O config.json do livro está inválido." };
  }

  const root = configEntry.name.includes("/") ? configEntry.name.slice(0, configEntry.name.lastIndexOf("/") + 1) : "";
  const entries = files.filter((f) => f.name.startsWith(root));
  if (!entries.some((f) => /^(content|assets|notes)\//.test(f.name.slice(root.length)))) {
    return { success: false, error: "Este zip não tem a estrutura de um livro (content, assets ou notes)." };
  }
  if (entries.length > MAX_FILES) return { success: false, error: "O zip tem arquivos demais para ser um livro." };
  const total = entries.reduce((sum, f) => sum + (f._data?.uncompressedSize || 0), 0);
  if (total > MAX_BYTES) return { success: false, error: "O livro descompactado é grande demais para importar." };

  const dir = booksDir();
  fs.mkdirSync(dir, { recursive: true });
  const folderName = nextBookFolder(dir);
  const bookPath = path.join(dir, folderName);

  try {
    let written = 0;
    for (const entry of entries) {
      const rel = safeRelative(entry.name.slice(root.length));
      if (!rel) throw new Error(`Caminho inválido no zip: "${entry.name}".`);
      if (rel.startsWith(".system/") || rel.endsWith(".temp")) continue;
      const target = path.join(bookPath, ...rel.split("/"));
      // Defesa extra contra "zip slip": o destino tem de continuar dentro da pasta do livro
      if (path.relative(bookPath, target).startsWith("..")) throw new Error(`Caminho inválido no zip: "${entry.name}".`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(target, await entry.async("nodebuffer"));
      written += 1;
    }

    // Título repetido: o livro importado é identificado como tal
    const existing = new Set();
    for (const name of fs.readdirSync(dir)) {
      if (name === folderName) continue;
      try {
        existing.add(String(JSON.parse(fs.readFileSync(path.join(dir, name, "config.json"), "utf8")).book_title || "").trim().toLowerCase());
      } catch {
        // pasta sem config.json válido
      }
    }
    let title = String(config.book_title || "Livro importado").trim() || "Livro importado";
    if (existing.has(title.toLowerCase())) title = `${title} (importado)`;
    config.book_title = title;
    // O arquivo aberto guardado no zip aponta para o computador de origem
    if (config.explorer_state) config.explorer_state = { ...config.explorer_state, open_file: null, open_folders: [] };
    await fs.promises.writeFile(path.join(bookPath, "config.json"), JSON.stringify(config, null, 2), "utf8");

    return { success: true, folderName, bookPath, title, files: written };
  } catch (error) {
    fs.rmSync(bookPath, { recursive: true, force: true });
    return { success: false, error: error.message };
  }
}
