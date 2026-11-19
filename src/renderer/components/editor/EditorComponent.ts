// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Componente responsável pela renderização estrutural do editor markdown e manipulação de eventos via uiBus.
 */

import "./styles.css";
import templateHtml from "./templates/main.hbs?raw";
import { Component } from "../Component.js";
import { EditorKit } from "./EditorKit.js";
import { parseMarkdown, stringifyFrontmatter } from "../../utils/markdown.js";
import {
  normalizeItemMetadata,
  getRelativePath,
  normalizePath,
  escapeHtml,
} from "../../utils/helpers.js";
import { flattenBookTree, splitAliases } from "../../utils/bookFiles.js";
import { editableFields, TAGS_FIELD_ID } from "../../utils/template.js";
import { parseTags } from "../../../shared/tags.js";
import { spellService } from "../../services/spellService.js";
import {
  findWritingProblemRanges,
  isCheckableWord,
} from "./writingProblems.js";
import { WritingMenu } from "./WritingMenu.js";
import { TagInput, tagChipHtml } from "./tagInput.js";
import {
  isInternalHref,
  hrefToRelPath,
  applyAutoLinks,
} from "./editorTools.js";

/** Palavras lidas por minuto, para o tempo estimado de leitura. */
const WORDS_PER_MINUTE = 200;

/**
 * Representa o Editor Markdown da aplicação baseado em eventos.
 * @class
 */
export class EditorComponent extends Component {
  /**
   * Cria uma instância da classe EditorComponent.
   * @constructor
   * @param {string} selector - Seletor CSS do elemento do DOM onde será injetada.
   * @param {Object} context - Objeto de contexto e infraestrutura (state, uiBus, domainBus).
   * @param {Object|Array|null} [params=null] - Parâmetros opcionais dinâmicos.
   * @param {Component} [parent=null] - Componente pai, se houver.
   */
  constructor(selector, context, params, parent = null) {
    super(selector, context, templateHtml, params, parent);
    /** @type {any} */
    this.autoSaveTimer = null;
    /** @type {any} */
    this.statsTimer = null;
    /** Arquivo com alteração ainda não gravada em rascunho. */
    this.pendingSavePath = null;
    /** @type {EditorKit|null} */
    this.kit = null;
    /** Palavras que o dicionário não reconhece no arquivo aberto (já sem nomes do livro nem ignoradas). */
    this.misspelledWords = new Set();
    /** Palavras que o usuário mandou ignorar (até fechar o app) e repetições ignoradas. */
    this.ignoredWords = new Set();
    this.ignoredRepeats = new Set();
    this.writingMenu = new WritingMenu();
    /** Arquivos do livro em cache (invalidado quando a árvore muda). */
    this.filesCache = { tree: null, files: [] };
  }

  /**
   * Executado logo após a renderização inicial do componente.
   * @returns {void}
   */
  onInit() {
    this.initMarkdownEditor();
  }

  /**
   * Configura os ouvintes de eventos da interface exclusivamente via uiBus.
   * @returns {void}
   */
  setupListeners() {
    this.uiBus.on("editor:open-file", (payload) => {
      const path = payload.nativeEvent
        ? payload.data.absolutePath
        : payload.path;
      this.openFile(path, payload.reveal);
    });

    // Botão da Central de Revisões no rodapé (bolinha verde, amarela ou vermelha + contagem)
    this.uiBus.on("issues:changed", (summary) => this.updateReviewPill(summary));
    this.uiBus.on("book:changed", () => this.updateReviewPill(null));

    // Dicionário do livro mudou (Central de Revisões): o contador do rodapé é recalculado
    this.uiBus.on("editor:refresh-stats", () => this.updateStats());

    // Reseta e bloqueia o editor sempre que um novo livro/projeto for selecionado
    this.uiBus.on("editor:reset", () => {
      this.resetEditorState();
    });

    this.uiBus.on("temp-file:saved", (path) => {
      if (normalizePath(this.state.currentFilePath) === normalizePath(path))
        this.uiBus.emit("toolbar:save-status", "saved");
    });

    this.uiBus.on("editor:lock", () => {
      this.setEditorReadOnly(true);
    });
    // Liberar o bloqueio da IA não pode liberar arquivos somente leitura nem o estado "sem arquivo"
    this.uiBus.on("editor:unlock", () => {
      const meta = this.state?.currentFileMetadata;
      const stillLocked =
        !this.state?.currentFilePath || !meta || meta.humanWrite !== true;
      this.setEditorReadOnly(stillLocked || Boolean(this.state?.aiLockState));
    });

    // Link automático: o handler envia os termos (nomes/apelidos) encontrados no livro
    this.uiBus.on("editor:apply-autolinks", ({ terms }) => {
      this.runAutoLinks(terms);
    });

    // Troca o corpo do arquivo aberto sem tratar como digitação do usuário (ex.: H1 renomeado pelas variáveis)
    this.uiBus.on("editor:set-body", ({ body }) => {
      const editor = this.state?.editor;
      if (!editor) return;
      editor.off("change");
      editor.setMarkdown(body);
      editor.on("change", () => this.handleEditorChange());
      this.updateStats();
    });

    // Arquivos criados/excluídos: links podem passar a existir ou a ficar quebrados
    this.uiBus.on("tree:updated", () => {
      this.kit?.refresh();
      this.updateStats();
    });

    // Caixa "Dados do arquivo": abrir (botão de caneta da guia) e atualizar valores após salvar
    this.uiBus.on("file-data:toggle", () => this.toggleDataBox());
    this.uiBus.on("spellcheck:changed", () => this.updateStats());
    this.uiBus.on("file:variables-changed", () => {
      if (this.state.currentFilePath) this.renderDataBox();
    });

    // Fechando o app com uma alteração ainda não salva: grava o rascunho agora
    window.addEventListener("beforeunload", () => this.flushAutoSave());
  }

  // ========== Inicialização do editor ========== //

  /**
   * Cria o editor (pela fábrica compartilhada) no elemento DOM recém-renderizado.
   * @private
   * @returns {void}
   */
  initMarkdownEditor() {
    const editorElement = this.element.querySelector("#markdown-editor");
    if (!editorElement || !this.state) {
      console.error(
        "[EditorComponent] Elemento #markdown-editor não encontrado no template.",
      );
      return;
    }

    this.kit = new EditorKit({
      el: editorElement,
      host: this.element,
      placeholder: "Selecione um arquivo...",
      getFiles: () => this.getBookFiles(),
      getCurrentRel: () => this.getCurrentRel(),
      getProblemRanges: (doc) => this.computeProblemRanges(doc),
      onChange: () => this.handleEditorChange(),
    });
    this.state.editor = this.kit.editor;

    // Ctrl+F abre a busca (somente com um arquivo aberto no editor)
    document.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "f") return;
      if (!this.state?.currentFilePath) return;
      if (document.querySelector("#modal-container:not(.hidden)")) return;
      e.preventDefault();
      this.kit.findPanel.open();
    });

    this.setupInternalLinkHandler();
    this.setupFooterWarnings();
    this.setupWritingMenu();
    this.buildDataBox();
  }

  /**
   * Arquivos Markdown do livro atual (em cache enquanto a árvore for a mesma).
   * @returns {import('../../utils/bookFiles.js').BookFile[]}
   * @private
   */
  getBookFiles() {
    const tree = this.state?.currentBookMap;
    if (!this.state?.currentBookPath || !tree) return [];
    if (tree !== this.filesCache.tree) {
      this.filesCache = {
        tree,
        files: flattenBookTree(tree, this.state.currentBookPath),
      };
    }
    return this.filesCache.files;
  }

  /**
   * Caminho do arquivo aberto relativo à raiz do livro.
   * @returns {string}
   * @private
   */
  getCurrentRel() {
    const rel = getRelativePath(this.state?.currentFilePath || "");
    return rel
      ? rel
          .split("/")
          .slice(1)
          .join("/")
          .replace(/\.temp$/, "")
      : "";
  }

  /**
   * Cria os links automáticos no texto do arquivo aberto (sempre no modo visual).
   * @param {Array<{term: string, href: string}>} terms - Termos e seus destinos.
   * @returns {void}
   * @private
   */
  runAutoLinks(terms) {
    const editor = this.state?.editor;
    if (!editor || !this.state.currentFilePath || this.isReadOnly()) return;
    if (!editor.isWysiwygMode()) this.kit.toggleViewMode();

    const count = applyAutoLinks(editor.wwEditor.view, terms);
    this.uiBus.emit("toast:show", {
      message:
        count > 0
          ? `${count} ${count === 1 ? "link criado" : "links criados"} — revise os destacados em rosa.`
          : "Nenhum termo novo para linkar neste texto.",
      type: count > 0 ? "success" : "info",
    });
  }

  /**
   * Indica se o editor está somente leitura.
   * @returns {boolean}
   * @private
   */
  isReadOnly() {
    return Boolean(this.kit?.locked);
  }

  // ========== Abertura de arquivos e links ========== //

  /**
   * Gerencia a abertura de arquivos no editor. Antes de trocar, grava o rascunho do arquivo atual se houver
   * alteração pendente (o salvamento automático não depende do arquivo continuar aberto).
   * @param {string} path - O caminho do arquivo a ser aberto
   * @private
   * @returns {Promise<void>}
   */
  async openFile(path, reveal = null) {
    if (!path) return;
    await this.flushAutoSave();
    const response = await this.uiBus.req("file:get", { path });
    this.renderFileContent(path, response.content, response.isTemp);
    // Vindo da Central de Revisões: leva o cursor exatamente ao trecho do issue
    if (reveal?.term) {
      setTimeout(() => this.kit?.revealText(reveal.term, reveal.occurrence), 60);
    }
  }

  /**
   * Escuta cliques dentro do editor para navegar por links internos e abrir links da web no navegador padrão.
   * @private
   * @returns {void}
   */
  setupInternalLinkHandler() {
    const container = this.element.querySelector("#markdown-editor");
    if (!container) return;

    container.addEventListener("click", async (e) => {
      const link = e.target.closest("a");
      if (!link) return;

      let href = link.getAttribute("href");
      if (!href) return;

      if (!isInternalHref(href) && !href.startsWith("#")) {
        // Link da web (com ou sem protocolo) ou e-mail: navegador padrão do sistema, nunca dentro do app
        e.preventDefault();
        e.stopPropagation();
        const url = /^[a-z][a-z0-9+.-]*:/i.test(href)
          ? href
          : `https://${href}`;
        window.electronAPI.openExternal(url);
        return;
      }

      try {
        href = decodeURIComponent(href);
      } catch (err) {
        console.error("Erro ao decodificar URL do link:", err);
      }

      const cleanHref = href.split("?")[0].split("#")[0];
      if (!cleanHref.toLowerCase().endsWith(".md")) return;

      e.preventDefault();
      e.stopPropagation();
      if (!this.state?.currentFilePath) return;

      const exists = this.getBookFiles().some(
        (file) => file.relPath.toLowerCase() === hrefToRelPath(cleanHref),
      );
      if (!exists) {
        this.uiBus.emit("toast:show", {
          message: "Este arquivo não existe mais.",
          type: "error",
        });
        return;
      }

      const parts = this.state.currentFilePath.split(/[/\\]/);
      const booksIndex = parts.findIndex((p) => p === "books");
      if (booksIndex === -1 || parts.length < booksIndex + 2) return;

      const bookName = parts[booksIndex + 1];
      const relativeCleanPath = cleanHref.replace(/^[/\\]+/, "");
      const separator = this.state.currentFilePath.includes("\\") ? "\\" : "/";
      const base = parts.slice(0, booksIndex + 2).join(separator);
      this.uiBus.emit("editor:open-file", {
        path: `${base}${separator}${relativeCleanPath.replace(/[/\\]/g, separator)}`,
        relativePath: `${bookName}/${relativeCleanPath}`,
      });
    });
  }

  // ========== Autosave ========== //

  /**
   * Monitora digitação e aguarda 1s sem digitação para disparar autosave.
   * @private
   * @returns {void}
   */
  handleEditorChange() {
    this.scheduleStats();
    if (!this.state || !this.state.currentFilePath || this.isReadOnly()) return;

    this.uiBus.emit("toolbar:save-status", "unsaved");
    this.pendingSavePath = this.state.currentFilePath;

    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => this.flushAutoSave(), 1000);
  }

  /**
   * Grava agora o rascunho do arquivo atual se houver alteração pendente (chamado pelo timer, ao trocar de
   * arquivo, ao limpar o editor e ao fechar o app), cancelando o timer.
   * @returns {Promise<void>}
   */
  async flushAutoSave() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    if (!this.pendingSavePath) return;
    this.pendingSavePath = null;
    await this.triggerAutoSave();
  }

  /**
   * Executa o salvamento automático emitindo evento de persistência via uiBus.
   * @private
   * @async
   * @returns {Promise<void>}
   */
  async triggerAutoSave() {
    if (!this.state || !this.state.currentFilePath || !this.state.editor)
      return;

    this.uiBus.emit("toolbar:save-status", "saving");
    const contentToSave = stringifyFrontmatter(
      this.state.currentFileMetadata,
      this.state.editor.getMarkdown(),
    );

    this.uiBus.emit("file:save-temp", {
      path: this.state.currentFilePath,
      content: contentToSave,
    });
  }

  // ========== Rodapé (estatísticas) ========== //

  /**
   * Agenda a atualização das estatísticas do rodapé sem pesar a digitação.
   * @returns {void}
   * @private
   */
  scheduleStats() {
    if (this.statsTimer) clearTimeout(this.statsTimer);
    this.statsTimer = setTimeout(() => this.updateStats(), 250);
  }

  /**
   * Recalcula e exibe as estatísticas do texto aberto: palavras, leitura, conexões wiki, links inválidos e
   * problemas ortográficos (usando o corretor do próprio Electron/Chromium).
   * @returns {void}
   */
  updateStats() {
    const editor = this.state?.editor;
    const q = (selector) => this.element?.querySelector(selector);
    if (!editor || !q("#stat-words")) return;

    const markdown = editor.getMarkdown();
    const hrefs = [
      ...markdown.matchAll(/\]\((\/?[^)\s]*?\.md)(?:#[^)\s]*)?\)/gi),
    ].map((m) => m[1]);
    const existing = new Set(
      this.getBookFiles().map((f) => f.relPath.toLowerCase()),
    );
    const invalid = hrefs.filter((h) => !existing.has(hrefToRelPath(h))).length;

    const plain = markdown
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[#>*_`~|-]+/g, " ");
    const wordList = plain.match(/[\p{L}\p{N}'’]+/gu) || [];
    const count = wordList.length;
    const minutes =
      count === 0 ? 0 : Math.max(1, Math.round(count / WORDS_PER_MINUTE));

    // Ortografia: palavras únicas com 3+ letras que o dicionário não reconhece
    // Nomes e apelidos das fichas do livro fazem parte do dicionário do projeto e nunca são enviados
    const projectWords = this.getProjectWords();
    const unique = [
      ...new Set(
        wordList.filter(
          (w) =>
            isCheckableWord(w) &&
            !projectWords.has(w.toLowerCase()) &&
            !this.ignoredWords.has(w),
        ),
      ),
    ];
    const spellOn = localStorage.getItem("app_spellcheck_enabled") !== "false";

    q("#stat-words").textContent =
      `${count} ${count === 1 ? "palavra" : "palavras"}`;
    q("#stat-read").textContent = `~${minutes} min de leitura`;
    q("#stat-links").textContent =
      `${hrefs.length} ${hrefs.length === 1 ? "conexão wiki" : "conexões wiki"}`;
    q("#stat-invalid").textContent =
      `${invalid} ${invalid === 1 ? "link interno inválido" : "links internos inválidos"}`;
    // Sem problemas, o aviso some do rodapé
    q("#stat-invalid-item").classList.toggle("hidden", invalid === 0);

    // A ortografia usa o dicionário (no processo principal): o resultado chega depois
    const token = (this.spellToken = (this.spellToken || 0) + 1);
    const showSpell = (words) => {
      if (token !== this.spellToken || !this.element) return;
      this.misspelledWords = new Set(
        words.filter(
          (w) =>
            !projectWords.has(w.toLowerCase()) && !this.ignoredWords.has(w),
        ),
      );
      this.kit?.refresh();
      const total = spellOn ? this.getWritingProblems().length : 0;
      q("#stat-spell").textContent =
        `${total} ${total === 1 ? "problema de escrita" : "problemas de escrita"}`;
      q("#stat-spell-item").classList.toggle("hidden", total === 0);
    };
    this.misspelledWords = new Set();
    showSpell([]);
    if (spellOn) {
      spellService
        .findMisspelled(unique)
        .then(showSpell)
        .catch(() => showSpell([]));
    }
  }

  /**
   * Atualiza o botão da Central de Revisões no rodapé: verde (tudo certo), amarelo (só sugestões e possíveis erros) ou
   * vermelho (há erros confirmados), com a quantidade de pendências.
   * @param {{total: number, errors: number, color: string}|null} summary - Resumo da central (null: sem livro).
   * @returns {void}
   */
  updateReviewPill(summary) {
    const pill = this.element?.querySelector("#btn-review");
    if (!pill) return;
    pill.classList.toggle("hidden", !this.state.currentBookPath || Boolean(summary?.disabled));
    if (!summary) return;
    pill.classList.remove("warning", "error");
    if (summary.color !== "none") pill.classList.add(summary.color);
    pill.querySelector(".review-text").textContent =
      summary.total === 0
        ? "Tudo certo"
        : `${summary.total} ${summary.total === 1 ? "pendência" : "pendências"}`;
    pill.title =
      summary.total === 0
        ? "Nenhuma pendência. Abrir a Central de Revisões"
        : `${summary.errors} erro(s) confirmado(s) e ${summary.total - summary.errors} possível(is) erro(s) ou sugestão(ões). Abrir a Central de Revisões`;
  }

  /**
   * Palavras do dicionário do projeto: títulos, nomes e apelidos de todas as fichas do livro atual (em minúsculas).
   * Nunca são consideradas erro de escrita.
   * @returns {Set<string>}
   */
  getProjectWords() {
    const words = new Set();
    const add = (text) =>
      String(text || "")
        .match(/[\p{L}\p{N}'’]+/gu)
        ?.forEach((w) => words.add(w.toLowerCase()));
    this.getBookFiles().forEach((file) => {
      add(file.metadata?.title);
      add(file.metadata?.data?.title?.content);
      splitAliases(file.metadata?.data?.aliases?.content).forEach(add);
    });
    return words;
  }

  /**
   * Problemas de escrita de um documento do editor (sublinhados e contador).
   * @param {Object} doc - Documento do ProseMirror.
   * @returns {Array<{from: number, to: number, kind: string, word: string}>}
   */
  computeProblemRanges(doc) {
    if (localStorage.getItem("app_spellcheck_enabled") === "false") return [];
    return findWritingProblemRanges(doc, this.misspelledWords, {
      ignoredRepeats: this.ignoredRepeats,
    });
  }

  /**
   * Problemas de escrita do arquivo aberto (palavras desconhecidas e repetidas), na ordem do texto.
   * @returns {Array<{from: number, to: number, kind: string, word: string}>}
   */
  getWritingProblems() {
    return this.kit?.getWritingProblems() || [];
  }

  /**
   * Menu do botão direito sobre um problema de escrita: sugestões, ignorar e adicionar ao dicionário.
   * @returns {void}
   * @private
   */
  setupWritingMenu() {
    this.element?.addEventListener(
      "contextmenu",
      async (event) => {
        const view = this.kit?.getView();
        if (!view || !view.dom.contains(event.target)) return;
        const hit = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        const range = hit
          ? this.getWritingProblems().find(
              (r) => hit.pos >= r.from && hit.pos <= r.to,
            )
          : null;
        if (!range) return; // fora de um problema: segue o menu padrão (recortar/copiar/colar)

        event.preventDefault();
        event.stopPropagation();
        const x = event.clientX;
        const y = event.clientY;
        const locked = this.isReadOnly();
        const apply = (text, from = range.from, to = range.to) => {
          view.dispatch(view.state.tr.insertText(text, from, to));
          view.focus();
        };

        if (range.kind === "repeated") {
          this.writingMenu.open({
            x,
            y,
            title: `"${range.word}" aparece repetida`,
            items: [
              {
                label: "Remover a repetição",
                icon: "fa-solid fa-eraser",
                onClick: locked
                  ? null
                  : () => apply("", range.removeFrom, range.to),
              },
              {
                label: "Manter assim (ignorar)",
                icon: "fa-regular fa-eye-slash",
                onClick: () => {
                  this.ignoredRepeats.add(range.word.toLowerCase());
                  this.kit.refresh();
                  this.updateStats();
                },
              },
            ],
          });
          return;
        }

        const language = localStorage.getItem("app_spell_language") || "pt-BR";
        const suggestions =
          (await window.electronAPI.suggestSpelling(language, range.word)) ||
          [];
        const forget = () => {
          this.misspelledWords.delete(range.word);
          this.kit.refresh();
          this.updateStats();
        };
        this.writingMenu.open({
          x,
          y,
          title: `"${range.word}" não consta no dicionário`,
          items: [
            ...(suggestions.length
              ? suggestions.map((text) => ({
                  label: text,
                  onClick: locked ? null : () => apply(text),
                }))
              : [{ label: "Sem sugestões", muted: true }]),
            { separator: true },
            {
              label: "Ignorar",
              icon: "fa-regular fa-eye-slash",
              onClick: () => {
                this.ignoredWords.add(range.word);
                forget();
              },
            },
            {
              label: "Adicionar ao dicionário",
              icon: "fa-solid fa-book-medical",
              onClick: async () => {
                await window.electronAPI.addSpellWord(range.word);
                forget();
              },
            },
          ],
        });
      },
      true,
    );
  }

  /**
   * Liga os avisos do rodapé: cada clique leva o cursor ao próximo item daquela lista (volta ao primeiro no fim).
   * @returns {void}
   * @private
   */
  setupFooterWarnings() {
    this.warnCursor = { invalid: -1, spell: -1 };
    this.element
      ?.querySelector("#stat-invalid-btn")
      ?.addEventListener("click", () => {
        const ranges = this.kit?.getBrokenLinks() || [];
        if (!ranges.length) return;
        this.warnCursor.invalid = (this.warnCursor.invalid + 1) % ranges.length;
        this.kit.selectRange(ranges[this.warnCursor.invalid]);
      });
    // Problemas de escrita: cada clique vai ao próximo (ortografia e palavras repetidas, em ordem)
    this.element
      ?.querySelector("#stat-spell-btn")
      ?.addEventListener("click", () => {
        const ranges = this.getWritingProblems();
        if (!ranges.length) return;
        this.warnCursor.spell = (this.warnCursor.spell + 1) % ranges.length;
        this.kit.selectRange(ranges[this.warnCursor.spell]);
      });
  }

  // ========== Caixa "Dados do arquivo" ========== //

  /**
   * Cria (uma vez) a caixa recolhível "Dados do arquivo" entre a barra de ferramentas e o texto do editor.
   * @private
   * @returns {void}
   */
  buildDataBox() {
    const ui = this.element.querySelector(".toastui-editor-defaultUI");
    if (!ui) return;

    const box = document.createElement("section");
    box.className = "file-data-box hidden";
    box.innerHTML = `
      <button type="button" class="file-data-head" aria-expanded="false">
        <i class="fa-solid fa-chevron-right file-data-arrow"></i>
        <span class="file-data-title">Dados do arquivo</span>
        <span class="file-data-count"></span>
        <span class="file-data-tags"></span>
      </button>
      <form class="file-data-body" hidden>
        <div class="file-data-tags-field">
          <span class="file-data-label">Tags</span>
          <div class="file-data-tag-input"></div>
        </div>
        <div class="file-data-fields"></div>
        <div class="file-data-actions">
          <button type="submit" class="file-data-save">Salvar dados</button>
        </div>
      </form>`;
    ui.querySelector(".toastui-editor-toolbar").after(box);
    this.dataBox = box;

    this.tagInput = new TagInput(box.querySelector(".file-data-tag-input"), {
      getKnownTags: () => this.getKnownTags(),
    });

    box.querySelector(".file-data-head").addEventListener("click", (e) => {
      // Clicar numa tag do cabeçalho pesquisa por ela (e não abre/fecha a caixa)
      const chip = e.target.closest?.(".tag-chip[data-tag]");
      if (chip) {
        e.stopPropagation();
        this.searchByTag(chip.dataset.tag);
        return;
      }
      this.toggleDataBox();
    });
    box.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const values = {};
      box.querySelectorAll("[data-field]").forEach((input) => {
        values[input.dataset.field] = input.value;
      });
      values[TAGS_FIELD_ID] = this.tagInput.getTags().join(",");
      this.uiBus.emit("variables:inline-save", { values });
    });
  }

  /**
   * Expande ou recolhe a caixa de dados.
   * @param {boolean} [force] - Estado desejado (padrão: alterna).
   * @returns {void}
   */
  toggleDataBox(force) {
    if (!this.dataBox || this.dataBox.classList.contains("hidden")) return;
    const open = force ?? this.dataBox.querySelector("form").hidden;
    this.dataBox.querySelector("form").hidden = !open;
    this.dataBox.classList.toggle("open", open);
    this.dataBox
      .querySelector(".file-data-head")
      .setAttribute("aria-expanded", String(open));
    if (open) this.focusNameField();
  }

  /**
   * Põe o foco (e seleciona o texto) no campo do nome do arquivo na caixa de dados.
   * @returns {void}
   * @private
   */
  focusNameField() {
    const input =
      this.dataBox.querySelector('[data-field="title"]') ||
      this.dataBox.querySelector('[data-field="__title"]') ||
      this.dataBox.querySelector("[data-field]");
    if (!input || input.disabled) return;
    input.focus();
    input.select?.();
  }

  /**
   * Preenche a caixa com os campos do arquivo aberto (título e variáveis). Arquivos somente leitura mostram os
   * campos desabilitados.
   * @returns {void}
   * @private
   */
  renderDataBox() {
    if (!this.dataBox) return;
    const metadata = this.state.currentFileMetadata || {};
    const fields = editableFields(metadata, {
      title: this.getCurrentRel().startsWith("notes/"),
    });
    const tags = parseTags(metadata.tags);
    // A caixa existe para qualquer arquivo aberto: todos aceitam tags
    this.dataBox.classList.remove("hidden");

    const readonly = this.isReadOnly();
    this.dataBox.querySelector(".file-data-count").textContent =
      fields.length > 0
        ? `${fields.length} ${fields.length === 1 ? "campo" : "campos"}`
        : "";
    // Tags na frente do título (separadas por "|"); clicar nelas abre a caixa como o resto do cabeçalho
    this.dataBox.querySelector(".file-data-tags").innerHTML = tags.length
      ? `<span class="file-data-sep">·</span>${tags.map((tag) => tagChipHtml(tag, true)).join("")}`
      : "";
    this.tagInput.setTags(tags);
    this.tagInput.setDisabled(readonly);
    this.dataBox.querySelector(".file-data-fields").innerHTML = fields
      .map(
        (f) => `
        <label class="file-data-field">
          <span>${escapeHtml(f.label)}${f.required ? " *" : ""}</span>
          <input type="text" data-field="${escapeHtml(f.id)}" value="${escapeHtml(f.value)}"
            placeholder="${escapeHtml(f.placeholder || "")}" ${readonly ? "disabled" : ""} autocomplete="off" />
        </label>`,
      )
      .join("");
    this.dataBox.querySelector(".file-data-save").disabled = readonly;
  }

  /**
   * Coloca `#tag` no campo de pesquisa do explorer e dispara a pesquisa.
   * @param {string} tag - Tag (sem o "#").
   * @returns {void}
   */
  searchByTag(tag) {
    const input = document.getElementById("explorer-search-input");
    if (!input) return;
    input.value = `#${tag}`;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }

  /**
   * Tags já usadas nos arquivos do livro atual (sem repetir), para as sugestões do campo de tags.
   * @returns {string[]}
   * @private
   */
  getKnownTags() {
    const all = new Set();
    this.getBookFiles().forEach((file) =>
      parseTags(file.metadata?.tags).forEach((tag) => all.add(tag)),
    );
    return [...all];
  }

  // ========== Estado do editor ========== //

  /**
   * Define o estado de leitura/escrita do editor de texto (bloqueia de verdade: teclado, colar, arrastar e IME).
   * @param {boolean} isReadOnly - Define se o editor deve bloquear interações.
   * @returns {void}
   */
  setEditorReadOnly(isReadOnly) {
    const ui = document.querySelector(".toastui-editor-defaultUI");
    if (!ui || !this.kit) return;
    if (
      this.kit.locked === isReadOnly &&
      ui.classList.contains("readonly-mode") === isReadOnly
    ) {
      return;
    }

    ui.classList.toggle("readonly-mode", isReadOnly);
    this.kit.setLocked(isReadOnly);
    this.dataBox?.querySelectorAll("input, .file-data-save").forEach((el) => {
      el.disabled = isReadOnly;
    });
    this.uiBus.emit(isReadOnly ? "editor:locked" : "editor:unlocked");
  }

  /**
   * Renderiza o conteúdo do arquivo no editor e atualiza a interface.
   * @param {string} fullPath - Caminho absoluto do arquivo.
   * @param {string} rawText - Conteúdo integral do arquivo obtido do disco.
   * @param {boolean} [isTemp=false] - Se o conteúdo veio de um rascunho (.temp) ainda não sincronizado.
   * @returns {void}
   */
  renderFileContent(fullPath, rawText, isTemp = false) {
    const relativePath = getRelativePath(fullPath);
    if (!rawText) return;

    const { metadata: rawMeta, body } = parseMarkdown(rawText);
    const fileName = relativePath.split(/[/\\]/).pop();
    const metadata = normalizeItemMetadata(rawMeta, fileName);
    this.applyInheritedPermissions(metadata, rawMeta, relativePath);

    if (this.state && this.state.editor) {
      this.state.editor.off("change");
      this.state.editor.setMarkdown(body);
      this.state.editor.moveCursorToStart();
      this.state.editor.on("change", () => this.handleEditorChange());
    }
    // Abrir um arquivo não é alteração: nada pendente para salvar
    this.pendingSavePath = null;
    if (this.warnCursor) {
      this.warnCursor.invalid = -1;
      this.warnCursor.spell = -1;
    }

    this.kit?.findPanel?.refresh();
    this.updateStats();

    const isReadOnly =
      !metadata.humanWrite || Boolean(this.state && this.state.aiLockState);
    this.setEditorReadOnly(isReadOnly);
    this.uiBus.emit("toolbar:save-status", isTemp ? "saved" : "synced");
    this.uiBus.emit("editor-overlay:close", "no-file");

    this.uiBus.emit("file:opened", {
      fullPath,
      relativePath,
      fileName,
      metadata,
      body,
    });
    // Os ouvintes de `file:opened` já atualizaram os metadados do arquivo atual
    this.renderDataBox();
  }

  /**
   * Permissões que o arquivo não define herdam da pasta (valor efetivo calculado na árvore do livro). Elas valem para a
   * interface (somente leitura etc.), mas ficam não enumeráveis: nunca são gravadas no frontmatter do arquivo.
   * @param {Object} metadata - Metadados normalizados do arquivo aberto (alterado no lugar).
   * @param {Object} rawMeta - Frontmatter como está no arquivo.
   * @param {string} relativePath - Caminho do arquivo a partir da pasta books.
   * @returns {void}
   * @private
   */
  applyInheritedPermissions(metadata, rawMeta, relativePath) {
    const rel = String(relativePath || "")
      .split("/")
      .slice(1)
      .join("/")
      .toLowerCase();
    const entry = this.getBookFiles().find(
      (f) => f.relPath.toLowerCase() === rel,
    );
    for (const flag of ["humanRead", "humanWrite", "aiRead", "aiWrite"]) {
      if (rawMeta[flag] !== undefined) continue;
      Object.defineProperty(metadata, flag, {
        value: entry?.metadata?.[flag] ?? metadata[flag],
        enumerable: false,
        writable: true,
        configurable: true,
      });
    }
  }

  /**
   * Reseta a interface do editor para o estado inicial sem arquivo aberto, travando de verdade a edição.
   * @returns {void}
   */
  resetEditorState() {
    this.flushAutoSave();
    this.state.editor.off("change");
    this.state.editor.setMarkdown("");
    this.state.editor.on("change", () => this.handleEditorChange());
    this.pendingSavePath = null;
    this.kit?.findPanel?.close();
    this.updateStats();
    this.dataBox?.classList.add("hidden");

    this.setEditorReadOnly(true);

    this.uiBus.emit("editor-overlay:open", {
      key: "no-file",
      message: "Nenhum arquivo selecionado",
      showSpinner: false,
    });
    this.uiBus.emit("editor:reseted");
    this.uiBus.emit("toolbar:save-status", "hidden");
  }
}
