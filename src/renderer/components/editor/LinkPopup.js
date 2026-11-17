/**
 * @file Caixa de inserção de link do editor: aba "Arquivo do livro" (busca por nome, exibindo o caminho para evitar
 * ambiguidade) e aba "Link externo" (URL e texto). Substitui o popup de link padrão do Toast UI Editor.
 */

import { escapeHtml } from "../../utils/helpers.js";

/**
 * Popup de inserção de links.
 * @class
 */
export class LinkPopup {
  /**
   * @param {HTMLElement} popup - Elemento do popup (markup em `templates/main.hbs`).
   * @param {Object} options
   * @param {(term: string) => Array<{title: string, displayPath: string, href: string}>} options.search - Busca de arquivos do livro.
   * @param {() => string} options.getSelectedText - Texto selecionado no editor.
   * @param {(link: {url: string, text: string}) => void} options.insert - Insere o link no editor.
   * @param {() => void} options.onClose - Chamado ao fechar (devolve o foco ao editor).
   */
  constructor(popup, { search, getSelectedText, insert, onClose }) {
    this.popup = popup;
    this.search = search;
    this.getSelectedText = getSelectedText;
    this.insert = insert;
    this.onClose = onClose;

    this.searchInput = popup.querySelector(`[data-role="link-search"]`);
    this.results = popup.querySelector(`[data-role="link-results"]`);
    this.urlInput = popup.querySelector(`[data-role="link-url"]`);
    this.textInput = popup.querySelector(`[data-role="link-text"]`);
    /** Resultados exibidos, na ordem da lista. */
    this.items = [];
    this.active = 0;

    this.bind();
  }

  /**
   * Liga os eventos do popup.
   * @returns {void}
   * @private
   */
  bind() {
    this.popup
      .querySelectorAll(".link-tab")
      .forEach((tab) =>
        tab.addEventListener("click", () => this.showTab(tab.dataset.tab)),
      );

    this.searchInput.addEventListener("input", () => this.renderResults());
    this.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        this.active =
          (this.active + step + this.items.length) % (this.items.length || 1);
        this.highlight();
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.pick(this.items[this.active]);
      } else if (e.key === "Escape") {
        this.close();
      }
    });

    this.results.addEventListener("mousedown", (e) => {
      // mousedown (e não click) evita que o campo perca o foco antes da escolha
      e.preventDefault();
      const row = e.target.closest("[data-index]");
      if (row) this.pick(this.items[Number(row.dataset.index)]);
    });

    const submitExternal = () => {
      const url = this.urlInput.value.trim();
      if (!url) {
        this.urlInput.focus();
        return;
      }
      this.insert({ url, text: this.textInput.value.trim() || url });
      this.close();
    };
    this.popup
      .querySelector(`[data-role="link-external-ok"]`)
      .addEventListener("click", submitExternal);
    [this.urlInput, this.textInput].forEach((input) =>
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submitExternal();
        } else if (e.key === "Escape") {
          this.close();
        }
      }),
    );
    this.popup
      .querySelector(`[data-role="link-cancel"]`)
      .addEventListener("click", () => this.close());
  }

  /**
   * Indica se o popup está aberto.
   * @returns {boolean}
   */
  isOpen() {
    return !this.popup.classList.contains("hidden");
  }

  /**
   * Abre o popup embaixo de um botão.
   * @param {HTMLElement} anchor - Botão que o abriu.
   * @returns {void}
   */
  open(anchor) {
    const host = this.popup.offsetParent || this.popup.parentElement;
    const hostRect = host.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    this.popup.style.top = `${rect.bottom - hostRect.top + 6}px`;
    this.popup.style.left = `${Math.max(8, Math.min(rect.left - hostRect.left, hostRect.width - 380))}px`;

    this.popup.classList.remove("hidden");
    this.urlInput.value = "";
    this.textInput.value = this.getSelectedText();
    this.searchInput.value = "";
    this.showTab("internal");
  }

  /**
   * Fecha o popup.
   * @returns {void}
   */
  close() {
    if (!this.isOpen()) return;
    this.popup.classList.add("hidden");
    this.onClose();
  }

  /**
   * Mostra a aba "internal" ou "external".
   * @param {"internal"|"external"} tab - Aba.
   * @returns {void}
   * @private
   */
  showTab(tab) {
    this.popup.querySelectorAll(".link-tab").forEach((el) => {
      el.classList.toggle("active", el.dataset.tab === tab);
    });
    this.popup.querySelectorAll(".link-pane").forEach((el) => {
      el.classList.toggle("hidden", el.dataset.pane !== tab);
    });
    if (tab === "internal") {
      this.renderResults();
      this.searchInput.focus();
    } else {
      this.urlInput.focus();
    }
  }

  /**
   * Lista os arquivos que combinam com o texto digitado: título em destaque e caminho abaixo, menor.
   * @returns {void}
   * @private
   */
  renderResults() {
    this.items = this.search(this.searchInput.value);
    this.active = 0;
    this.results.innerHTML = this.items.length
      ? this.items
          .map(
            (item, index) => `
        <li class="link-result" data-index="${index}">
          <span class="link-result-title">${escapeHtml(item.title)}</span>
          <span class="link-result-path">${escapeHtml(item.displayPath)}</span>
        </li>`,
          )
          .join("")
      : `<li class="link-empty">Nenhum arquivo encontrado</li>`;
    this.highlight();
  }

  /**
   * Marca a linha ativa da lista (navegação por setas).
   * @returns {void}
   * @private
   */
  highlight() {
    this.results.querySelectorAll(".link-result").forEach((row, index) => {
      row.classList.toggle("active", index === this.active);
      if (index === this.active) row.scrollIntoView({ block: "nearest" });
    });
  }

  /**
   * Insere o link do arquivo escolhido. O texto selecionado no editor vira o texto do link; sem seleção, o texto é o
   * título do arquivo.
   * @param {{title: string, href: string}|undefined} item - Arquivo escolhido.
   * @returns {void}
   * @private
   */
  pick(item) {
    if (!item) return;
    this.insert({
      url: item.href,
      text: this.getSelectedText() || item.title,
    });
    this.close();
  }
}
