// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Gerencia todos os canais de comunicação IPC (Inter-Process Communication) entre o processo de renderização e o processo principal do Electron (sistema de arquivos, diálogos e temas).
 */

import fs from "node:fs";
import path from "node:path";
const matter = require("gray-matter");
import { app, ipcMain, dialog, shell, session } from "electron";
import { searchBook } from "./book-search.js";
import { exportDocument, exportBook } from "./export.js";
import {
  booksDir as getBooksDir,
  templatesDir as getTemplatesDir,
} from "./paths.js";
import { addCustomWord, findMisspelled, suggestWord } from "./spellchecker.js";
import {
  recordChange,
  recordAutosave,
  listFileHistory,
  previewVersion,
  readLogPage,
  restoreVersion,
} from "./changelog.js";
import { appendAiError, readAiErrors, clearAiErrors } from "./ai-error-log.js";
import { migrateBook } from "./book-migrations.js";
import { scanBook, bookDiskStats } from "./book-scan.js";
import { withFileWatcherPaused } from "./file-watcher.js";

/** Arquivo JSON (na pasta de dados do usuário) com o provider de IA ativo e suas chaves. */
const AI_SETTINGS_FILE = "ai-settings.json";

/**
 * Configura todos os ouvintes de eventos IPC do processo principal.
 * @param {import('electron').BrowserWindow} mainWindow - Instância da janela principal da aplicação.
 */
export function setupIpcHandlers(mainWindow) {
  ipcMain.on("update-titlebar-theme", (event, isDark) => {
    if (!mainWindow) return;

    if (isDark) {
      mainWindow.setTitleBarOverlay({
        color: "#0e0f17",
        symbolColor: "#cdd6f4",
      });
    } else {
      mainWindow.setTitleBarOverlay({
        color: "#ece9f6",
        symbolColor: "#2b2542",
      });
    }
  });

  // Abre um link da web (ou e-mail) no navegador padrão do sistema; outros protocolos são recusados
  ipcMain.handle("open-external", async (event, url) => {
    try {
      const parsed = new URL(String(url));
      if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) {
        return { success: false, error: "Protocolo não permitido." };
      }
      await shell.openExternal(parsed.toString());
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Correção ortográfica própria (Hunspell + dicionário do usuário); o corretor do Chromium fica sempre desligado
  ipcMain.handle("spell-check", async (event, language, words) => {
    try {
      return await findMisspelled(language, words);
    } catch (err) {
      console.error("[MAIN IPC spell-check] Erro:", err);
      return [];
    }
  });

  ipcMain.handle("spell-suggest", async (event, language, word) => {
    try {
      return await suggestWord(language, word);
    } catch {
      return [];
    }
  });

  ipcMain.handle("spell-add-word", async (event, word) => {
    try {
      await addCustomWord(word);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Versão do app (a do package.json; o Vite não tem versão própria do projeto)
  ipcMain.handle("get-app-version", () => app.getVersion());

  // Exportar o arquivo aberto (Markdown, Word ou PDF)
  ipcMain.handle("export-file", async (event, payload) => {
    try {
      return await exportDocument(mainWindow, payload);
    } catch (err) {
      console.error("[MAIN IPC export-file] Erro:", err);
      return { success: false, error: err.message };
    }
  });

  // Exportar o livro (zip do projeto, zip dos capítulos ou arquivo único)
  ipcMain.handle("export-book", async (event, payload) => {
    try {
      return await exportBook(mainWindow, payload);
    } catch (err) {
      console.error("[MAIN IPC export-book] Erro:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("select-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("read-file", async (event, filePath) => {
    try {
      if (!filePath) return null;
      const normalizedPath = path.normalize(filePath);

      if (!fs.existsSync(normalizedPath)) return null;

      return await fs.promises.readFile(normalizedPath, "utf-8");
    } catch (err) {
      console.error("[MAIN IPC read-file] Erro:", err);
      return null;
    }
  });

  ipcMain.handle("delete-file", async (event, filePath) => {
    try {
      if (!filePath) {
        return { success: false, error: "Caminho não fornecido." };
      }

      // Normaliza o caminho para o sistema operacional (resolve \ e / no Windows)
      const normalizedPath = path.normalize(filePath);

      if (!fs.existsSync(normalizedPath)) {
        console.warn(
          "[MAIN IPC delete-file] Arquivo NÃO existe:",
          normalizedPath,
        );
        return {
          success: false,
          error: `Arquivo temporário não encontrado: ${normalizedPath}`,
        };
      }

      await fs.promises.unlink(normalizedPath);

      return { success: true };
    } catch (err) {
      console.error("[MAIN IPC delete-file] Erro ao deletar:", err);
      return { success: false, error: err.message };
    }
  });

  // Exclui uma pasta inteira (com tudo o que há dentro).
  ipcMain.handle("delete-folder", async (event, folderPath) => {
    try {
      if (!folderPath)
        return { success: false, error: "Caminho não fornecido." };
      const target = path.normalize(folderPath);
      if (!fs.existsSync(target)) {
        return { success: false, error: `A pasta não existe: ${target}` };
      }
      await withFileWatcherPaused(() =>
        fs.promises.rm(target, { recursive: true, force: true }),
      );
      return { success: true };
    } catch (err) {
      console.error("[MAIN IPC delete-folder] Erro:", err);
      return { success: false, error: err.message };
    }
  });

  // Renomeia/move um arquivo ou pasta. Falha se o destino já existir, para nunca sobrescrever.
  ipcMain.handle("rename-path", async (event, fromPath, toPath) => {
    try {
      if (!fromPath || !toPath) {
        return { success: false, error: "Caminhos não fornecidos." };
      }
      const from = path.normalize(fromPath);
      const to = path.normalize(toPath);
      if (!fs.existsSync(from)) {
        return { success: false, error: `A origem não existe: ${from}` };
      }
      if (fs.existsSync(to)) {
        return { success: false, error: `O destino já existe: ${to}` };
      }
      await withFileWatcherPaused(() => fs.promises.rename(from, to));
      return { success: true };
    } catch (err) {
      console.error("[MAIN IPC rename-path] Erro:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("save-file", async (event, filePath, content) => {
    try {
      // Garante que o diretório pai exista antes de salvar
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }
      await fs.promises.writeFile(filePath, content, "utf-8");
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Retorna os caminhos-base do projeto: pasta dos livros e pasta do template de livro.
  ipcMain.handle("get-paths", async () => ({
    booksDir: getBooksDir(),
    templatesDir: getTemplatesDir(),
  }));

  // Lista o conteúdo de um diretório (nome e se é pasta). Retorna [] se não existir.
  ipcMain.handle("list-dir", async (event, dirPath) => {
    try {
      if (!dirPath || !fs.existsSync(dirPath)) return [];
      const entries = await fs.promises.readdir(path.normalize(dirPath), {
        withFileTypes: true,
      });
      return entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
      }));
    } catch (err) {
      console.error("[MAIN IPC list-dir] Erro:", err);
      return [];
    }
  });

  // Clona uma pasta inteira (recursivamente). Falha se o destino já existir, para nunca sobrescrever.
  ipcMain.handle("copy-folder", async (event, sourcePath, destPath) => {
    try {
      if (!sourcePath || !destPath) {
        return { success: false, error: "Caminhos não fornecidos." };
      }
      const source = path.normalize(sourcePath);
      const dest = path.normalize(destPath);

      if (!fs.existsSync(source)) {
        return {
          success: false,
          error: `Pasta de origem não existe: ${source}`,
        };
      }
      if (fs.existsSync(dest)) {
        return { success: false, error: `O destino já existe: ${dest}` };
      }

      await fs.promises.cp(source, dest, {
        recursive: true,
        errorOnExist: true,
      });
      return { success: true };
    } catch (err) {
      console.error("[MAIN IPC copy-folder] Erro:", err);
      return { success: false, error: err.message };
    }
  });

  // Pesquisa um termo nos títulos e conteúdos dos arquivos Markdown de um livro.
  // Varredura incremental do livro (Central de Revisões): devolve o conteúdo só dos arquivos alterados
  ipcMain.handle("scan-book", async (event, bookPath, known, only) => {
    try {
      return await scanBook(path.normalize(bookPath), known || {}, only || null);
    } catch (err) {
      console.error("[MAIN IPC scan-book] Erro:", err);
      return [];
    }
  });

  // Espaço em disco e total de arquivos do livro (Central do Livro)
  ipcMain.handle("book-disk-stats", async (event, bookPath) => {
    try {
      return await bookDiskStats(path.normalize(bookPath));
    } catch (err) {
      console.error("[MAIN IPC book-disk-stats] Erro:", err);
      return null;
    }
  });

  ipcMain.handle("search-book", async (event, bookPath, term) => {
    try {
      return await searchBook(path.normalize(bookPath || ""), term);
    } catch (err) {
      console.error("[MAIN IPC search-book] Erro:", err);
      return [];
    }
  });

  // ----- Changelog do livro (criações, alterações, exclusões, leituras da IA e restaurações) -----

  // Registra uma ação no changelog do livro.
  ipcMain.handle("changelog-record", async (event, bookPath, change) => {
    try {
      const entry = await recordChange(path.normalize(bookPath), {
        ...change,
        filePath: path.normalize(change.filePath),
      });
      return { success: true, entry };
    } catch (err) {
      console.error("[MAIN IPC changelog-record] Erro:", err);
      return { success: false, error: err.message };
    }
  });

  // Histórico de versões de um arquivo (mais recente primeiro).
  ipcMain.handle("changelog-file-history", async (event, bookPath, relPath) => {
    try {
      return await listFileHistory(path.normalize(bookPath), relPath);
    } catch (err) {
      console.error("[MAIN IPC changelog-file-history] Erro:", err);
      return { entries: [], restoredFrom: null };
    }
  });

  // Uma página (arquivo de log) do changelog, do mais recente para o mais antigo.
  ipcMain.handle("changelog-page", async (event, bookPath, file) => {
    try {
      return await readLogPage(path.normalize(bookPath), file || null);
    } catch (err) {
      console.error("[MAIN IPC changelog-page] Erro:", err);
      return { file: null, entries: [], older: null };
    }
  });

  // Registra um salvamento automático (um único registro por sessão de edição do arquivo).
  ipcMain.handle("changelog-autosave", async (event, bookPath, params) => {
    try {
      const entry = await recordAutosave(path.normalize(bookPath), {
        ...params,
        filePath: path.normalize(params.filePath),
      });
      return { success: true, entry };
    } catch (err) {
      console.error("[MAIN IPC changelog-autosave] Erro:", err);
      return { success: false, error: err.message };
    }
  });

  // Conteúdo de uma versão do histórico (e o atual), sem alterar nada: usado na comparação antes de restaurar.
  ipcMain.handle(
    "changelog-preview",
    async (event, bookPath, filePath, entryId) => {
      try {
        const result = await previewVersion(
          path.normalize(bookPath),
          path.normalize(filePath),
          entryId,
        );
        return { success: true, ...result };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  );

  // Restaura um arquivo para uma versão do histórico (os registros posteriores perdem o conteúdo guardado).
  ipcMain.handle(
    "changelog-restore",
    async (event, bookPath, filePath, entryId, actor) => {
      try {
        const result = await restoreVersion(
          path.normalize(bookPath),
          path.normalize(filePath),
          entryId,
          actor,
        );
        return { success: true, ...result };
      } catch (err) {
        console.error("[MAIN IPC changelog-restore] Erro:", err);
        return { success: false, error: err.message };
      }
    },
  );

  // ----- Log de erros da IA -----

  ipcMain.handle("ai-log-error", async (event, error) => {
    try {
      await appendAiError(app.getPath("userData"), error || {});
      return { success: true };
    } catch (err) {
      console.error("[MAIN IPC ai-log-error] Erro:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("ai-log-read", async () =>
    readAiErrors(app.getPath("userData")),
  );

  ipcMain.handle("ai-log-clear", async () => {
    await clearAiErrors(app.getPath("userData"));
    return { success: true };
  });

  // Lê as configurações de IA (provider ativo + chaves de API). Retorna null se ainda não existirem.
  ipcMain.handle("get-ai-settings", async () => {
    try {
      const filePath = path.join(app.getPath("userData"), AI_SETTINGS_FILE);
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(await fs.promises.readFile(filePath, "utf-8"));
    } catch (err) {
      console.error("[MAIN IPC get-ai-settings] Erro:", err);
      return null;
    }
  });

  // Persiste as configurações de IA no arquivo JSON da pasta de dados do usuário.
  ipcMain.handle("save-ai-settings", async (event, settings) => {
    try {
      const filePath = path.join(app.getPath("userData"), AI_SETTINGS_FILE);
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(
        filePath,
        JSON.stringify(settings, null, 2),
        "utf-8",
      );
      return { success: true };
    } catch (err) {
      console.error("[MAIN IPC save-ai-settings] Erro:", err);
      return { success: false, error: err.message };
    }
  });

  // Listar livros dentro da pasta /books
  ipcMain.handle("get-books-list", async () => {
    const booksDir = getBooksDir();
    try {
      if (!fs.existsSync(booksDir)) return [];

      const entries = await fs.promises.readdir(booksDir, {
        withFileTypes: true,
      });
      const books = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const bookPath = path.join(booksDir, entry.name);
          const configPath = path.join(bookPath, "config.json");

          // Atualiza livros antigos para a estrutura atual (ex.: cap_NNN -> chapter_NNN)
          try {
            await migrateBook(bookPath, { pause: withFileWatcherPaused });
          } catch (migrationError) {
            console.error(
              `Erro ao migrar o livro ${entry.name}:`,
              migrationError,
            );
          }
          let configData = {};

          if (fs.existsSync(configPath)) {
            try {
              const configContent = await fs.promises.readFile(
                configPath,
                "utf-8",
              );
              configData = JSON.parse(configContent);
            } catch (e) {
              console.error(`Erro ao ler config.json em ${entry.name}:`, e);
            }
          }

          books.push({
            folderName: entry.name,
            fullPath: bookPath,
            ...configData, // Espalha todas as propriedades do config.json (title, ai_lock, explorer_state, etc.)
          });
        }
      }
      return books;
    } catch (err) {
      console.error("Erro ao buscar livros:", err);
      return [];
    }
  });

  /**
   * @function get-tree (IPC Handler)
   * @description Mapeia recursivamente a estrutura de diretórios de um livro no disco,
   * retornando um "esqueleto" leve focado em metadados, caminhos e flags de controle.
   *
   * ESTRUTURA DO OBJETO RETORNADO:
   * {
   *   path: string,          // Caminho absoluto do diretório atual
   *   metadata: Object,      // Metadados extraídos do arquivo folder.yml da pasta (se existir)
   *   folders: {             // Dicionário de subpastas O(1) (chave = nome da pasta)
   *     [folderName]: { ... } // Segue a mesma estrutura recursiva (path, metadata, folders, files)
   *   },
   *   files: {               // Dicionário de arquivos O(1) (chave = nome base sem extensão/.temp)
   *     [fileKey]: {
   *       path: string,        // Caminho absoluto do arquivo ativo (aponta para o .temp se houver rascunho)
   *       originalPath: string,// Caminho absoluto do arquivo original (.md base)
   *       isTemp: boolean,     // true se estiver utilizando o rascunho (.md.temp) com prioridade
   *       metadata: Object     // Metadados extraídos do Frontmatter (usando gray-matter)
   *                            // NOTA: O 'content' foi excluído deste mapa para otimizar desempenho e cache.
   *                            // O conteúdo completo deve ser buscado sob demanda quando o arquivo for aberto.
   *     }
   *   }
   * }
   */
  ipcMain.handle("get-tree", async (event, folderPath) => {
    if (!folderPath) return null;

    const targetPath = path.normalize(folderPath);
    if (!fs.existsSync(targetPath)) {
      return null;
    }

    /** Permissões herdadas: o que faltar no arquivo vem da pasta, depois da pasta-mãe, e assim até a raiz do livro. */
    const INHERITED_FLAGS = ["humanRead", "humanWrite", "aiRead", "aiWrite"];

    /**
     * Preenche, em `meta`, as permissões que ele não define com as herdadas.
     * @param {Object} meta - Metadados (frontmatter ou folder.yml).
     * @param {Object} inherited - Permissões efetivas da pasta-mãe.
     * @returns {Object} Os mesmos metadados, completos.
     */
    function withInherited(meta, inherited) {
      for (const flag of INHERITED_FLAGS) {
        if (meta[flag] === undefined && inherited[flag] !== undefined) {
          meta[flag] = inherited[flag];
        }
      }
      return meta;
    }

    async function buildBookTree(dir, inheritedFlags = {}) {
      try {
        const stats = await fs.promises.stat(dir);
        if (!stats.isDirectory()) return null;

        const result = {
          path: dir,
          metadata: {},
          folders: {},
          files: {},
        };

        const entries = await fs.promises.readdir(dir, { withFileTypes: true });

        // 1. Processa o folder.yml da pasta atual (se existir)
        const folderYmlPath = path.join(dir, "folder.yml");
        let folderMeta = {};
        if (fs.existsSync(folderYmlPath)) {
          try {
            const ymlContent = await fs.promises.readFile(
              folderYmlPath,
              "utf8",
            );
            // Usa o engine YAML do gray-matter para ler arquivos YAML puros (folder.yml)
            folderMeta = matter.engines.yaml.parse(ymlContent) || {};
          } catch (ymlErr) {
            console.error(
              `[IPC get-tree] Erro ao ler folder.yml em ${dir}:`,
              ymlErr,
            );
          }
        }
        // Permissões efetivas desta pasta (as dela, ou as herdadas), repassadas aos arquivos e subpastas
        const effectiveFlags = { ...inheritedFlags };
        for (const flag of INHERITED_FLAGS) {
          if (folderMeta[flag] !== undefined)
            effectiveFlags[flag] = folderMeta[flag];
        }
        result.metadata = withInherited(folderMeta, inheritedFlags);

        const markdownFilesMap = new Map();

        // Primeira passada: Varre os arquivos do diretório
        for (const entry of entries) {
          if (!entry.isDirectory()) {
            const fileName = entry.name;
            const lowerName = fileName.toLowerCase();

            if (lowerName === "folder.yml") continue;

            // Tratamento para arquivos Markdown e Rascunhos Temporários (.md.temp)
            if (lowerName.endsWith(".md") || lowerName.endsWith(".md.temp")) {
              let keyName = fileName;

              if (lowerName.endsWith(".md.temp")) {
                keyName = fileName.slice(0, -5); // Remove o ".temp"
              }

              keyName = keyName.replace(/\.md$/, ""); // Remove o ".md" para a chave do dicionário

              const originalPath = path.join(dir, `${keyName}.md`);
              const tempPath = `${originalPath}.temp`;

              let activePath = originalPath;
              let usingTemp = false;

              // Prioriza o arquivo .temp se ele existir fisicamente no disco
              if (fs.existsSync(tempPath)) {
                activePath = tempPath;
                usingTemp = true;
              } else if (
                lowerName.endsWith(".md.temp") &&
                fs.existsSync(path.join(dir, fileName))
              ) {
                activePath = path.join(dir, fileName);
                usingTemp = true;
              }

              if (!markdownFilesMap.has(keyName)) {
                markdownFilesMap.set(keyName, {
                  keyName,
                  activePath,
                  originalPath,
                  isTemp: usingTemp,
                });
              }
            }
            // Tratamento para arquivos JSON (esqueleto leve, sem carregar o conteúdo pesado)
            else if (lowerName.endsWith(".json")) {
              const filePath = path.join(dir, fileName);
              const baseName = path.basename(fileName, ".json");

              result.files[baseName] = {
                path: filePath,
                originalPath: filePath,
                isTemp: false,
                metadata: {},
                // Conteúdo JSON removido do esqueleto para poupar cache e desempenho
              };
            }
          }
        }

        // Processa apenas os metadados (Frontmatter) dos arquivos Markdown
        for (const [keyName, fileInfo] of markdownFilesMap.entries()) {
          try {
            const fileContent = await fs.promises.readFile(
              fileInfo.activePath,
              "utf8",
            );
            const parsedFile = matter(fileContent);

            result.files[keyName] = {
              path: fileInfo.activePath,
              originalPath: fileInfo.originalPath,
              isTemp: fileInfo.isTemp,
              metadata: withInherited(
                { ...(parsedFile.data || {}) },
                effectiveFlags,
              ),
            };
          } catch (fileErr) {
            console.error(
              `[IPC get-tree] Erro ao ler metadados do arquivo ${fileInfo.activePath}:`,
              fileErr,
            );
          }
        }

        // Segunda passada: Processa subdiretórios recursivamente
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subDirName = entry.name;
            const subDirPath = path.join(dir, subDirName);
            const subTree = await buildBookTree(subDirPath, effectiveFlags);

            if (subTree) {
              result.folders[subDirName] = subTree;
            }
          }
        }

        return result;
      } catch (err) {
        console.error(
          `[IPC get-tree] Erro ao processar diretório ${dir}:`,
          err,
        );
        return null;
      }
    }

    return await buildBookTree(targetPath);
  });
}
