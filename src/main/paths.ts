/**
 * @file Locais das pastas do app. Em desenvolvimento (`npm start`) tudo fica na raiz do projeto; no app instalado a pasta
 * `books/` fica ao lado do executável (a pasta de instalação) e `templates/` e o ícone vão como recursos do pacote
 * (`resources/`).
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
  return path.join(appRoot(), "books");
}

/**
 * Garante que a pasta de livros exista (a primeira execução do app instalado começa com ela vazia).
 * @returns {void}
 */
export function ensureBooksDir() {
  fs.mkdirSync(booksDir(), { recursive: true });
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
