/**
 * @file Componente "Central": janela grande com abas laterais (categorias), cabeçalho com o X e corpo com subtítulo e
 * conteúdo, sobre um overlay que bloqueia o app. É só o casco: quem sabe o que mostrar são as páginas
 * (`panels/issuesPanel`, `panels/bookPanel` e `panels/aiPanel`), que cumprem este contrato:
 *
 * - `title`: título do cabeçalho;
 * - `getTabs()`: abas laterais `{ id, label, icon, badges?: {error, warning} }` ou `{ separator: true }`;
 * - `getHeader(tab)`: `{ subtitle, lead }`;
 * - `render(tab, el)`: preenche o conteúdo (pode ser assíncrono);
 * - `dispose?()`: chamado ao fechar.
 *
 * Eventos: `central:open` `{ central: "issues"|"book"|"ai"|"system", tab? }`, `central:close` e `central:refresh`.
 */

import "./styles.css";
import "./panelStyles.css";
import templateHtml from "./templates/main.hbs?raw";
import { Component } from "../Component.js";
import { t } from "../../../shared/i18n.js";
import { IssuesPanel } from "./panels/issuesPanel.js";
import { BookPanel } from "./panels/bookPanel.js";
import { AiPanel } from "./panels/aiPanel.js";
import { SystemPanel } from "./panels/systemPanel.js";

/** Páginas disponíveis, por id. */
const PANELS = { issues: IssuesPanel, book: BookPanel, ai: AiPanel, system: SystemPanel };

/** Centrais, na ordem do menu de troca (clique no título). */
const CENTRALS = [
  { id: "issues", label: "Central de Revisões", icon: "fa-clipboard-check" },
  { id: "book", label: "Central do Livro", icon: "fa-book" },
  { id: "ai", label: "Central de IA", icon: "fa-wand-magic-sparkles" },
  { id: "system", label: "Central do Sistema", icon: "fa-gear" },
];

/**
 * Casco das centrais.
 * @class
 */
export class CentralComponent extends Component {
  declare panels: any;

  declare closeSwitcher: any;
  declare current: any;
  declare domainBus: any;
  declare element: any;
  declare refreshFrame: any;
  declare renderToken: any;
  declare services: any;
  declare state: any;
  declare uiBus: any;

  /**
   * @param {string} selector - Seletor do contêiner.
   * @param {Object} context - Contexto (state, uiBus, domainBus, services).
   * @param {Object|null} [params=null] - Parâmetros.
   * @param {Component|null} [parent=null] - Componente pai.
   */
  constructor(selector, context, params, parent = null) {
    super(selector, context, templateHtml, params, parent);
    this.services = context.services;
    /** Páginas já criadas. */
    this.panels = {};
    /** Estado atual: `{ id, tab }` ou null com a central fechada. */
    this.current = null;
    this.renderToken = 0;
  }

  /**
   * Contexto entregue às páginas.
   * @returns {Object}
   * @private
   */
  buildContext() {
    return {
      services: this.services,
      state: this.state,
      uiBus: this.uiBus,
      domainBus: this.domainBus,
      refresh: () => this.refresh(),
      isOpen: (id) => this.current?.id === id,
      /** Aba atual (as páginas com carga lenta conferem se ainda é a que pediram antes de desenhar). */
      currentTab: () => this.current?.tab ?? null,
      close: () => this.close(),
      selectTab: (tab) => this.selectTab(tab),
      toast: (message, type = "info") => this.uiBus.emit("toast:show", { message, type }),
    };
  }

  /**
   * Liga os ouvintes (eventos da central e do teclado).
   * @returns {void}
   */
  setupListeners() {
    this.uiBus.on("central:open", (payload) => {
      const data = payload?.data ?? payload ?? {};
      this.open(data.central, data.tab);
    });
    this.uiBus.on("central:close", () => this.close());
    this.uiBus.on("central:refresh", () => this.refresh());
    // A lista de issues se atualiza sozinha enquanto a central está aberta
    this.uiBus.on("issues:changed", () => {
      if (this.current?.id === "issues") this.scheduleRefresh();
    });
    // Troca de livro fecha a central
    this.uiBus.on("book:changed", () => this.close());

    const overlay = this.element.querySelector("#central-overlay");
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) this.close();
    });
    this.element.querySelector("#central-close").addEventListener("click", () => this.close());

    // Troca de central pelo título (discreto: só aparece uma setinha ao passar o mouse)
    const switcher = this.element.querySelector("#central-switcher");
    const titleBtn = this.element.querySelector("#central-title-btn");
    const setSwitcher = (open) => {
      switcher.classList.toggle("hidden", !open);
      titleBtn.setAttribute("aria-expanded", String(open));
    };
    titleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!switcher.classList.contains("hidden")) return setSwitcher(false);
      switcher.innerHTML = CENTRALS.map(
        (c) => `<button type="button" role="menuitem" class="central-switch-item ${c.id === this.current?.id ? "current" : ""}" data-central="${c.id}"><i class="fa-solid ${c.icon}"></i>${t(c.label)}</button>`,
      ).join("");
      setSwitcher(true);
    });
    switcher.addEventListener("click", (e) => {
      const item = e.target.closest("[data-central]");
      if (!item) return;
      setSwitcher(false);
      if (item.dataset.central !== this.current?.id) this.open(item.dataset.central);
    });
    document.addEventListener("mousedown", (e) => {
      if (!switcher.classList.contains("hidden") && !(e.target as Element).closest(".central-title-wrap")) setSwitcher(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !switcher.classList.contains("hidden")) {
        setSwitcher(false);
        titleBtn.focus();
      }
    });
    this.closeSwitcher = () => setSwitcher(false);
    this.element.querySelector("#central-tabs").addEventListener("click", (e) => {
      const tab = e.target.closest("[data-tab]");
      if (tab) this.selectTab(tab.dataset.tab);
    });

    // O Esc que fecha a central é o global (utils/escapeKey.ts), que respeita a ordem das camadas abertas
  }

  /**
   * Abre uma central.
   * @param {"issues"|"book"|"ai"} id - Qual central.
   * @param {string} [tab] - Aba inicial.
   * @returns {void}
   */
  open(id, tab?) {
    const Panel = PANELS[id];
    if (!Panel) return;
    this.current?.id !== id && this.panel()?.dispose?.();
    this.panels[id] ??= new Panel(this.buildContext());
    // A gaveta de configurações (que também cobre a tela) fecha ao abrir uma central
    this.uiBus.emit("settings:close");
    this.current = { id, tab: null };
    const first = this.panel().getTabs().find((tab) => !tab.separator);
    this.element.querySelector("#central-title").textContent = this.panel().title;
    this.element.querySelector("#central-overlay").classList.remove("hidden");
    this.element.querySelector("#central-overlay").setAttribute("aria-hidden", "false");
    this.selectTab(tab || first?.id);
  }

  /**
   * Fecha a central.
   * @returns {void}
   */
  close() {
    this.closeSwitcher?.();
    if (!this.current) return;
    this.panel()?.dispose?.();
    this.current = null;
    const overlay = this.element.querySelector("#central-overlay");
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    this.element.querySelector("#central-content").replaceChildren();
  }

  /**
   * Página da central aberta.
   * @returns {Object|null}
   * @private
   */
  panel() {
    return this.current ? this.panels[this.current.id] : null;
  }

  /**
   * Seleciona uma aba e desenha o conteúdo.
   * @param {string} tab - Id da aba.
   * @returns {void}
   */
  selectTab(tab) {
    if (!this.current) return;
    this.current.tab = tab;
    this.element.querySelector("#central-body").scrollTop = 0;
    // Mostra já a aba nova (o conteúdo da anterior sai e entra um aviso de carregamento até a página ficar pronta)
    this.element.querySelector("#central-content").innerHTML = '<div class="cn-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> ' + t("Carregando…") + "</div>";
    this.draw();
  }

  /**
   * Redesenha a aba atual preservando a rolagem.
   * @returns {void}
   */
  refresh() {
    if (!this.current) return;
    const body = this.element.querySelector("#central-body");
    const top = body.scrollTop;
    this.draw().then(() => {
      body.scrollTop = top;
    });
  }

  /**
   * Agrupa vários pedidos de atualização seguidos em um só redesenho.
   * @returns {void}
   * @private
   */
  scheduleRefresh() {
    cancelAnimationFrame(this.refreshFrame);
    this.refreshFrame = requestAnimationFrame(() => this.refresh());
  }

  /**
   * Desenha abas, cabeçalho e conteúdo da aba atual.
   * @returns {Promise<void>}
   * @private
   */
  async draw() {
    const panel = this.panel();
    if (!panel) return;
    const token = ++this.renderToken;
    const tabId = this.current.tab;

    const tabs = panel.getTabs();
    this.element.querySelector("#central-tabs").innerHTML = tabs
      .map((tab) => {
        if (tab.separator) return '<div class="central-tab-sep"></div>';
        const badges = tab.badges
          ? `<span class="cn-badges">${tab.badges.error ? `<span class="cn-badge error" title="${t("Erros confirmados")}">${tab.badges.error}</span>` : ""}${tab.badges.warning ? `<span class="cn-badge warning" title="${t("Possíveis erros e sugestões")}">${tab.badges.warning}</span>` : ""}</span>`
          : "";
        return `<button type="button" class="central-tab ${tab.id === tabId ? "active" : ""}" data-tab="${tab.id}">
          <i class="fa-solid ${tab.icon} tab-icon"></i><span class="tab-label">${tab.label}</span>${badges}</button>`;
      })
      .join("");

    const { subtitle, lead } = panel.getHeader(tabId);
    this.element.querySelector("#central-subtitle").textContent = subtitle;
    this.element.querySelector("#central-lead").textContent = lead || "";

    const content = this.element.querySelector("#central-content");
    await panel.render(tabId, content);
    if (token !== this.renderToken) return;
  }
}
