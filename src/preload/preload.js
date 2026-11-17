/**
 * @file Expõe a API segura via IPC para comunicação entre o processo de renderização e o Node.js.
 */

const { contextBridge, ipcRenderer } = require("electron");

/**
 * API principal exposta no escopo global do renderizador para operações do sistema.
 */
contextBridge.exposeInMainWorld("electronAPI", {
  /** Abre um diálogo nativo para seleção de diretórios. */
  selectFolder: () => ipcRenderer.invoke("select-folder"),

  /** Quantas das palavras o dicionário do idioma não reconhece (contador do rodapé do editor). */
  findMisspelled: (language, words) =>
    ipcRenderer.invoke("spell-check", language, words),

  /** Exporta o arquivo aberto (md, docx ou pdf) após perguntar onde salvar. */
  exportFile: (payload) => ipcRenderer.invoke("export-file", payload),

  /** Versão do app (package.json). */
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),

  /** Sugestões de correção do dicionário para uma palavra. */
  suggestSpelling: (language, word) =>
    ipcRenderer.invoke("spell-suggest", language, word),

  /** Adiciona uma palavra ao dicionário do usuário. */
  addSpellWord: (word) => ipcRenderer.invoke("spell-add-word", word),

  /** Abre um link da web no navegador padrão do sistema. */
  openExternal: (url) => ipcRenderer.invoke("open-external", url),

  /** Lê o conteúdo de um arquivo de forma assíncrona. */
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),

  /** Salva conteúdos em arquivos locais. */
  saveFile: (filePath, content) =>
    ipcRenderer.invoke("save-file", filePath, content),

  /** Remove um arquivo do sistema. */
  deleteFile: (filePath) => ipcRenderer.invoke("delete-file", filePath),

  /** Mapeia a estrutura de pastas e arquivos de um diretório. */
  getTree: (folderPath) => ipcRenderer.invoke("get-tree", folderPath),

  /** Retorna a listagem de livros disponíveis na pasta raiz /books. */
  getBooksList: () => ipcRenderer.invoke("get-books-list"),

  /** Retorna os caminhos-base do projeto (pasta de livros e template de livro). */
  getPaths: () => ipcRenderer.invoke("get-paths"),

  /** Lista o conteúdo de um diretório (nome e tipo). */
  listDir: (dirPath) => ipcRenderer.invoke("list-dir", dirPath),

  /** Clona uma pasta recursivamente (falha se o destino já existir). */
  copyFolder: (sourcePath, destPath) =>
    ipcRenderer.invoke("copy-folder", sourcePath, destPath),

  /** Pesquisa um termo nos títulos e conteúdos dos arquivos de um livro. */
  searchBook: (bookPath, term) =>
    ipcRenderer.invoke("search-book", bookPath, term),

  /** Registra uma ação (create/update/delete/read/restore) no changelog do livro. */
  changelogRecord: (bookPath, change) =>
    ipcRenderer.invoke("changelog-record", bookPath, change),

  /** Histórico de versões de um arquivo (caminho relativo ao livro). */
  changelogFileHistory: (bookPath, relPath) =>
    ipcRenderer.invoke("changelog-file-history", bookPath, relPath),

  /** Uma página (arquivo de log) do changelog, do mais recente ao mais antigo. */
  changelogPage: (bookPath, file) =>
    ipcRenderer.invoke("changelog-page", bookPath, file),

  /** Registra um salvamento automático (um registro por sessão de edição). */
  changelogAutosave: (bookPath, params) =>
    ipcRenderer.invoke("changelog-autosave", bookPath, params),

  /** Conteúdo de uma versão do histórico (e o atual), para comparar antes de restaurar. */
  changelogPreview: (bookPath, filePath, entryId) =>
    ipcRenderer.invoke("changelog-preview", bookPath, filePath, entryId),

  /** Exclui uma pasta inteira. */
  deleteFolder: (folderPath) => ipcRenderer.invoke("delete-folder", folderPath),

  /** Renomeia/move um arquivo ou pasta (falha se o destino existir). */
  renamePath: (fromPath, toPath) =>
    ipcRenderer.invoke("rename-path", fromPath, toPath),

  /** Restaura um arquivo para uma versão do histórico. */
  changelogRestore: (bookPath, filePath, entryId, actor) =>
    ipcRenderer.invoke("changelog-restore", bookPath, filePath, entryId, actor),

  /** Registra um erro retornado pela IA no log de erros. */
  logAiError: (error) => ipcRenderer.invoke("ai-log-error", error),

  /** Lê o log de erros da IA (mais recentes primeiro). */
  readAiErrorLog: () => ipcRenderer.invoke("ai-log-read"),

  /** Apaga o log de erros da IA. */
  clearAiErrorLog: () => ipcRenderer.invoke("ai-log-clear"),

  /** Lê as configurações de IA (provider ativo e chaves de API). */
  getAiSettings: () => ipcRenderer.invoke("get-ai-settings"),

  /** Salva as configurações de IA em arquivo JSON. */
  saveAiSettings: (settings) =>
    ipcRenderer.invoke("save-ai-settings", settings),

  /** Altera o tema visual da barra de título nativa. */
  setNativeTheme: (isDark) => ipcRenderer.send("update-titlebar-theme", isDark),
});

/**
 * API secundária focada em escuta de eventos em tempo real.
 */
contextBridge.exposeInMainWorld("api", {
  /**
   * Registra ouvintes para os eventos do observador de arquivos (Chokidar).
   * @param {Function} callback - Função de retorno chamada ao detectar alterações.
   */
  onFileWatcher: (callback) => {
    ipcRenderer.on("fs:config-changed", (e, data) =>
      callback("config-changed", data),
    );
    ipcRenderer.on("fs:markdown-changed", (e, data) =>
      callback("markdown-changed", data),
    );
    ipcRenderer.on("fs:temp-changed", (e, data) =>
      callback("temp-changed", data),
    );
    ipcRenderer.on("fs:book-folder-changed", (e, data) =>
      callback("book-folder-changed", data),
    );
  },
});

console.log("[1. PRELOAD]");
