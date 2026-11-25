/**
 * @file Ponte de integração: liga `window.electronAPI` (renderer) aos handlers IPC REAIS do processo principal, com disco real
 * (pasta temporária via ASTRA_DATA_DIR). Só o módulo "electron" é dublê. Assim os serviços e as tools do renderer rodam
 * contra o mesmo código do processo principal que o app usa.
 *
 * Uso no arquivo de teste (o vi.mock precisa ficar no próprio arquivo):
 *   vi.mock("electron", async () => (await import("../helpers/ipcBridge.js")).electronForBridge());
 *   const bridge = await createIpcBridge();   // em beforeAll
 */
import { vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Estado compartilhado entre o dublê do electron e a ponte (um por arquivo de teste: cada arquivo tem o seu módulo). */
const shared = { handlers: {}, userData: "", dialog: null };

/**
 * Dublê do módulo "electron" que guarda os handlers registrados em `ipcMain.handle`.
 * @returns {Object}
 */
export async function electronForBridge() {
  const { createElectronMock } = await import("./electronMock.js");
  shared.dialog = { showOpenDialog: vi.fn(), showSaveDialog: vi.fn(), showMessageBox: vi.fn() };
  return createElectronMock({
    app: {
      isPackaged: false,
      getPath: vi.fn(() => shared.userData),
      getVersion: vi.fn(() => "9.9.9"),
      getName: vi.fn(() => "Astra Writer"),
      quit: vi.fn(),
      on: vi.fn(),
    },
    ipcMain: { on: vi.fn(), handle: vi.fn((channel, fn) => { shared.handlers[channel] = fn; }) },
    dialog: shared.dialog,
  });
}

/** Lê o preload e devolve `{ método: canal }` dos métodos simples (`nome: (..) => ipcRenderer.invoke("canal", ...)`). */
function flatChannels() {
  const src = fs.readFileSync(path.join(process.cwd(), "src", "preload", "preload.ts"), "utf8");
  const out = {};
  for (const m of src.matchAll(/^\s{2}(\w+):\s*\(([^)]*)\)\s*=>\s*ipcRenderer\.invoke\(\s*"([^"]+)"/gm)) out[m[1]] = m[3];
  return out;
}

/**
 * Cria a pasta de dados temporária, registra os handlers e instala `window.electronAPI`.
 * @returns {Promise<{dataDir: string, booksRoot: string, userData: string, dialog: Object, invoke: Function, api: Object, cleanup: Function}>}
 */
export async function createIpcBridge() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-int-"));
  const userData = path.join(dataDir, "userData");
  const booksRoot = path.join(dataDir, "books");
  fs.mkdirSync(booksRoot, { recursive: true });
  process.env.ASTRA_DATA_DIR = dataDir;
  shared.userData = userData;

  const { setupIpcHandlers } = await import("../../src/main/ipc-handlers");
  setupIpcHandlers(null);
  const invoke = (channel, ...args) => shared.handlers[channel]({}, ...args);

  const api = {};
  // Os handlers copiam objetos (como o IPC faz) para o renderer nunca compartilhar referências com o main
  for (const [method, channel] of Object.entries(flatChannels())) {
    api[method] = async (...args) => {
      const result = await invoke(channel, ...args);
      return result === undefined ? result : JSON.parse(JSON.stringify(result));
    };
  }
  // Todos os métodos devolvem Promise, como o ipcRenderer.invoke do app
  api.backupBooks = async (folder, keep) => invoke("backup-books", { folder, keep });
  api.skills = {
    list: async () => invoke("skills-list"),
    save: async (file, content) => invoke("skills-save", file, content),
    delete: async (file) => invoke("skills-delete", file),
  };
  api.templates = {
    profiles: async () => invoke("templates-profiles"),
    read: async (p, k) => invoke("templates-read", p, k),
    original: async (p, k) => invoke("templates-original", p, k),
    save: async (p, k, b) => invoke("templates-save", p, k, b),
    restore: async (p, k) => invoke("templates-restore", p, k),
    createProfile: async (i) => invoke("templates-create-profile", i),
    renameProfile: async (i, n) => invoke("templates-rename-profile", i, n),
    deleteProfile: async (i) => invoke("templates-delete-profile", i),
  };
  api.setNativeTheme = vi.fn();
  api.setZoomFactor = vi.fn();
  api.onUpdateStatus = vi.fn();
  window.electronAPI = api;

  return {
    dataDir,
    booksRoot,
    userData,
    dialog: shared.dialog,
    invoke,
    api,
    cleanup: () => fs.rmSync(dataDir, { recursive: true, force: true }),
  };
}

/** Grava um arquivo criando as pastas. */
export function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

/**
 * Cria um livro pequeno (pronto para a IA) com permissões variadas.
 * @param {string} booksRoot - Pasta dos livros.
 * @param {string} [name] - Nome da pasta.
 * @returns {string} Caminho do livro (com `/`).
 */
export function makeAiBook(booksRoot, name = "book_001") {
  const b = path.join(booksRoot, name);
  writeFile(path.join(b, "config.json"), JSON.stringify({ book_title: "Livro IA", ai_lock: false, explorer_state: { open_file: null, open_folders: [] } }));
  writeFile(path.join(b, "content", "index.md"), "---\ntitle: Índice\naiRead: true\naiWrite: false\n---\n# Índice\n");
  writeFile(path.join(b, "content", "plot.md"), "---\ntitle: Sinopse\naiRead: true\naiWrite: true\n---\nO herói parte em viagem.\n");
  writeFile(path.join(b, "content", "chapter_001", "folder.yml"), "title: Capítulo 01\n");
  writeFile(path.join(b, "content", "chapter_001", "2_draft.md"), "---\ntitle: Manuscrito\naiRead: true\naiWrite: true\n---\nLinha um.\n\nLinha dois com dragão.\n");
  writeFile(path.join(b, "notes", "secreto.md"), "---\ntitle: Segredo\naiRead: false\naiWrite: false\n---\nNão deve ser lido pela IA.\n");
  writeFile(path.join(b, "notes", "somente-leitura.md"), "---\ntitle: Só leitura\naiRead: true\naiWrite: false\n---\nPodem ler, não alterar.\n");
  return b.replace(/\\/g, "/");
}

/**
 * Faz os atrasos simulados do provedor "mock" (600 ms, 300 ms, 1,5 s...) rodarem na hora. Só afeta esperas de 300 ms ou mais.
 * @returns {() => void} Função que desfaz o ajuste.
 */
export function speedUpMockProvider() {
  const targets = [globalThis, typeof window !== "undefined" ? window : null].filter(Boolean);
  const originals = targets.map((t) => t.setTimeout);
  targets.forEach((t, i) => {
    const orig = originals[i];
    t.setTimeout = (fn, ms, ...rest) => orig.call(t, fn, Number(ms) >= 300 && Number(ms) < 10000 ? 0 : ms, ...rest);
  });
  return () => targets.forEach((t, i) => { t.setTimeout = originals[i]; });
}
