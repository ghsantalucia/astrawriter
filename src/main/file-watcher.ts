/**
 * @file Monitora o sistema de arquivos utilizando a biblioteca Chokidar na pasta /books, disparando eventos via IPC para o processo de renderização sempre que houver alterações em arquivos de configuração, markdowns ou pastas de livros.
 */

const chokidar = require("chokidar");
import { booksDir } from "./paths.js";
const path = require("path");

/** Observador ativo (null enquanto pausado). */
let watcher = null;
/** Janela que recebe os eventos. */
let targetWindow = null;

/**
 * Configura e inicia o observador do sistema de arquivos para a pasta de livros.
 * @param {BrowserWindow} mainWindow - Instância da janela principal do Electron para envio de eventos IPC.
 */
export function setupFileWatcher(mainWindow) {
  targetWindow = mainWindow;
  startWatching();
  console.log("[FileWatcher] Monitoramento iniciado em:", booksDir());
}

/**
 * Encerra o observador (usado ao fechar o app e nos testes).
 * @returns {Promise<void>}
 */
export async function stopFileWatcher() {
  const current = watcher;
  watcher = null;
  targetWindow = null;
  if (current) await current.close();
}

/**
 * Cria o observador do Chokidar e liga o encaminhamento dos eventos para o renderer.
 * @returns {void}
 */
function startWatching() {
  const mainWindow = targetWindow;
  // Caminho absoluto para a pasta books na raiz do projeto
  const booksPath = booksDir();

  watcher = chokidar.watch(booksPath, {
    ignored: /(^|[/\\])\../, // ignora arquivos ocultos
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on("all", (event, filePath) => {
    const relativePath = path.relative(booksPath, filePath);
    const filename = path.basename(filePath);

    // 1. Alterações no config.json de qualquer livro
    if (filename === "config.json") {
      console.log("[CHOKIDAR] Alteração de config.json");
      mainWindow.webContents.send("fs:config-changed", {
        event,
        filePath,
        relativePath,
      });
      return;
    }

    // 3. Criações e exclusões de arquivos .md.temp
    if (filename.endsWith(".md.temp")) {
      mainWindow.webContents.send("fs:temp-changed", {
        event,
        filePath,
        relativePath,
      });
      return;
    }

    // 2. Criações, exclusões e alterações de arquivos .md
    if (filename.endsWith(".md")) {
      mainWindow.webContents.send("fs:markdown-changed", {
        event,
        filePath,
        relativePath,
      });
      return;
    }

    // 4. Criações e exclusões de pastas de livros em /books (1 nível abaixo de books)
    const pathSegments = relativePath.split(path.sep);
    if (
      pathSegments.length === 1 &&
      (event === "addDir" || event === "unlinkDir")
    ) {
      mainWindow.webContents.send("fs:book-folder-changed", {
        event,
        filePath,
        relativePath,
      });
    }
  });
}

/**
 * Executa uma operação que renomeia ou apaga PASTAS com o observador pausado. No Windows o Chokidar mantém as pastas
 * observadas abertas, o que impede renomeá-las (EPERM); por isso o observador é fechado durante a operação e
 * recriado depois. Eventos ocorridos nesse intervalo não são enviados (quem pediu a operação atualiza a interface).
 * @template T
 * @param {() => Promise<T>} task - Operação com pastas.
 * @returns {Promise<T>} Resultado da operação.
 */
export async function withFileWatcherPaused(task) {
  const paused = watcher;
  if (paused) {
    watcher = null;
    await paused.close();
  }
  try {
    return await task();
  } finally {
    if (paused && targetWindow) startWatching();
  }
}
