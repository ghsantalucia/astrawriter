/**
 * @file Fábrica do editor Markdown do app. TODA instância de editor (o principal e o da revisão de alterações da IA)
 * nasce por aqui, para ter sempre a mesma barra de ferramentas personalizada: link (arquivo do livro ou externo),
 * procurar/substituir (Ctrl+F), alternância texto formatado/Markdown, menu de contexto dos links internos, destaque de
 * links quebrados e bloqueio de edição (somente leitura).
 */

import { uiBus } from "../../events/uiBus.js";
import { t } from "../../../shared/i18n.js";
import Editor from "@toast-ui/editor";
import "@toast-ui/editor/dist/toastui-editor.css";
import "@toast-ui/editor/dist/theme/toastui-editor-dark.css";

import panelsTpl from "./templates/editorPanels.hbs?raw";
import { searchLinkTargets, existingPathSet } from "../../utils/bookFiles.js";
import {
  createEditorPlugin,
  findBrokenLinkRanges,
  findMatches,
  isInternalHref,
  removeLinkAt,
} from "./editorTools.js";
import { FindReplacePanel } from "./FindReplacePanel.js";
import { LinkPopup } from "./LinkPopup.js";

/**
 * Garante um endereço com protocolo (`google.com` vira `https://google.com`).
 * @param {string} url - Endereço digitado.
 * @returns {string}
 */
export function normalizeExternalUrl(url) {
  const clean = String(url || "").trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith("/")) return clean;
  return `https://${clean}`;
}

/**
 * Editor Markdown completo (Toast UI + ferramentas do app).
 * @class
 */
export class EditorKit {
  declare editor: any;
  declare existingCache: any;
  declare findButton: any;
  declare findPanel: any;
  declare getCurrentRel: any;
  declare getFiles: any;
  declare getProblemRanges: any;
  declare host: any;
  declare linkButton: any;
  declare linkPopup: any;
  declare locked: any;
  declare pm: any;
  declare settingsButton: any;
  declare viewButton: any;

  /**
   * @param {Object} options
   * @param {HTMLElement} options.el - Elemento onde o Toast UI Editor é criado.
   * @param {HTMLElement} options.host - Elemento (position: relative) que recebe os painéis flutuantes.
   * @param {() => import('../../utils/bookFiles.js').BookFile[]} [options.getFiles] - Arquivos do livro (links).
   * @param {() => string} [options.getCurrentRel] - Caminho relativo do arquivo aberto (fora dos resultados de link).
   * @param {"wysiwyg"|"markdown"} [options.initialEditType="wysiwyg"] - Modo inicial.
   * @param {string} [options.initialValue=""] - Texto inicial.
   * @param {string} [options.placeholder] - Texto de placeholder.
   * @param {Array<Function>} [options.plugins=[]] - Plugins extras do Toast UI.
   * @param {() => void} [options.onChange] - Chamado a cada alteração do texto.
   */
  constructor({
    el,
    host,
    getFiles = () => [],
    getCurrentRel = () => "",
    initialEditType = "wysiwyg",
    initialValue = "",
    placeholder = "",
    plugins = [],
    getProblemRanges = () => [],
    onChange = () => {},
  }) {
    this.host = host;
    this.getFiles = getFiles;
    this.getCurrentRel = getCurrentRel;
    this.getProblemRanges = getProblemRanges;
    this.locked = false;
    this.pm = null;
    this.existingCache = { files: null, set: new Set() };

    host.insertAdjacentHTML("beforeend", panelsTpl);
    const panel = (name) => host.querySelector(`[data-panel="${name}"]`);

    this.editor = new Editor({
      el,
      height: "100%",
      initialEditType,
      initialValue,
      previewStyle: "tab",
      hideModeSwitch: true,
      usageStatistics: false,
      placeholder,
      theme: "default",
      toolbarItems: this.buildToolbarItems(),
      plugins: [
        createEditorPlugin({
          getExisting: () => this.getExistingPaths(),
          getFind: () => this.findPanel?.getFind() || { term: "", current: 0 },
          isLocked: () => this.locked,
          getProblemRanges: (doc) => this.getProblemRanges(doc),
          onContext: (pmState) => {
            this.pm = pmState;
          },
        }),
        ...plugins,
      ],
    });
    // Todo editor nasce já no tema atual (o themeManager só atualiza os que existiam na troca de tema)
    el.querySelector(".toastui-editor-defaultUI")?.classList.toggle(
      "toastui-editor-dark",
      document.body.classList.contains("dark-theme"),
    );

    this.editor.on("change", () => {
      this.findPanel?.refresh();
      onChange();
    });

    this.findPanel = new FindReplacePanel(panel("find"), {
      getView: () => this.getView(),
      isReadOnly: () => this.locked,
      getPm: () => this.pm,
    });
    this.linkPopup = new LinkPopup(panel("link"), {
      search: (term) =>
        searchLinkTargets(this.getFiles(), term).filter(
          (item) => item.relPath !== this.getCurrentRel(),
        ),
      getSelectedText: () => {
        const view = this.getView();
        if (!view) return "";
        const { from, to, empty } = view.state.selection;
        return empty ? "" : view.state.doc.textBetween(from, to, " ");
      },
      insert: ({ url, text }) => {
        this.editor.exec("addLink", {
          linkUrl: normalizeExternalUrl(url),
          linkText: text,
        });
      },
      onClose: () => this.getView()?.focus(),
    });

    this.setupLinkMenu(panel("link-menu"), el);
    this.bindGlobalKeys();
  }

  // ========== Barra de ferramentas ========== //

  /**
   * Monta a barra: sem "código inline" e "bloco de código", com link próprio, procurar/substituir e alternador de
   * visualização.
   * @returns {Array<Array<string|Object>>}
   * @private
   */
  buildToolbarItems() {
    const button = (name, icon, tooltip, onClick) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "toastui-editor-toolbar-icons dw-tb-btn";
      el.setAttribute("aria-label", tooltip);
      el.setAttribute("data-tooltip", tooltip);
      el.innerHTML = `<i class="${icon}"></i>`;
      el.addEventListener("click", () => onClick(el));
      return { name, el };
    };

    this.linkButton = button(
      "dwLink",
      "fa-solid fa-link",
      t("Inserir link (arquivo do livro ou externo)"),
      (el) => {
        if (this.locked) return;
        if (this.linkPopup.isOpen()) this.linkPopup.close();
        else this.linkPopup.open(el);
      },
    );
    this.findButton = button(
      "dwFind",
      "fa-solid fa-magnifying-glass",
      t("Procurar e substituir (Ctrl+F)"),
      () => this.findPanel?.toggle(),
    );
    this.viewButton = button("dwView", "fa-solid fa-code", t("Ver Markdown"), () =>
      this.toggleViewMode(),
    );

    // À direita da barra: atalho para as configurações do editor (Central do Sistema → Editor)
    this.settingsButton = button(
      "dwSettings",
      "fa-solid fa-gear",
      t("Configurações do editor (fonte e tamanho)"),
      () => uiBus.emit("central:open", { central: "system", tab: "editor" }),
    );
    this.settingsButton.el.classList.add("dw-tb-right");

    return [
      ["heading", "bold", "italic", "strike"],
      ["hr", "quote"],
      ["ul", "ol", "task", "indent", "outdent"],
      ["table", "image", this.linkButton],
      [this.findButton, this.viewButton],
      [this.settingsButton],
    ];
  }

  /**
   * Atalhos e cliques fora que fecham os painéis.
   * @returns {void}
   * @private
   */
  bindGlobalKeys() {
    document.addEventListener("mousedown", (e) => {
      if (
        this.linkPopup.isOpen() &&
        !this.host.querySelector('[data-panel="link"]').contains(e.target) &&
        !this.linkButton.el.contains(e.target)
      ) {
        this.linkPopup.close();
      }
    });
  }

  // ========== Estado ========== //

  /**
   * View do ProseMirror do modo ativo.
   * @returns {import('prosemirror-view').EditorView|null}
   */
  getView() {
    return this.editor.isWysiwygMode()
      ? this.editor.wwEditor.view
      : this.editor.mdEditor.view;
  }

  /**
   * Links internos quebrados do documento aberto (posições do ProseMirror), na ordem do texto.
   * @returns {Array<{from: number, to: number}>}
   */
  getBrokenLinks() {
    const view = this.getView();
    if (!view) return [];
    return findBrokenLinkRanges(
      view.state.doc,
      this.getExistingPaths(),
      !this.editor.isWysiwygMode(),
    );
  }

  /**
   * Problemas de escrita (palavras desconhecidas e repetidas) do documento aberto, na ordem do texto.
   * @returns {Array<{from: number, to: number, kind: string, word: string, removeFrom?: number}>}
   */
  getWritingProblems() {
    const view = this.getView();
    if (!view) return [];
    return this.getProblemRanges(view.state.doc);
  }

  /**
   * Leva o cursor a um trecho de texto (a n-ésima ocorrência), rolando o documento até ele.
   * @param {string} term - Texto procurado (como aparece no editor).
   * @param {number} [occurrence=0] - Qual ocorrência (base 0); se não existir, usa a primeira.
   * @returns {boolean} Se o trecho foi encontrado.
   */
  revealText(term, occurrence = 0) {
    const view = this.getView();
    if (!view || !term) return false;
    const matches = findMatches(view.state.doc, term);
    if (matches.length === 0) return false;
    this.selectRange(matches[occurrence] || matches[0]);
    return true;
  }

  /**
   * Seleciona um trecho, rola o documento até ele e foca o editor (o cursor fica no trecho).
   * @param {{from: number, to: number}} range - Trecho a destacar.
   * @returns {void}
   */
  selectRange({ from, to }) {
    const view = this.getView();
    if (!view || !this.pm) return;
    const { TextSelection } = this.pm;
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, from, to))
        .scrollIntoView(),
    );
    view.focus();
  }

  /**
   * Alterna entre texto formatado e Markdown cru.
   * @returns {void}
   */
  toggleViewMode() {
    const toMarkdown = this.editor.isWysiwygMode();
    this.editor.changeMode(toMarkdown ? "markdown" : "wysiwyg", true);

    this.viewButton.el.querySelector("i").className = toMarkdown
      ? "fa-solid fa-eye"
      : "fa-solid fa-code";
    this.viewButton.el.classList.toggle("active", toMarkdown);
    this.viewButton.el.setAttribute(
      "title",
      toMarkdown ? t("Ver texto formatado") : t("Ver Markdown"),
    );
    this.findPanel?.refresh();
    this.refresh();
  }

  /**
   * Bloqueia ou libera a edição (somente leitura). O bloqueio vale para teclado, colar, arrastar e IME, pois o
   * próprio ProseMirror passa a não ser editável.
   * @param {boolean} locked - Se o editor deve ficar somente leitura.
   * @returns {void}
   */
  setLocked(locked) {
    this.locked = locked;
    this.refresh();
    if (locked) {
      this.linkPopup.close();
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  }

  /**
   * Reaplica decorações e a propriedade `editable` do ProseMirror (sem alterar o documento).
   * @returns {void}
   */
  refresh() {
    for (const view of [
      this.editor.wwEditor?.view,
      this.editor.mdEditor?.view,
    ]) {
      if (view) view.dispatch(view.state.tr.setMeta("dw-refresh", true));
    }
  }

  /**
   * Caminhos (minúsculos) dos arquivos existentes, para detectar links quebrados.
   * @returns {Set<string>}
   * @private
   */
  getExistingPaths() {
    const files = this.getFiles();
    if (files !== this.existingCache.files) {
      this.existingCache = { files, set: existingPathSet(files) };
    }
    return this.existingCache.set;
  }

  /**
   * Menu de contexto (botão direito) dos links internos: remover link.
   * @param {HTMLElement} menu - Elemento do menu.
   * @param {HTMLElement} container - Elemento do editor.
   * @returns {void}
   * @private
   */
  setupLinkMenu(menu, container) {
    let target = null;
    const hide = () => menu.classList.add("hidden");

    container.addEventListener("contextmenu", (e) => {
      const anchor = e.target.closest?.("a");
      if (
        !anchor ||
        !this.editor.isWysiwygMode() ||
        this.locked ||
        !isInternalHref(anchor.getAttribute("href"))
      ) {
        hide();
        return;
      }
      e.preventDefault();
      target = anchor;
      const rect = (menu.offsetParent || this.host).getBoundingClientRect();
      menu.style.left = `${e.clientX - rect.left}px`;
      menu.style.top = `${e.clientY - rect.top}px`;
      menu.classList.remove("hidden");
    });

    menu
      .querySelector('[data-role="link-remove"]')
      .addEventListener("click", () => {
        const view = this.getView();
        if (view && target) removeLinkAt(view, target);
        target = null;
        hide();
      });
    document.addEventListener("mousedown", (e) => {
      if (!menu.contains(e.target)) hide();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hide();
    });
  }

  /**
   * Destrói o editor e os painéis.
   * @returns {void}
   */
  destroy() {
    this.editor.destroy();
    this.host
      .querySelectorAll("[data-panel]")
      .forEach((element) => element.remove());
  }
}
