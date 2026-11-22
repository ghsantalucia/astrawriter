// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Componente responsável pela renderização estrutural e lógica do explorer de arquivos.
 */

import "./styles.css";
import templateHtml from "./templates/main.hbs?raw";
import folderNodeTpl from "./templates/folderNode.hbs?raw";
import fileNodeTpl from "./templates/fileNode.hbs?raw";
import chapterNodeTpl from "./templates/chapterNode.hbs?raw";
import { ExplorerKeyboard } from "./keyboardNav.js";
import { tagColorIndex } from "../../../shared/tags.js";
import { Component } from "../Component.js";
import { categoryOf } from "../../services/folderService.js";
import { editableFields } from "../../utils/template.js";
import {
  canDeleteFile,
  isChapterFolder,
} from "../../utils/deletePermission.js";
import {
  normalizeItemMetadata,
  normalizePath,
  highlightMatch,
  TEMPLATE_FILE_KEY,
} from "../../utils/helpers.js";

/** Pastas raiz do livro que correspondem às abas do explorer. */
const TAB_FOLDERS = ["notes", "content", "assets"];

/**
 * Representa o explorer de arquivos.
 * @class
 */
export class ExplorerComponent extends Component {
  declare _activePath: any;
  declare _autoOpenFile: any;
  declare _currentSelectionTimer: any;
  declare _dragFile: any;
  declare _dragFolder: any;
  declare _search: any;
  declare _tempList: any;
  declare _treeReady: any;
  declare aiChanges: any;
  declare element: any;
  declare issueSummary: any;
  declare keyboard: any;
  declare state: any;
  declare uiBus: any;

  /**
   * Cria uma instância da classe.
   * @param {string} selector - Seletor CSS do elemento do DOM onde será injetada.
   * @param {Object} context - Objeto de contexto e infraestrutura (state, uiBus, domainBus).
   * @param {Object|Array|null} [params=null] - Parâmetros opcionais dinâmicos.
   * @param {Component|null} [parent=null] - Componente pai opcional.
   */
  constructor(selector, context, params, parent = null) {
    super(selector, context, templateHtml, params, parent);

    /**
     * Estado do modo pesquisa (null quando inativo).
     * @type {{term: string, matches: Map<string, Object>}|null}
     */
    this._search = null;
    /** Arquivos alterados pela IA no modo autônomo (a bolinha ao lado do nome). */
    this.aiChanges = context.services?.aiChanges;
  }

  /**
   * Executado logo após a renderização inicial do componente.
   * @returns {void}
   */
  onInit() {
    this.keyboard = new ExplorerKeyboard(this.element);
    this.toggleAdvancedExplorerView();
    this.tabSelectionEvents();
  }

  /**
   * Configura os ouvintes de eventos da UI e de domínio.
   * @returns {void}
   */
  setupListeners() {
    this.setupDragAndDrop();

    // Na seleção de livro antes de trocar definitivamente, limpa a árvore e encerra a pesquisa
    this.uiBus.on("book:selected", async () => {
      this._treeReady = false;
      this.element.querySelector("#file-tree").innerHTML = "";
      this.resetSearch();
    });

    // Nenhum livro selecionado: explorer vazio
    this.uiBus.on("book:cleared", () => {
      this._treeReady = false;
      this.element.querySelector("#file-tree").innerHTML = "";
      this.resetSearch();
    });

    // Árvore de arquivos atualizada (ex.: novo capítulo ou ficha): redesenha mantendo a pesquisa ativa
    // Pendências da Central de Revisões por arquivo
    this.uiBus.on("issues:changed", (summary) => this.decorateIssues(summary));
    this.uiBus.on("ai-changed:updated", () => this.decorateAiChanges());

    this.uiBus.on("tree:updated", async () => {
      await this.renderTree();
      this._treeReady = true;
      this.markActiveFile();

      const term = this.getSearchInput()?.value.trim();
      if (term) this.uiBus.emit("search:changed", { value: term });
    });

    // Esc no chat: a gaveta fecha e o teclado volta ao explorer
    this.uiBus.on("explorer:keyboard-restore", () => this.keyboard?.restore());

    // Botão da mini toolbar: abre todas as pastas da aba (ou fecha todas, se já estiverem abertas)
    this.uiBus.on("folders:toggle-all", () => this.toggleAllFolders());

    // Digitação na barra de pesquisa: apenas ajusta o botão de limpar (a busca é feita pelo controller)
    this.uiBus.on("search:changed", (payload) => {
      this.toggleSearchClearButton(Boolean(payload?.value?.trim()));
    });

    // Botão X: limpa o campo (o controller encerra o modo pesquisa)
    this.uiBus.on("search:clear", () => {
      const input = this.getSearchInput();
      if (input) input.value = "";
      this.toggleSearchClearButton(false);
      input?.focus();
    });

    // Resultados da pesquisa: filtra a árvore (ignora respostas de termos já substituídos)
    this.uiBus.on("search:results", async ({ term, results }) => {
      if (this.getSearchInput()?.value.trim() !== term) return;
      await this.applySearch(term, results);
    });

    // A IA (ou outro fluxo) alterou o modo avançado: sincroniza o botão e a árvore
    this.uiBus.on("explorer:advanced-changed", () => {
      this.syncAdvancedModeView();
      if (this._search) this.rerenderSearch();
    });

    // Pesquisa encerrada: volta ao estado padrão do explorer
    this.uiBus.on("search:cleared", async () => {
      await this.exitSearch();
    });

    // Ouve alterações no livro atual para re-renderizar a árvore
    this.uiBus.on("book:changed", async () => {
      await this.renderTree();
      this._treeReady = true;

      this.syncAdvancedModeView();

      // Se tem arquivo automático para abrir na lista de espera
      if (this._autoOpenFile) {
        this.autoOpenFileByPath(this._autoOpenFile);
        this._autoOpenFile = null;
      }
      // Se tem arquivos .temp para renderizar
      if (this._tempList) {
        this.handleTempList(this._tempList);
        this._tempList = null;
      }
    });

    // Ouve quando o arquivo atual muda para sincronizar a seleção visual na árvore
    this.uiBus.on("file:opened", (payload) => {
      this._activePath = normalizePath(payload.fullPath || "");
      if (!this._treeReady) {
        this._autoOpenFile = payload.relativePath;
      } else {
        this._autoOpenFile = null;
        this.autoOpenFileByPath(payload.relativePath);
      }
    });

    // Ouvinte geral de todos os arquivos .temp
    this.uiBus.on("temp-files:pending-list", (arr) => {
      if (!this._treeReady) {
        this._tempList = arr;
      } else {
        this._tempList = null;
        this.handleTempList(arr);
      }
    });

    // Adiciona arquivo .temp à árvore
    this.uiBus.on("temp-file:saved", (path) => {
      this.updateFileTempStatus(path, true);
    });
  }

  handleTempList(arr) {
    if (Array.isArray(arr)) {
      this.clearAllTemp();
      arr.forEach((file) => {
        this.updateFileTempStatus(normalizePath(file.path), true);
      });
    }
  }

  /**
   * Controla e alterna a visibilidade dos elementos avançados no explorador.
   * @returns {void}
   */
  toggleAdvancedExplorerView() {
    const modeToggle = this.element.querySelector("#mode-toggle");
    const container = this.element.querySelector("#file-tree");

    if (modeToggle && container) {
      const updateAdvancedVisibility = () => {
        if (modeToggle.checked) {
          container.classList.add("show-advanced");
        } else {
          container.classList.remove("show-advanced");
        }
        // Na pesquisa, itens avançados só entram nos resultados com o modo avançado ligado
        if (this._search) this.rerenderSearch();
      };

      modeToggle.checked = false;
      updateAdvancedVisibility();
      modeToggle.addEventListener("change", updateAdvancedVisibility);
    }
  }

  /**
   * Gerencia a seleção de abas de navegação do explorador.
   * @returns {void}
   */
  tabSelectionEvents() {
    this.element.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.activateTab(btn.getAttribute("folder"));
      });
    });

    this.activateTab("content");
  }

  /**
   * Ativa uma aba: marca o botão, mostra a pasta raiz correspondente na árvore e atualiza a barra de ações
   * e a mensagem de "sem resultados" da pesquisa.
   * @param {"notes"|"content"|"assets"} folder - Pasta raiz da aba.
   * @returns {void}
   */
  activateTab(folder) {
    if (!TAB_FOLDERS.includes(folder)) return;

    this.element.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("folder") === folder);
    });

    const fileTreeContainer = this.element.querySelector("#file-tree");
    if (fileTreeContainer) {
      TAB_FOLDERS.forEach((name) =>
        fileTreeContainer.classList.remove(`active-tab-${name}`),
      );
      fileTreeContainer.classList.add(`active-tab-${folder}`);
    }

    // Permite ao CSS exibir apenas o botão de criar da aba atual
    this.element.dataset.activeTab = folder;
    this.keyboard?.reset();
    this.refreshSearchUi();
  }

  /**
   * Sincroniza o estado visual do switch e do container de arquivos avançados
   * com base nas configurações (config.json) do livro atual.
   * @returns {void}
   */
  syncAdvancedModeView() {
    if (!this.state || !this.state.bookList || !this.state.currentBookPath)
      return;

    const currentBook = this.state.bookList.find(
      (b) => b.fullPath === this.state.currentBookPath,
    );

    const isAdvanced = currentBook?.explorer_state?.advanced_mode || false;

    const modeToggle = this.element.querySelector("#mode-toggle");
    const fileTreeContainer = this.element.querySelector("#file-tree");

    if (modeToggle) {
      modeToggle.checked = isAdvanced;
    }

    if (fileTreeContainer) {
      if (isAdvanced) {
        fileTreeContainer.classList.add("show-advanced");
      } else {
        fileTreeContainer.classList.remove("show-advanced");
      }
    }
  }

  /**
   * Atualiza o botão que bloqueia/libera a escrita da IA nas anotações conforme o `aiWrite` do folder.yml de notes.
   * @returns {void}
   */
  refreshNotesLock() {
    const btn = this.element.querySelector("#btn-notes-ai-lock");
    if (!btn) return;
    const allowed =
      this.state.currentBookMap?.folders?.notes?.metadata?.aiWrite === true;
    btn.classList.toggle("is-allowed", allowed);
    btn.setAttribute(
      "data-tooltip",
      allowed
        ? "A IA pode alterar as anotações. Clique para bloquear"
        : "A IA não pode alterar as anotações. Clique para liberar",
    );
  }

  /**
   * Renderiza a árvore de arquivos no container principal utilizando o esqueleto do estado atual.
   * @async
   * @returns {Promise<void>}
   */
  async renderTree() {
    const container = this.element.querySelector("#file-tree");

    if (!container || !this.state) return;

    container.innerHTML = "";

    // Utiliza a árvore completa armazenada em memória no state
    const bookTree = this.state.currentBookMap;

    if (!bookTree) return;

    const folderName = this.state.currentBookPath
      ? this.state.currentBookPath.split(/[/\\]/).pop()
      : "book";
    const ul = this.buildTree(bookTree, folderName);
    ul.className = "main-ul";
    container.appendChild(ul);
    this.refreshNotesLock();

    this.markActiveFile();
    this.refreshSearchUi();
    this.decorateIssues();
    this.decorateAiChanges();
  }

  /**
   * Põe a bolinha de "alterado pela IA" (modo autônomo) ao lado do nome dos arquivos que a IA gravou e que o autor ainda não
   * abriu. No capítulo (um único item), a bolinha aparece se qualquer um dos três arquivos foi alterado.
   * @returns {void}
   */
  decorateAiChanges() {
    const changed = this.aiChanges?.list() || [];
    const book = normalizePath(this.state.currentBookPath || "").replace(/\/+$/, "");
    this.element?.querySelectorAll("#file-tree li:not(.folder)[data-absolute-path]").forEach((li) => {
      li.querySelector(".file-title-wrapper > .ai-dot")?.remove();
      if (changed.length === 0 || !book) return;
      const abs = normalizePath(li.dataset.absolutePath || "").replace(/\.temp$/, "");
      if (!abs.startsWith(`${book}/`)) return;
      const rel = abs.slice(book.length + 1);
      // Capítulo: o item é o manuscrito, mas representa a pasta inteira (esboço e análise)
      const dir = li.dataset.chapterDir ? normalizePath(li.dataset.chapterDir).slice(book.length + 1) : null;
      const hit = dir ? changed.some((p) => p.startsWith(`${dir}/`)) : changed.includes(rel);
      if (!hit) return;
      li.querySelector(".file-title-wrapper")?.insertAdjacentHTML(
        "beforeend",
        '<span class="ai-dot" title="Alterado pela IA (some 3 segundos depois de abrir o arquivo)"></span>',
      );
    });
  }

  /**
   * Mostra, em cada arquivo com pendências, as bolinhas de aviso (vermelha: erros; amarela: sugestões e possíveis erros).
   * Elas só aparecem ao passar o mouse, junto dos ícones de editar e excluir, com tooltip da quantidade.
   * @param {{byFile?: Object}} [summary] - Resumo da Central de Revisões (padrão: o último recebido).
   * @returns {void}
   */
  decorateIssues(summary) {
    if (summary) this.issueSummary = summary;
    const byFile = this.issueSummary?.byFile || {};
    const book = normalizePath(this.state.currentBookPath || "").replace(/\/+$/, "");
    this.element?.querySelectorAll("#file-tree li:not(.folder)[data-absolute-path]").forEach((li) => {
      li.querySelector(":scope .file-issues")?.remove();
      const abs = normalizePath(li.dataset.absolutePath || "").replace(/\.temp$/, "");
      const counts = abs.startsWith(`${book}/`) ? byFile[abs.slice(book.length + 1)] : null;
      if (!counts || (!counts.error && !counts.warning)) return;
      const wrapper = li.querySelector(".file-title-wrapper");
      if (!wrapper) return;
      const flags = document.createElement("span");
      flags.className = "file-issues";
      if (counts.error) {
        flags.insertAdjacentHTML(
          "beforeend",
          `<span class="issue-flag error" title="${counts.error} ${counts.error === 1 ? "erro" : "erros"} nesse arquivo"><i class="fa-solid fa-circle-exclamation"></i>${counts.error}</span>`,
        );
      }
      if (counts.warning) {
        flags.insertAdjacentHTML(
          "beforeend",
          `<span class="issue-flag warning" title="${counts.warning} ${counts.warning === 1 ? "sugestão" : "sugestões"} para esse arquivo"><i class="fa-solid fa-triangle-exclamation"></i>${counts.warning}</span>`,
        );
      }
      wrapper.appendChild(flags);
    });
  }

  // ========== Pesquisa ========== //

  /**
   * Retorna o campo de texto da pesquisa.
   * @returns {HTMLInputElement|null}
   */
  getSearchInput() {
    return this.element.querySelector("#explorer-search-input");
  }

  /**
   * Indica se o modo "Arquivos Avançados" está ligado.
   * @returns {boolean}
   */
  isAdvancedModeOn() {
    return Boolean(this.element.querySelector("#mode-toggle")?.checked);
  }

  /**
   * Exibe ou oculta o botão X da barra de pesquisa.
   * @param {boolean} visible - Se o botão deve aparecer.
   * @returns {void}
   */
  toggleSearchClearButton(visible) {
    const button = this.element.querySelector("#explorer-search-clear");
    if (button) button.hidden = !visible;
  }

  /**
   * Entra (ou atualiza) o modo pesquisa: guarda os resultados e redesenha a árvore filtrada.
   * @param {string} term - Termo pesquisado.
   * @param {Array<{path: string, matchType: string, snippet: string}>} results - Resultados da busca.
   * @returns {Promise<void>}
   */
  async applySearch(term, results) {
    this._search = {
      term,
      results,
      // `rank` = posição na lista ordenada pelo processo principal (mais termos > ordem dos termos > alfabética)
      matches: new Map(
        results.map((result, rank) => [
          normalizePath(result.path).toLowerCase(),
          { ...result, rank },
        ]),
      ),
    };
    await this.renderTree();
  }

  /**
   * Abre todas as pastas da aba atual; se todas já estiverem abertas, fecha todas. Cada pasta é alternada pelo próprio
   * clique (assim o estado também é salvo no `config.json` do livro).
   * @returns {void}
   */
  toggleAllFolders() {
    const tab = this.element.dataset.activeTab;
    const folders = [
      ...this.element.querySelectorAll(
        `#file-tree li.folder-root.${tab}-folder li.folder`,
      ),
    ];
    if (folders.length === 0) return;

    const openAll = folders.some((li) => li.classList.contains("collapsed"));
    folders
      .filter((li) => li.classList.contains("collapsed") === openAll)
      .forEach((li) => li.querySelector(":scope > .folder-name")?.click());
  }

  /**
   * Redesenha a pesquisa atual (ex.: quando o modo avançado é alternado).
   * @returns {void}
   */
  rerenderSearch() {
    if (this._search) this.renderTree();
  }

  /**
   * Sai do modo pesquisa e restaura a árvore no estado padrão (pastas abertas conforme o config.json).
   * @returns {Promise<void>}
   */
  async exitSearch() {
    if (!this._search) {
      this.refreshSearchUi();
      return;
    }
    this._search = null;
    await this.renderTree();
  }

  /**
   * Zera a pesquisa sem redesenhar (usado ao trocar de livro, quando a árvore será recriada).
   * @returns {void}
   */
  resetSearch() {
    this._search = null;
    const input = this.getSearchInput();
    if (input) input.value = "";
    this.toggleSearchClearButton(false);
    this.refreshSearchUi();
  }

  /**
   * Atualiza os indicadores da pesquisa: bolinhas com a quantidade de matches em cada aba
   * (removidas fora da pesquisa ou quando a aba não tem matches) e a mensagem de "sem resultados".
   * @returns {void}
   */
  refreshSearchUi() {
    const counts = { notes: 0, content: 0, assets: 0 };

    if (this._search) {
      TAB_FOLDERS.forEach((folder) => {
        counts[folder] = this.element.querySelectorAll(
          `#file-tree li.folder-root.${folder}-folder li:not(.folder) > .file-name`,
        ).length;
      });
    }

    this.element.querySelectorAll(".tab-badge").forEach((badge) => {
      const count = counts[badge.dataset.badge] || 0;
      badge.textContent = count > 99 ? "99+" : count > 0 ? String(count) : "";
      badge.hidden = !this._search || count === 0;
    });

    const activeTab = this.element.dataset.activeTab;
    const empty = this.element.querySelector("#search-empty");
    if (empty) empty.hidden = !(this._search && counts[activeTab] === 0);
  }

  /**
   * Marca como ativo, na árvore, o arquivo aberto no editor (sem abrir pastas nem trocar de aba).
   * @returns {void}
   */
  markActiveFile() {
    if (!this._activePath) return;

    this.element.querySelectorAll(".file-name").forEach((span) => {
      // O item de um capítulo fica ativo com qualquer um dos arquivos dele aberto (manuscrito, esboço ou análise)
      const chapterDir = span.dataset.chapterDir?.toLowerCase();
      const isActive = chapterDir
        ? this._activePath.toLowerCase().startsWith(`${chapterDir}/`)
        : normalizePath(span.dataset.absolutePath || "").toLowerCase() ===
          this._activePath.toLowerCase();
      span.classList.toggle("active", isActive);
    });
  }

  /**
   * Função principal de montagem recursiva da árvore a partir do dicionário em memória.
   * @param {Object} node Nó atual da árvore (contém folders e files).
   * @param {string} currentPath Caminho relativo acumulado.
   * @param {Object|null} [parentMeta=null] Metadados herdados do diretório pai.
   * @returns {HTMLUListElement} Elemento de lista (ul) contendo os nós processados.
   */
  buildTree(node, currentPath, parentMeta = null) {
    const ul = document.createElement("ul");
    if (!node) return ul;

    const folderNodes = [];
    const fileNodes = [];

    // Processa subpastas presentes em node.folders
    if (node.folders) {
      for (const [folderName, subFolderNode] of Object.entries(node.folders)) {
        const relativePath = currentPath
          ? `${currentPath}/${folderName}`
          : folderName;
        const folderLi = this.createFolderNode(
          subFolderNode,
          folderName,
          relativePath,
          parentMeta,
        );
        if (folderLi) folderNodes.push(folderLi);
      }
    }

    // Processa arquivos presentes em node.files
    if (node.files) {
      for (const [fileKey, fileData] of Object.entries(node.files)) {
        // Ignora arquivos JSON de sistema na árvore visual de documentos
        if (fileData.path && fileData.path.toLowerCase().endsWith(".json"))
          continue;

        // O modelo (template.md) da pasta nunca aparece como arquivo
        if (fileKey === TEMPLATE_FILE_KEY) continue;

        const relativePath = currentPath
          ? `${currentPath}/${fileKey}.md`
          : `${fileKey}.md`;
        const fileLi = this.createFileNode(
          fileData,
          fileKey,
          relativePath,
          parentMeta,
        );
        if (fileLi) fileNodes.push(fileLi);
      }
    }

    const compareByTitle = (a, b) => {
      const titleA =
        a.querySelector(".file-title, .folder-title")?.textContent || "";
      const titleB =
        b.querySelector(".file-title, .folder-title")?.textContent || "";
      return titleA.localeCompare(titleB, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    };

    // Na pesquisa: arquivos na ordem de relevância (mais termos > ordem dos termos > alfabética) e as pastas
    // pela melhor posição entre seus arquivos
    const rankOf = (el) =>
      el.dataset.rank !== undefined
        ? Number(el.dataset.rank)
        : Math.min(
            Infinity,
            ...[...el.querySelectorAll("li[data-rank]")].map((f) =>
              Number(f.dataset.rank),
            ),
          );
    const byRank = (a, b) => {
      const ra = rankOf(a);
      const rb = rankOf(b);
      return ra === rb ? compareByTitle(a, b) : ra - rb;
    };

    if (this._search) {
      folderNodes.sort(byRank);
      fileNodes.sort(byRank);
    } else {
      folderNodes.sort(compareByTitle);
      fileNodes.sort(compareByTitle);
    }

    [...folderNodes, ...fileNodes].forEach((nodeEl) => ul.appendChild(nodeEl));

    return ul;
  }

  /**
   * Processa e cria o nó de pasta utilizando os metadados já cacheados no sub-nó.
   * @param {Object} folderNode Objeto contendo os dados da subpasta (metadata, folders, files).
   * @param {string} folderName Nome da pasta atual.
   * @param {string} relativePath Caminho relativo da pasta na árvore.
   * @param {Object|null} [parentMeta=null] Metadados do diretório pai, se houver.
   * @returns {HTMLLIElement|null} O elemento HTML da pasta montada ou null se não for legível.
   */
  createFolderNode(folderNode, folderName, relativePath, parentMeta = null) {
    // Os metadados do folder.yml já vêm processados do backend na propriedade metadata do nó
    const rawMeta = folderNode.metadata || {};
    const meta = normalizeItemMetadata(rawMeta, folderName);

    if (this.state && this.state.currentBookMap) {
      this.state.currentBookMap[relativePath] = meta;
    }

    if (!meta.humanRead) return null;

    if (parentMeta && parentMeta.advanced === true) {
      meta.advanced = true;
    }

    // Na pesquisa, pastas avançadas só aparecem com o modo avançado ligado
    if (this._search && meta.advanced && !this.isAdvancedModeOn()) return null;

    let rootClass = "";
    if (!parentMeta) {
      if (folderName.includes("content")) rootClass = "content-folder";
      else if (folderName.includes("assets")) rootClass = "assets-folder";
      else rootClass = "notes-folder";
    }

    // Verifica se esta pasta está marcada como aberta no config.json do livro atual
    let isOpen = false;
    if (this.state && this.state.bookList && this.state.currentBookPath) {
      const currentBook = this.state.bookList.find(
        (b) => b.fullPath === this.state.currentBookPath,
      );
      if (
        currentBook &&
        currentBook.explorer_state &&
        Array.isArray(currentBook.explorer_state.open_folders)
      ) {
        const normalizedRelPath = relativePath.replace(/\\/g, "/");
        isOpen = currentBook.explorer_state.open_folders.some(
          (p) => p && p.replace(/\\/g, "/") === normalizedRelPath,
        );
      }
    }

    // Na pesquisa todas as pastas ficam abertas (e sem persistir o estado no config.json)
    const searchMode = Boolean(this._search);
    if (searchMode) isOpen = true;

    // Pastas com template.md aceitam novas fichas: exibem o botão "+" (caminho relativo ao livro)
    const bookRel = relativePath.split("/").slice(1).join("/");
    const isUserFolderNode = meta.userRename === true;
    const hasTemplate = Boolean(folderNode.files?.[TEMPLATE_FILE_KEY]);
    const createFolder =
      !searchMode &&
      meta.humanWrite &&
      (hasTemplate ||
        (isUserFolderNode &&
          /^assets\/(characters|places|elements)\//.test(bookRel)))
        ? bookRel
        : "";
    // Pastas do usuário em Anotações: nova anotação direto na pasta
    const createNoteFolder =
      !searchMode &&
      meta.humanWrite &&
      isUserFolderNode &&
      /^notes\//.test(bookRel)
        ? bookRel
        : "";

    // Pastas de capítulo ganham o botão de excluir (apaga a pasta inteira e renumera os seguintes)
    const bookRelative = relativePath.split("/").slice(1).join("/");
    const chapterFolder =
      !searchMode && isChapterFolder(bookRelative)
        ? bookRelative.split("/").pop()
        : "";

    // Capítulo: um único item (ícone de capítulo) que abre o manuscrito; esboço e análise ficam nas guias do editor
    if (!searchMode && isChapterFolder(bookRel) && folderNode.files?.["2_draft"]) {
      return this.createChapterNode(folderNode, meta, relativePath, bookRel);
    }

    const htmlString = this.compile(folderNodeTpl, {
      meta,
      relativePath,
      parentMeta,
      rootClass,
      isOpen,
      searchMode,
      createFolder,
      createNoteFolder,
      chapterFolder,
      // Pastas do usuário: renomear, excluir e criar subpastas (ícone próprio de pasta do usuário)
      isUserFolder: meta.userRename === true,
      canRename: !searchMode && meta.userRename === true,
      canDeleteFolder: !searchMode && meta.userDelete === true,
      canCreateFolder:
        !searchMode &&
        (meta.userRename === true ||
          /^assets\/(characters|places|elements)$/.test(bookRelative)) &&
        categoryOf(bookRelative) !== null,
      bookRelative,
      title: meta.title,
    });
    const li = this.createDOMElement(htmlString);
    li.dataset.dropFolder = bookRelative;

    const span = li.querySelector(".folder-name");

    // Pastas do usuário também podem ser arrastadas para dentro de outras (mesma categoria)
    if (!searchMode && meta.userRename === true) {
      span.draggable = true;
      span.dataset.draggable = "true";
      span.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", bookRelative);
        e.dataTransfer.effectAllowed = "move";
        this._dragFolder = bookRelative;
        li.classList.add("dragging");
      });
      span.addEventListener("dragend", () => {
        this._dragFolder = null;
        li.classList.remove("dragging");
        this.clearDropTargets();
      });
    }

    span.onclick = (e) => {
      // O botão "+" não deve abrir/fechar a pasta
      if (e.target.closest(".folder-add-btn")) return;
      li.classList.toggle("collapsed");

      const folderIcon = span.querySelector(".icon-folder");
      if (folderIcon) {
        if (li.classList.contains("collapsed")) {
          folderIcon.classList.replace("fa-folder-open", "fa-folder");
          li.dataset.status = "collapsed";
        } else {
          folderIcon.classList.replace("fa-folder", "fa-folder-open");
          li.dataset.status = "open";
        }
      }
    };

    // Constrói a sub-lista recursivamente passando o sub-nó correspondente
    const subUl = this.buildTree(folderNode, relativePath, meta);

    // Na pesquisa, pastas sem nenhum arquivo com match são omitidas
    if (searchMode && subUl.children.length === 0) return null;

    li.appendChild(subUl);

    return li;
  }

  /**
   * Cria o item único de um capítulo (a pasta não aparece no explorer): o clique abre o manuscrito.
   * @param {Object} folderNode Dados da pasta do capítulo (arquivos e metadados).
   * @param {Object} meta Metadados normalizados da pasta (título "Capítulo 01").
   * @param {string} relativePath Caminho relativo da pasta na árvore.
   * @param {string} bookRel Caminho da pasta relativo ao livro (`content/chapter_001`).
   * @returns {HTMLLIElement} Elemento do capítulo.
   * @private
   */
  createChapterNode(folderNode, meta, relativePath, bookRel) {
    const draft = folderNode.files["2_draft"];
    const absolutePath = normalizePath(draft.originalPath);
    const chapterDir = absolutePath.split("/").slice(0, -1).join("/");
    const isTemp = Object.values(folderNode.files).some((f) => f.isTemp);
    const html = this.compile(chapterNodeTpl, {
      title: meta.title,
      relativePath: `${normalizePath(relativePath)}/2_draft.md`,
      absolutePath,
      chapterDir,
      isTemp,
      canDelete: true,
      chapterFolder: bookRel.split("/").pop(),
    });
    const li = this.createDOMElement(html);
    const span = li.querySelector(".file-name");
    span.onclick = () => {
      this.element.querySelectorAll(".file-name").forEach((el) => el.classList.remove("active"));
      span.classList.add("active");
    };
    return li;
  }

  /**
   * Remove o realce das pastas-alvo do arrastar e soltar.
   * @returns {void}
   * @private
   */
  clearDropTargets() {
    this.element
      ?.querySelectorAll(".drop-target")
      .forEach((el) => el.classList.remove("drop-target"));
  }

  /**
   * Liga o soltar de arquivos sobre pastas (e sobre o fundo da árvore, que equivale à raiz de Anotações). A regra de
   * quais movimentos valem é do FolderService; aqui só se identifica o alvo.
   * @returns {void}
   * @private
   */
  setupDragAndDrop() {
    const tree = this.element.querySelector("#file-tree");
    if (!tree) return;

    const targetOf = (e) => {
      const folder = e.target.closest("li.folder");
      if (folder) return { el: folder, dest: folder.dataset.dropFolder };
      return this.element.dataset.activeTab === "notes"
        ? { el: tree, dest: "notes" }
        : null;
    };

    // Pasta arrastada: não aceita soltar sobre si mesma nem sobre as suas subpastas
    const invalidForFolder = (dest) =>
      this._dragFolder &&
      (dest === this._dragFolder || dest.startsWith(`${this._dragFolder}/`));

    tree.addEventListener("dragover", (e) => {
      if (!this._dragFile && !this._dragFolder) return;
      const target = targetOf(e);
      if (!target || invalidForFolder(target.dest)) return;
      e.preventDefault();
      this.clearDropTargets();
      target.el.classList.add("drop-target");
    });
    tree.addEventListener("dragleave", (e) => {
      if (!tree.contains(e.relatedTarget)) this.clearDropTargets();
    });
    tree.addEventListener("drop", (e) => {
      if (!this._dragFile && !this._dragFolder) return;
      e.preventDefault();
      const file = this._dragFile;
      const folder = this._dragFolder;
      const target = targetOf(e);
      this.clearDropTargets();
      this._dragFile = null;
      this._dragFolder = null;
      if (!target || (folder && invalidForFolder(target.dest))) return;
      if (folder) this.uiBus.emit("folder:move", { folder, dest: target.dest });
      else this.uiBus.emit("file:move", { file, dest: target.dest });
    });
  }

  /**
   * Cria o nó de arquivo utilizando os metadados do Frontmatter já presentes no dicionário.
   * @param {Object} fileData Objeto contendo os dados do arquivo (path, originalPath, isTemp, metadata).
   * @param {string} fileKey Nome base do arquivo sem extensão.
   * @param {string} relativePath Caminho relativo do arquivo na árvore.
   * @param {Object|null} [parentMeta=null] Metadados do diretório pai, se houver.
   * @returns {HTMLLIElement|null} O elemento HTML do arquivo montado ou null se não permitido.
   */
  createFileNode(fileData, fileKey, relativePath, parentMeta = null) {
    // Os metadados do Frontmatter já foram extraídos e armazenados no objeto pelo get-tree
    const rawMeta = fileData.metadata || {};
    const fileName = `${fileKey}.md`;
    const meta = normalizeItemMetadata(rawMeta, fileName);

    if (this.state && this.state.currentBookMap) {
      this.state.currentBookMap[relativePath] = meta;
    }

    if (!meta.humanRead && !meta.humanWrite) return null;

    const isAdvanced =
      (parentMeta && parentMeta.advanced === true) || meta.advanced === true;
    const isReadonly = meta.humanRead && !meta.humanWrite;
    const isTemp = fileData.isTemp || false;

    let absolutePath = normalizePath(fileData.originalPath);
    relativePath = normalizePath(relativePath);

    // Na pesquisa, só entram arquivos com match (itens avançados apenas com o modo avançado ligado)
    let match = null;
    if (this._search) {
      match = this._search.matches.get(absolutePath.toLowerCase());
      if (!match || (isAdvanced && !this.isAdvancedModeOn())) return null;
    }

    const fileRel = relativePath.split("/").slice(1).join("/");
    const htmlString = this.compile(fileNodeTpl, {
      canEditData:
        !this._search &&
        meta.humanWrite === true &&
        editableFields(meta, { title: fileRel.startsWith("notes/") }).length >
          0,
      absolutePath,
      relativePath,
      meta,
      isAdvanced,
      isReadonly,
      isTemp,
      // Botão de excluir (só aparece ao passar o mouse) para arquivos que o usuário pode excluir
      canDelete:
        !this._search &&
        canDeleteFile(meta, relativePath.split("/").slice(1).join("/"), "user"),
      titleHtml:
        match?.matchType === "title"
          ? highlightMatch(meta.title, this._search.term)
          : "",
      snippet:
        match?.matchType === "content" && match.snippet
          ? highlightMatch(match.snippet, this._search.term)
          : "",
      // Busca por "#tag": as tags encontradas aparecem onde ficaria o trecho do texto
      tagChips:
        match?.matchType === "tag"
          ? (match.tags || []).map((tag) => ({
              tag,
              colorClass: `tag-c${tagColorIndex(tag)}`,
            }))
          : [],
    });
    const li = this.createDOMElement(htmlString);
    if (match) {
      li.dataset.matchType = match.matchType;
      li.dataset.rank = String(match.rank);
    }

    // Arrastar e soltar: só arquivos de Anotações e das categorias do Mundo (nunca índices, modelos ou escrita)
    if (
      !this._search &&
      categoryOf(fileRel) !== null &&
      !/\/(index|template)\.md$/i.test(`/${fileRel}`)
    ) {
      li.draggable = true;
      li.dataset.draggable = "true";
      li.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", absolutePath);
        e.dataTransfer.effectAllowed = "move";
        this._dragFile = absolutePath;
        li.classList.add("dragging");
      });
      li.addEventListener("dragend", () => {
        this._dragFile = null;
        li.classList.remove("dragging");
        this.clearDropTargets();
      });
    }

    const span = li.querySelector(".file-name");
    span.onclick = (e) => {
      this.element
        .querySelectorAll(".file-name")
        .forEach((el) => el.classList.remove("active"));
      span.classList.add("active");

      // if (this.uiBus) {
      //   // Envia o caminho absoluto correto (seja o rascunho .temp ativo ou o original .md)
      //   this.uiBus.emit("editor:open-file", {
      //     path: fileData.path.replace(/\.temp$/, ""),
      //     relativePath,
      //   });
      // }
    };

    return li;
  }

  /**
   * Abre/seleciona o arquivo na árvore com rastreamento completo de depuração (Debug).
   * @param {string} targetPath Caminho relativo do arquivo.
   * @returns {void}
   */
  async autoOpenFileByPath(targetPath) {
    // Cancela qualquer timer pendente de uma seleção anterior para evitar empilhamento
    if (this._currentSelectionTimer) {
      clearTimeout(this._currentSelectionTimer);
      this._currentSelectionTimer = null;
    }

    if (!targetPath) {
      console.warn(
        "[ExplorerDebug] autoOpenFileByPath chamado com targetPath vazio.",
      );
      return;
    }

    let decodedPath = targetPath;
    try {
      decodedPath = decodeURIComponent(targetPath);
    } catch (e) {
      console.error("[ExplorerDebug] Erro ao decodificar targetPath:", e);
    }

    let cleanTargetPath = decodedPath
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .replace(/^content\//, "")
      .replace(/^\.\.\/books\//, "");

    // Normaliza se for .temp para coincidir com o data-path limpo do DOM (.md)
    cleanTargetPath = cleanTargetPath.replace(/\.md\.temp$/, ".md");
    if (cleanTargetPath.endsWith(".temp")) {
      cleanTargetPath = cleanTargetPath.slice(0, -5);
    }

    const pathSegments = cleanTargetPath.split("/");
    const rootFolder =
      pathSegments.length > 1 &&
      ["notes", "content", "assets"].includes(pathSegments[0])
        ? pathSegments[0]
        : pathSegments[1] || pathSegments[0];

    if (rootFolder) {
      const tabBtn = this.element.querySelector(
        `.tab-btn[folder="${rootFolder}"]`,
      );

      if (tabBtn) {
        this.activateTab(rootFolder);
      } else {
        console.warn(
          "[ExplorerDebug] AVISO: Nenhuma tab-btn encontrada com folder=",
          rootFolder,
        );
      }
    }

    // Esboço e análise de um capítulo não têm item próprio: quem fica selecionado é o item do capítulo (o manuscrito)
    const selectable = cleanTargetPath.replace(
      /(chapter_\d+\/)(?:1_outline|3_analysis)\.md$/,
      (_, dir) => `${dir}2_draft.md`,
    );

    const attemptSelection = (retries = 10, delay = 100) => {
      const selector = `.file-name[data-path$="${CSS.escape(selectable)}"]`;
      const fileSpan = this.element.querySelector(selector);

      if (!fileSpan) {
        if (retries > 0) {
          this._currentSelectionTimer = setTimeout(
            () => attemptSelection(retries - 1, delay),
            delay,
          );
        } else {
          console.error(
            "[ExplorerDebug] ERRO: Elemento não encontrado no DOM após todas as tentativas:",
            cleanTargetPath,
          );
        }
        return false;
      }

      const parentLi = fileSpan.closest("li");

      if (parentLi && parentLi.classList.contains("advanced-item")) {
        const modeToggle = this.element.querySelector("#mode-toggle");
        const container = this.element.querySelector("#file-tree");
        if (modeToggle) {
          modeToggle.checked = true;
          modeToggle.dispatchEvent(new Event("change"));
        }
        if (container) container.classList.add("show-advanced");
      }

      let currentElement = fileSpan.parentElement;
      while (currentElement && currentElement !== this.element) {
        if (
          currentElement.tagName === "LI" &&
          currentElement.classList.contains("folder")
        ) {
          currentElement.classList.remove("collapsed");
          const folderIcon = currentElement.querySelector(
            ".folder-name > .icon-folder",
          );
          if (folderIcon) {
            folderIcon.classList.replace("fa-folder", "fa-folder-open");
          }
        }
        currentElement = currentElement.parentElement;
      }

      this.element
        .querySelectorAll(".file-name")
        .forEach((el) => el.classList.remove("active"));
      fileSpan.classList.add("active");

      return true;
    };

    attemptSelection();
  }

  /**
   * Adiciona ou remove a indicação de arquivo temporário (.temp) na UI do Explorer.
   * @param {string} filePath Caminho do arquivo afetado.
   * @param {boolean} isTemp True para marcar como temporário, false para limpar.
   */
  updateFileTempStatus(filePath, isTemp) {
    if (!filePath) return;

    // Normaliza o caminho para garantir compatibilidade com os atributos data-path e data-absolute-path
    const cleanPath = filePath.replace(/\.temp$/, "");

    // Seleciona todos os elementos <li> da árvore que correspondem ao arquivo
    const fileNodes = this.element.querySelectorAll(
      "#file-tree li, #file-tree [data-path]",
    );

    fileNodes.forEach((node) => {
      const nodePath = node.getAttribute("data-path") || "";
      const absPath = node.getAttribute("data-absolute-path") || "";

      const isMatch =
        nodePath === cleanPath ||
        absPath === cleanPath ||
        cleanPath.endsWith(nodePath) ||
        // Item de capítulo: qualquer arquivo do capítulo (manuscrito, esboço ou análise) com rascunho marca o item
        (node.dataset.chapterDir && cleanPath.startsWith(`${node.dataset.chapterDir}/`));

      if (isMatch) {
        const fileNameSpan = node.querySelector(".file-name");
        const titleWrapper = node.querySelector(".file-title-wrapper");

        if (isTemp) {
          // Adiciona a marcação apenas se já não estiver cadastrado/marcado
          if (!node.classList.contains("has-temp")) {
            node.classList.add("has-temp");
            fileNameSpan?.classList.add("has-temp");

            // Insere o elemento físico do asterisco (*) se ele ainda não existir no HTML
            if (
              titleWrapper &&
              !titleWrapper.querySelector(".dirty-asterisk")
            ) {
              const asterisk = document.createElement("span");
              asterisk.className = "dirty-asterisk";
              asterisk.textContent = "*";
              titleWrapper.appendChild(asterisk);
            }
          }
        }
      }
    });
  }

  /**
   * Remove todas as marcações de arquivos temporários (.temp) e os elementos físicos do asterisco (*) da UI do Explorer.
   */
  clearAllTemp() {
    if (!this.element) return;

    // 1. Remove a classe has-temp de todos os nós que a possuem
    const tempNodes = this.element.querySelectorAll("#file-tree .has-temp");
    tempNodes.forEach((node) => {
      node.classList.remove("has-temp");
    });

    // 2. Remove fisicamente todos os elementos span do asterisco (.dirty-asterisk) do DOM
    const asteriskElements = this.element.querySelectorAll(
      "#file-tree .dirty-asterisk",
    );
    asteriskElements.forEach((asterisk) => {
      asterisk.remove();
    });
  }
}
