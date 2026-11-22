/**
 * @file Primeira abertura do app: instala o livro padrão "Manual de Uso" (modelo em `templates/manual`, gerado por
 * `scripts/build-manual.js`) na pasta de livros do usuário. Acontece uma única vez por usuário (um marcador na pasta de dados do
 * app); se o usuário apagar o manual, ele não volta. Em desenvolvimento não instala, para não mexer nos livros do projeto
 * (use `ASTRA_INSTALL_MANUAL=1` para testar).
 */

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { booksDir, templatesDir } from "./paths.js";

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
 * Instala o Manual de Uso se ainda não foi instalado neste computador.
 * @returns {string|null} Pasta do livro criado, ou null se nada foi feito.
 */
export function installManualBook() {
  if (!app.isPackaged && !process.env.ASTRA_INSTALL_MANUAL) return null;
  const flag = path.join(app.getPath("userData"), "first-run.json");
  if (fs.existsSync(flag)) return null;

  // `templatesDir()` aponta para templates/book; o manual fica ao lado
  const source = path.join(path.dirname(templatesDir()), "manual");
  if (!fs.existsSync(source)) return null;

  try {
    const root = booksDir();
    fs.mkdirSync(root, { recursive: true });
    const target = path.join(root, nextBookFolder(root));
    fs.cpSync(source, target, { recursive: true });
    // O arquivo que abre na primeira vez ("Comece por aqui") vai com o caminho completo deste computador
    try {
      const configFile = path.join(target, "config.json");
      const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
      const open = config.explorer_state?.open_file;
      if (open && !path.isAbsolute(open)) {
        config.explorer_state.open_file = path.join(target, ...open.split("/")).replace(/\\/g, "/");
        fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`, "utf8");
      }
    } catch {
      // sem o arquivo inicial: o app abre o livro sem arquivo aberto
    }
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(flag, JSON.stringify({ manualInstalled: new Date().toISOString(), folder: path.basename(target), opened: false }), "utf8");
    return target;
  } catch (error) {
    console.error("[first-run] Não foi possível instalar o Manual de Uso:", error);
    return null;
  }
}

/**
 * Devolve (uma única vez) o caminho do Manual de Uso recém-instalado, para o app abri-lo na primeira abertura.
 * @returns {string|null}
 */
export function takeFirstRunBook() {
  const flag = path.join(app.getPath("userData"), "first-run.json");
  try {
    const info = JSON.parse(fs.readFileSync(flag, "utf8"));
    if (info.opened || !info.folder) return null;
    const full = path.join(booksDir(), info.folder);
    if (!fs.existsSync(full)) return null;
    fs.writeFileSync(flag, JSON.stringify({ ...info, opened: true }), "utf8");
    return full;
  } catch {
    return null;
  }
}
