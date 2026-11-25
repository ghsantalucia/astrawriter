/**
 * @file Ferramentas do sistema usadas pela Central do Sistema: versão e verificação de atualização (releases do GitHub),
 * atualização automática, tamanho das pastas do app, backup dos livros em uma pasta, exportação de todos os livros e
 * desinstalação.
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { app, autoUpdater, dialog, net } from "electron";
import { booksDir } from "./paths.js";
import { sumDir } from "./book-scan.js";
import { addDirToZip } from "./export.js";
const JSZip = require("jszip");

/** Repositório das versões (público). */
export const REPO = { owner: "ghsantalucia", name: "astrawriter" };
const RELEASES_API = `https://api.github.com/repos/${REPO.owner}/${REPO.name}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${REPO.owner}/${REPO.name}/releases`;

/**
 * Compara versões `1.2.3` (ignora o `v` e sufixos como `-beta`).
 * @param {string} a - Versão A.
 * @param {string} b - Versão B.
 * @returns {number} Positivo se A > B, negativo se A < B, 0 se iguais.
 */
export function compareVersions(a, b) {
  const parts = (v) => String(v || "0").replace(/^v/i, "").split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Consulta a última versão publicada nas releases do repositório.
 * @returns {Promise<{status: "latest"|"available"|"none"|"error", current: string, latest?: string, url?: string, notes?: string, publishedAt?: string, error?: string}>}
 */
export async function checkForUpdate() {
  const current = app.getVersion();
  try {
    const res = await net.fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json", "User-Agent": "astra-writer" } });
    // Sem nenhuma release publicada ainda
    if (res.status === 404) return { status: "none", current, url: RELEASES_PAGE };
    if (!res.ok) return { status: "error", current, error: `O GitHub respondeu ${res.status}.` };
    const release = await res.json();
    const latest = String(release.tag_name || "").replace(/^v/i, "");
    if (!latest) return { status: "none", current, url: RELEASES_PAGE };
    return {
      status: compareVersions(latest, current) > 0 ? "available" : "latest",
      current,
      latest,
      url: release.html_url || RELEASES_PAGE,
      notes: String(release.body || "").slice(0, 4000),
      publishedAt: release.published_at,
    };
  } catch (error) {
    return { status: "error", current, error: "Não foi possível consultar as atualizações (sem conexão?)." };
  }
}

// ========== Atualização automática ========== //
// Dois formatos de instalação convivem: o instalador com assistente (NSIS, atualizado pelo electron-updater a partir do
// latest.yml da release) e o instalador antigo da 1.0.0 (Squirrel, atualizado pelo update.electronjs.org). O app descobre qual
// é o seu pela presença do Update.exe do Squirrel ao lado da pasta do app.

/** @returns {boolean} true se este app foi instalado pelo Squirrel (versão 1.0.0). */
function isSquirrelInstall() {
  return fs.existsSync(path.resolve(path.dirname(process.execPath), "..", "Update.exe"));
}

let updaterWindow = null;
let updaterReady = false;
let updaterState = { state: "idle" };
/** Atualizador em uso (Squirrel por padrão; electron-updater nas instalações NSIS). */
let activeUpdater = autoUpdater;

/**
 * Envia o estado da atualização para a interface.
 * @param {Object} next - Novo estado.
 * @returns {void}
 */
function publishUpdate(next) {
  updaterState = next;
  updaterWindow?.webContents?.send("update-status", next);
}

/**
 * Liga ou desliga a verificação automática de atualizações (só no app instalado, Windows e macOS).
 * @param {import('electron').BrowserWindow} win - Janela principal (recebe os avisos).
 * @param {boolean} enabled - Verificação automática ligada?
 * @returns {{supported: boolean}}
 */
export function configureAutoUpdate(win, enabled) {
  updaterWindow = win;
  const supported = app.isPackaged && (process.platform === "win32" || process.platform === "darwin");
  if (!supported || !enabled) return { supported };
  if (!updaterReady) {
    updaterReady = true;
    try {
      if (process.platform === "win32" && !isSquirrelInstall()) {
        // Instalador com assistente (NSIS): electron-updater lê o latest.yml da última release do GitHub
        const { autoUpdater: nsis } = require("electron-updater");
        activeUpdater = nsis;
        nsis.autoDownload = true;
        nsis.autoInstallOnAppQuit = true;
        nsis.on("checking-for-update", () => publishUpdate({ state: "checking" }));
        nsis.on("update-available", () => publishUpdate({ state: "downloading" }));
        nsis.on("update-not-available", () => publishUpdate({ state: "latest" }));
        nsis.on("update-downloaded", (info) => publishUpdate({ state: "ready", version: info?.version, notes: typeof info?.releaseNotes === "string" ? info.releaseNotes : "" }));
        nsis.on("error", (error) => publishUpdate({ state: "error", error: String(error?.message || error) }));
      } else {
        autoUpdater.setFeedURL({
          url: `https://update.electronjs.org/${REPO.owner}/${REPO.name}/${process.platform}-${process.arch}/${app.getVersion()}`,
        });
        autoUpdater.on("checking-for-update", () => publishUpdate({ state: "checking" }));
        autoUpdater.on("update-available", () => publishUpdate({ state: "downloading" }));
        autoUpdater.on("update-not-available", () => publishUpdate({ state: "latest" }));
        autoUpdater.on("update-downloaded", (event, notes, name) => publishUpdate({ state: "ready", version: name, notes }));
        autoUpdater.on("error", (error) => publishUpdate({ state: "error", error: String(error?.message || error) }));
      }
    } catch (error) {
      publishUpdate({ state: "error", error: String(error?.message || error) });
      return { supported };
    }
  }
  try {
    activeUpdater.checkForUpdates();
  } catch (error) {
    publishUpdate({ state: "error", error: String(error?.message || error) });
  }
  return { supported };
}

/** @returns {Object} Último estado conhecido da atualização automática. */
export function getUpdateState() {
  return updaterState;
}

/**
 * Reinicia o app para instalar a atualização já baixada.
 * @returns {void}
 */
export function installUpdate() {
  if (updaterState.state === "ready") activeUpdater.quitAndInstall();
}

// ========== Tamanho das pastas ========== //

/**
 * Espaço ocupado pelo app: livros, histórico e logs dos livros, dados do app e a instalação.
 * @returns {Promise<{books: number, history: number, userData: number, install: number|null, total: number, packaged: boolean}>}
 */
export async function appDiskUsage() {
  const root = booksDir();
  let books = 0;
  let history = 0;
  for (const entry of fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }) : []) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const system = (await sumDir(path.join(dir, ".system"))).bytes;
    history += system;
    books += Math.max(0, (await sumDir(dir)).bytes - system);
  }
  const userData = (await sumDir(app.getPath("userData"))).bytes;
  // Em desenvolvimento a "instalação" é a pasta do projeto (com node_modules): não faz sentido somar
  const install = app.isPackaged ? (await sumDir(path.dirname(process.execPath))).bytes : null;
  return { books, history, userData, install, total: books + history + userData + (install || 0), packaged: app.isPackaged };
}

// ========== Backup e exportação de todos os livros ========== //

/**
 * Nome seguro de arquivo.
 * @param {string} text - Texto.
 * @returns {string}
 */
function safe(text) {
  return String(text || "livro").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "livro";
}

/**
 * Carimbo de data e hora para nomes de arquivo (`2026-11-19_0930`).
 * @returns {string}
 */
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * Cria um zip de cada livro na pasta de destino (os rascunhos não sincronizados entram, para nada se perder) e mantém só
 * as últimas versões de cada livro.
 * @param {string} dest - Pasta de destino.
 * @param {number} [keep=0] - Quantas cópias manter por livro (0 = não apagar nenhuma).
 * @returns {Promise<{success: boolean, count?: number, files?: string[], error?: string}>}
 */
export async function backupBooks(dest, keep = 0) {
  try {
    if (!dest) return { success: false, error: "Escolha uma pasta de destino." };
    fs.mkdirSync(dest, { recursive: true });
    const root = booksDir();
    const files = [];
    for (const entry of fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }) : []) {
      if (!entry.isDirectory()) continue;
      const bookPath = path.join(root, entry.name);
      let title = entry.name;
      try {
        title = JSON.parse(fs.readFileSync(path.join(bookPath, "config.json"), "utf8")).book_title || entry.name;
      } catch {
        // sem config válido: usa o nome da pasta
      }
      const zip = new JSZip();
      await addDirToZip(zip, bookPath, `${safe(title)}/`, { drafts: true });
      const prefix = `${safe(title)} [${entry.name}] `;
      const file = path.join(dest, `${prefix}${stamp()}.zip`);
      await fs.promises.writeFile(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
      files.push(file);
      if (keep > 0) {
        const old = fs.readdirSync(dest).filter((n) => n.startsWith(prefix) && n.endsWith(".zip")).sort().reverse();
        for (const name of old.slice(keep)) fs.rmSync(path.join(dest, name), { force: true });
      }
    }
    return { success: true, count: files.length, files };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Exporta todos os livros (um zip por livro) para uma pasta escolhida.
 * @param {import('electron').BrowserWindow} parent - Janela principal.
 * @returns {Promise<{success: boolean, canceled?: boolean, count?: number, folder?: string, error?: string}>}
 */
export async function exportAllBooks(parent) {
  const { canceled, filePaths } = await dialog.showOpenDialog(parent, {
    title: "Escolha a pasta para guardar os livros",
    properties: ["openDirectory", "createDirectory"],
  });
  if (canceled || !filePaths?.[0]) return { success: false, canceled: true };
  const result = await backupBooks(filePaths[0], 0);
  return { ...result, folder: filePaths[0] };
}

// ========== Desinstalação ========== //

/**
 * Aciona o desinstalador (Squirrel ou NSIS, Windows) e fecha o app. Os livros ficam em Documentos/Astra Writer e permanecem.
 * @returns {{success: boolean, error?: string}}
 */
export function uninstallApp() {
  if (!app.isPackaged || process.platform !== "win32") {
    return { success: false, error: "A desinstalação só está disponível no app instalado (Windows)." };
  }
  const updateExe = path.resolve(path.dirname(process.execPath), "..", "Update.exe");
  const dir = path.dirname(process.execPath);
  const nsisUninstaller = fs.existsSync(dir) ? fs.readdirSync(dir).find((n) => /^Uninstall .*.exe$/i.test(n)) : null;
  let command = null;
  let args = [];
  if (fs.existsSync(updateExe)) {
    command = updateExe;
    args = ["--uninstall"];
  } else if (nsisUninstaller) {
    command = path.join(dir, nsisUninstaller);
  }
  if (!command) return { success: false, error: "O desinstalador não foi encontrado (o app foi instalado por outro meio?)." };
  try {
    spawn(command, args, { detached: true, stdio: "ignore" }).unref();
    setTimeout(() => app.quit(), 300);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
