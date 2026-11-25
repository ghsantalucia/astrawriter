/**
 * @file Armazenamento das skills do usuário. Skills são compartilhadas entre os livros: ficam na pasta de dados do usuário
 * (`skills/<id>.md`), cada uma em um arquivo Markdown com frontmatter (metadados) e o texto das instruções no corpo.
 */

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { t } from "../shared/i18n.js";

/** @returns {string} Pasta das skills do usuário. */
function root() {
  return path.join(app.getPath("userData"), "skills");
}

const SAFE_FILE = /^[a-z0-9][a-z0-9._@-]{0,80}\.md$/i;

/**
 * Lê todas as skills salvas.
 * @returns {Array<{file: string, content: string}>}
 */
export function listSkillFiles() {
  try {
    return fs
      .readdirSync(root())
      .filter((name) => SAFE_FILE.test(name))
      .map((file) => ({ file, content: fs.readFileSync(path.join(root(), file), "utf8") }));
  } catch {
    return [];
  }
}

/**
 * Grava uma skill.
 * @param {string} file - Nome do arquivo (`id.md`).
 * @param {string} content - Conteúdo.
 * @returns {{success: boolean, error?: string}}
 */
export function saveSkillFile(file, content) {
  if (!SAFE_FILE.test(String(file))) return { success: false, error: t("Nome de skill inválido.") };
  fs.mkdirSync(root(), { recursive: true });
  fs.writeFileSync(path.join(root(), file), String(content ?? ""), "utf8");
  return { success: true };
}

/**
 * Apaga uma skill.
 * @param {string} file - Nome do arquivo.
 * @returns {{success: boolean, error?: string}}
 */
export function deleteSkillFile(file) {
  if (!SAFE_FILE.test(String(file))) return { success: false, error: t("Nome de skill inválido.") };
  fs.rmSync(path.join(root(), file), { force: true });
  return { success: true };
}
