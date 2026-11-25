/**
 * @file Ponto de entrada do Electron, gerencia a janela principal e manipuladores IPC do sistema de arquivos.
 */

import { app, BrowserWindow, Menu, shell } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";

import { setupFileWatcher } from "./file-watcher.js";
import { setupIpcHandlers } from "./ipc-handlers.js";
import { ensureBooksDir, iconPath } from "./paths.js";
import { installManualBook } from "./first-run.js";
import { initLanguage, registerLanguageIpc } from "./language.js";

// Em desenvolvimento, os dados do app ficam na pasta "Astra Writer Dev". A pasta "Astra Writer" é a do app instalado
// (assim o instalado nunca enxerga as chaves e configurações de desenvolvimento).
if (process.env.ASTRA_DATA_DIR) {
  // Testes E2E: configurações e livros numa pasta isolada
  app.setPath("userData", path.join(process.env.ASTRA_DATA_DIR, "userData"));
} else if (!app.isPackaged) {
  app.setPath("userData", path.join(app.getPath("appData"), "Astra Writer Dev"));
}

// Trata criação e remoção de atalhos no Windows durante instalação/desinstalação
if (started) {
  app.quit();
}

let mainWindow;

/**
 * Cria e configura a janela principal da aplicação, inicializando IPCs, monitoramento de arquivos e carregando a interface.
 */
const createWindow = () => {
  // Primeira execução do app instalado: a pasta de livros começa vazia
  ensureBooksDir();
  // Primeira abertura: o livro "Manual de Uso" já vem instalado
  installManualBook();

  // Testes E2E em segundo plano: a janela nunca é exibida (não rouba o foco de quem está trabalhando)
  const hidden = process.env.ASTRA_HIDDEN === "1";

  // Idioma do app (escolha do usuário, ou o do sistema): definido antes de qualquer texto ser criado
  initLanguage();

  mainWindow = new BrowserWindow({
    width: hidden ? 1440 : 1200,
    height: hidden ? 900 : 800,
    show: !hidden,
    // Ícone: public/ em desenvolvimento, resources/ no app instalado
    icon: iconPath(),
    title: "Astra Writer",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0e0f17" /* Cor de fundo da barra para combinar com a Sidebar */,
      symbolColor: "#ffffff" /* Cor dos ícones (X, -, square) */,
      height: 30,
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Janela oculta (E2E): sem isso o Chromium pausa temporizadores e a interface "congela"
      backgroundThrottling: !hidden,
    },
  });

  // Maximiza e exibe a janela
  if (!hidden) {
    mainWindow.maximize();
    mainWindow.show();
  }

  // Inicializa os manipuladores IPC passando a janela
  setupIpcHandlers(mainWindow);
  registerLanguageIpc(mainWindow);

  // Inicia o chokidar File Watcher
  setupFileWatcher(mainWindow);

  // Carrega a URL do servidor Vite em dev, ou o index.html compilado em produção
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // O sublinhado e as sugestões são do próprio app (Hunspell + dicionário do livro); o corretor do Chromium fica desligado
  mainWindow.webContents.session.setSpellCheckerEnabled(false);

  // Links externos nunca abrem dentro do app: vão para o navegador padrão
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url === mainWindow.webContents.getURL()) return;
    event.preventDefault();
    if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url);
  });

  // Atalhos em modo de desenvolvimento (F12 e F5)
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (!app.isPackaged && input.type === "keyDown") {
      if (input.key === "F12") {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
      if (input.key === "F5") {
        mainWindow.webContents.reload();
        event.preventDefault();
      }
    }
  });

  // Menu de contexto: edição e, em desenvolvimento, inspecionar (a correção ortográfica tem menu próprio no editor)
  mainWindow.webContents.on("context-menu", (e, props) => {
    const items = [];
    const wc = mainWindow.webContents;

    if (props.isEditable) {
      items.push(
        { role: "cut", label: "Recortar" },
        { role: "copy", label: "Copiar" },
        { role: "paste", label: "Colar" },
      );
    } else if (props.selectionText) {
      items.push({ role: "copy", label: "Copiar" });
    }

    if (!app.isPackaged) {
      if (items.length) items.push({ type: "separator" });
      items.push({
        label: "Inspecionar Elemento",
        click: () => wc.inspectElement(props.x, props.y),
      });
    }

    if (items.length) Menu.buildFromTemplate(items).popup(mainWindow);
  });

  // Configuração do menu superior nativo
  const templateMenu: Electron.MenuItemConstructorOptions[] = [
    { role: "fileMenu", label: "Arquivo" },
    { role: "editMenu", label: "Editar" },
    { role: "viewMenu", label: "Exibir" },
    { role: "windowMenu", label: "Janela" },
  ];

  const menu = Menu.buildFromTemplate(templateMenu);
  Menu.setApplicationMenu(menu);
};

// Inicialização da aplicação
app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
