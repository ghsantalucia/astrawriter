// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Componente responsável pela renderização estrutural do toast.
 */

import "./styles.css";
import templateHtml from "./templates/main.hbs?raw";
import { Component } from "../Component.js";

/** Ícone (FontAwesome) de cada tipo de toast. */
const ICONS = {
  success: "fa-solid fa-circle-check",
  error: "fa-solid fa-circle-exclamation",
  info: "fa-solid fa-circle-info",
  warning: "fa-solid fa-triangle-exclamation",
};

/**
 * Representa o toast da aplicação.
 * @class
 */
export class ToastComponent extends Component {
  /**
   * Cria uma instância da classe
   * @param {string} selector - Seletor CSS do elemento do DOM onde será injetada.
   * @param {Object} context - Objeto de contexto e infraestrutura (state, uiBus, domainBus)
   * @param {Object|Array|null} [params=null] - Parâmetros opcionais dinâmicos para a exigência do componente.
   * @param {Component} [parent=null]
   */
  constructor(selector, context, params, parent = null) {
    super(selector, context, templateHtml, params, parent);
  }

  /**
   * Configura os ouvintes de eventos da interface.
   */
  setupListeners() {
    this.uiBus.on("toast:show", ({ message, type }) => {
      this.show(message, type);
    });
  }

  /**
   * Exibe uma notificação (toast) empilhada no canto inferior direito. Cada toast tem ícone conforme o tipo, uma
   * barra de tempo restante e some sozinho; passar o mouse por cima pausa a contagem e clicar o dispensa.
   * @param {string} message - Texto da mensagem.
   * @param {"success"|"error"|"info"|"warning"} [type="success"] - Tipo do toast.
   * @returns {void}
   */
  show(message, type = "success") {
    const stack = document.getElementById("toast-stack");
    if (!stack) return;

    const kind = ICONS[type] ? type : "info";
    const duration = kind === "error" ? 6000 : 3500;

    const toast = document.createElement("div");
    toast.className = `toast toast-${kind}`;
    toast.setAttribute("role", kind === "error" ? "alert" : "status");
    toast.style.setProperty("--toast-duration", `${duration}ms`);

    const icon = document.createElement("i");
    icon.className = `toast-icon ${ICONS[kind]}`;
    const text = document.createElement("span");
    text.className = "toast-text";
    text.textContent = message;
    const bar = document.createElement("span");
    bar.className = "toast-timer";

    toast.append(icon, text, bar);
    stack.appendChild(toast);
    // Limita a pilha: os mais antigos saem primeiro
    while (stack.children.length > 4) this.dismiss(stack.firstElementChild);

    requestAnimationFrame(() => toast.classList.add("visible"));

    let timer = setTimeout(() => this.dismiss(toast), duration);
    toast.addEventListener("mouseenter", () => {
      clearTimeout(timer);
      toast.classList.add("paused");
    });
    toast.addEventListener("mouseleave", () => {
      toast.classList.remove("paused");
      timer = setTimeout(() => this.dismiss(toast), 1500);
    });
    toast.addEventListener("click", () => this.dismiss(toast));
  }

  /**
   * Remove um toast com animação de saída.
   * @param {HTMLElement|null} toast - Elemento do toast.
   * @returns {void}
   * @private
   */
  dismiss(toast) {
    if (!toast || toast.dataset.leaving) return;
    toast.dataset.leaving = "1";
    toast.classList.remove("visible");
    toast.classList.add("leaving");
    setTimeout(() => toast.remove(), 300);
  }
}
