/**
 * @file Componente de dropdown (lista suspensa) personalizado e reutilizável.
 * Suporta opções selecionáveis e "ações" (botões dentro do menu, ex.: "+ Criar novo livro").
 * Os cliques são declarativos (`event-click`): selecionar uma opção emite o `selectEvent` e cada ação emite o
 * seu próprio evento no uiBus, sem o componente conhecer quem os trata.
 */

import "./styles.css";
import templateHtml from "./templates/main.hbs?raw";
import { Component } from "../Component.js";

/**
 * Dropdown com opções e botões de ação.
 * @class
 * @extends Component
 */
export class DropdownComponent extends Component {
  declare config: any;
  declare element: any;
  declare isOpen: any;
  declare items: any;
  declare value: any;

  /**
   * Cria uma instância do DropdownComponent.
   * @param {string} selector - Seletor CSS do container onde o dropdown será renderizado.
   * @param {Object} context - Objeto de infraestrutura (state, uiBus, domainBus).
   * @param {Object} [params] - Configuração do dropdown.
   * @param {string} [params.placeholder] - Texto exibido enquanto nenhuma opção está selecionada.
   * @param {string} [params.emptyLabel] - Texto exibido quando não há opções.
   * @param {string} params.selectEvent - Evento do uiBus emitido ao selecionar uma opção (o valor vai em `data.value`).
   * @param {string} [params.itemEditEvent] - Evento emitido pelo botão de editar (caneta) de cada opção (`data.value`).
   * @param {string} [params.itemEditTitle] - Dica do botão de editar.
   * @param {Array<{label: string, icon?: string, event: string, data?: Object}>} [params.actions] - Botões de ação do menu.
   * @param {Component|null} [parent=null] - Componente pai opcional.
   */
  constructor(selector, context, params, parent = null) {
    super(selector, context, templateHtml, params, parent);

    this.config = params || {};
    /** @type {Array<{value: string, label: string}>} */
    this.items = [];
    /** @type {string|null} */
    this.value = null;
    this.isOpen = false;
  }

  /**
   * Fornece os dados do template (opções, ações, rótulo atual e estado aberto/fechado).
   * @returns {Object} Contexto do template Handlebars.
   */
  getContext() {
    const selected = this.items.find((item) => item.value === this.value);

    return {
      isOpen: this.isOpen,
      label: selected?.label || this.config.placeholder || "Selecione",
      emptyLabel: this.config.emptyLabel || "Nenhuma opção",
      selectEvent: this.config.selectEvent,
      itemEditEvent: this.config.itemEditEvent,
      itemEditTitle: this.config.itemEditTitle || "Editar",
      actions: this.config.actions || [],
      items: this.items.map((item) => ({
        ...item,
        selected: item.value === this.value,
      })),
    };
  }

  /**
   * Registra a abertura/fechamento do menu (clique no botão, clique fora e tecla Esc).
   * @returns {void}
   */
  setupListeners() {
    // Delegação no container: continua válida após cada re-renderização
    this.element.addEventListener("click", (e) => {
      if (e.target.closest(".dropdown-trigger")) {
        this.setOpen(!this.isOpen);
      } else if (e.target.closest(".dropdown-item, .dropdown-action")) {
        this.setOpen(false);
      }
    });

    document.addEventListener("click", (e) => {
      if (this.isOpen && !this.element.contains(e.target)) this.setOpen(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen) this.setOpen(false);
    });
  }

  /**
   * Abre ou fecha o menu.
   * @param {boolean} open - Se o menu deve ficar aberto.
   * @returns {void}
   */
  setOpen(open) {
    this.isOpen = open;
    const root = this.element?.querySelector(".dropdown");
    if (!root) return;

    root.classList.toggle("open", open);
    root
      .querySelector(".dropdown-trigger")
      ?.setAttribute("aria-expanded", String(open));
    const menu = root.querySelector(".dropdown-menu");
    if (menu) menu.hidden = !open;
  }

  /**
   * Substitui a lista de opções e redesenha o dropdown.
   * @param {Array<{value: string, label: string}>} items - Novas opções.
   * @returns {void}
   */
  setItems(items) {
    this.items = Array.isArray(items) ? items : [];
    this.render();
  }

  /**
   * Define a opção selecionada e redesenha o dropdown.
   * @param {string|null} value - Valor da opção selecionada.
   * @returns {void}
   */
  setValue(value) {
    if (this.value === value) return;
    this.value = value;
    this.render();
  }
}
