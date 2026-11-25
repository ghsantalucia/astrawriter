/**
 * @file Locais das pastas do app. Em desenvolvimento (`npm start`) tudo fica na raiz do projeto; no app instalado a pasta
 * os livros ficam em `Documentos/Astra Writer/books` (uma pasta estável: o instalador apaga a pasta da versão antiga a cada
 * atualização e na desinstalação) e `templates/` e o ícone vão como recursos do pacote (`resources/`).
 */

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

/**
 * Pasta-base do app: a do executável quando instalado, ou a raiz do projeto em desenvolvimento.
 * @returns {string}
 */
export function appRoot() {
  return app.isPackaged ? path.dirname(process.execPath) : process.cwd();
}

/**
 * Pasta onde ficam os livros do usuário (criada, vazia, se ainda não existir).
 * @returns {string}
 */
export function booksDir() {
  // Gancho dos testes E2E: uma pasta de dados isolada (livros e configurações), para nunca tocar nos dados reais
  if (process.env.ASTRA_DATA_DIR) return path.join(process.env.ASTRA_DATA_DIR, "books");
  return app.isPackaged ? path.join(app.getPath("documents"), "Astra Writer", "books") : path.join(appRoot(), "books");
}

/** Pasta de livros antiga do app instalado (ao lado do executável), de onde os livros são trazidos na migração. */
function legacyBooksDir() {
  return path.join(path.dirname(process.execPath), "books");
}

/**
 * Quantidade de arquivos de uma pasta (recursivo), para conferir a cópia.
 * @param {string} dir - Pasta.
 * @returns {number}
 */
function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    n += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1;
  }
  return n;
}

/**
 * Traz para a pasta estável os livros que ficavam ao lado do executável (versões anteriores do app instalado). Cada livro
 * é copiado (nunca sobrescreve um livro que já exista no destino) e só conta como migrado depois que a contagem de
 * arquivos confere; a pasta antiga não é apagada por nós.
 * @returns {string[]} Pastas de livros migradas.
 */
export function migrateLegacyBooks() {
  if (!app.isPackaged) return [];
  const from = legacyBooksDir();
  const to = booksDir();
  if (!fs.existsSync(from) || path.resolve(from) === path.resolve(to)) return [];
  const moved = [];
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (fs.existsSync(target)) continue;
    try {
      fs.cpSync(source, target, { recursive: true, errorOnExist: true });
      if (countFiles(source) !== countFiles(target)) {
        fs.rmSync(target, { recursive: true, force: true });
        console.error(`[PATHS] A cópia do livro "${entry.name}" não conferiu; ele continua na pasta antiga.`);
        continue;
      }
      moved.push(entry.name);
    } catch (error) {
      console.error(`[PATHS] Falha ao migrar o livro "${entry.name}":`, error);
    }
  }
  return moved;
}

/**
 * Garante que a pasta de livros exista (a primeira execução do app instalado começa com ela vazia).
 * @returns {void}
 */
export function ensureBooksDir() {
  fs.mkdirSync(booksDir(), { recursive: true });
  migrateLegacyBooks();
}

/**
 * Pasta com o modelo (template) de livro.
 * @returns {string}
 */
export function templatesDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "templates", "book")
    : path.join(process.cwd(), "templates", "book");
}

/**
 * Ícone da janela.
 * @returns {string}
 */
export function iconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.ico")
    : path.join(process.cwd(), "public", "icon.ico");
}
