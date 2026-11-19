// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Campo de tags da caixa "Dados do arquivo": cada palavra digitada vira uma tag colorida ao digitar vírgula ou
 * Enter (ou ao sair do campo), com sugestões das tags já usadas no livro (navegáveis por setas e Enter).
 */

import {
  normalizeTag,
  parseTags,
  tagColorIndex,
} from "../../../shared/tags.js";
import { escapeHtml, foldText } from "../../utils/helpers.js";

/** Quantidade máxima de sugestões exibidas. */
const MAX_SUGGESTIONS = 8;

/**
 * HTML de uma tag colorida (a cor é sempre a mesma para a mesma tag).
 * @param {string} tag - Tag normalizada.
 * @param {boolean} [clickable=false] - Se clicar nela pesquisa por ela (cabeçalho da caixa de dados).
 * @returns {string}
 */
export function tagChipHtml(tag, clickable = false) {
  const attrs = clickable
    ? ` data-tag="${escapeHtml(tag)}" data-tooltip="Pesquisar #${escapeHtml(tag)}"`
    : "";
  return `<span class="tag-chip tag-c${tagColorIndex(tag)}${clickable ? " tag-link" : ""}"${attrs}>${escapeHtml(tag)}</span>`;
}

/**
 * Campo de entrada de tags.
 * @class
 */
export class TagInput {
  /**
   * @param {HTMLElement} root - Elemento onde o campo é montado.
   * @param {Object} options
   * @param {() => string[]} options.getKnownTags - Tags já usadas no livro (para as sugestões).
   * @param {() => void} [options.onChange] - Chamado quando a lista de tags muda.
   */
  constructor(root, { getKnownTags, onChange }) {
    this.root = root;
    this.getKnownTags = getKnownTags;
    this.onChange = onChange || (() => {});
    this.tags = [];
    this.active = -1;
    this.suggestions = [];
    this.build();
  }

  /** Monta o DOM do campo. @private */
  build() {
    this.root.classList.add("tag-input");
    this.root.innerHTML = `
      <div class="tag-input-box">
        <span class="tag-input-chips"></span>
        <input type="text" class="tag-input-field" autocomplete="off" spellcheck="false"
          placeholder="Digite e use vírgula ou Enter" aria-label="Tags" />
      </div>
      <ul class="tag-input-list" hidden role="listbox"></ul>`;
    this.chipsEl = this.root.querySelector(".tag-input-chips");
    this.input = this.root.querySelector("input");
    this.listEl = this.root.querySelector(".tag-input-list");

    this.root
      .querySelector(".tag-input-box")
      .addEventListener("click", () => this.input.focus());
    this.input.addEventListener("input", () => this.onInput());
    this.input.addEventListener("keydown", (e) => this.onKeyDown(e));
    this.input.addEventListener("blur", () => {
      // Pequeno atraso: permite o clique em uma sugestão antes de fechar a lista
      setTimeout(() => {
        this.commitPending();
        this.closeList();
      }, 120);
    });
    this.input.addEventListener("paste", (e) => {
      const text = e.clipboardData?.getData("text") || "";
      if (!/[,\n]/.test(text)) return;
      e.preventDefault();
      this.addMany(text.split(/[,\n]/));
    });
    this.chipsEl.addEventListener("click", (e) => {
      const remove = e.target.closest("[data-remove]");
      if (remove && !this.input.disabled) {
        e.stopPropagation();
        this.remove(remove.dataset.remove);
      }
    });
    this.listEl.addEventListener("mousedown", (e) => {
      // mousedown (e não click) para acontecer antes do blur do campo
      const item = e.target.closest("[data-tag]");
      if (!item) return;
      e.preventDefault();
      this.add(item.dataset.tag);
      this.input.value = "";
      this.closeList();
      this.input.focus();
    });
  }

  /**
   * Define as tags exibidas.
   * @param {string[]} tags - Tags.
   * @returns {void}
   */
  setTags(tags) {
    this.tags = parseTags(tags);
    this.input.value = "";
    this.closeList();
    this.renderChips();
  }

  /**
   * Tags atuais (inclui o texto ainda não confirmado).
   * @returns {string[]}
   */
  getTags() {
    return parseTags([...this.tags, this.input.value]);
  }

  /**
   * Habilita/desabilita o campo.
   * @param {boolean} disabled - Se deve ficar somente leitura.
   * @returns {void}
   */
  setDisabled(disabled) {
    this.input.disabled = disabled;
    this.root.classList.toggle("disabled", disabled);
    this.renderChips();
  }

  /** Redesenha as tags. @private */
  renderChips() {
    const locked = this.input.disabled;
    this.chipsEl.innerHTML = this.tags
      .map((tag) => {
        const safe = escapeHtml(tag);
        const remove = locked
          ? ""
          : `<button type="button" class="tag-remove" data-remove="${safe}" aria-label="Remover ${safe}">&times;</button>`;
        return `<span class="tag-chip tag-c${tagColorIndex(tag)}">${safe}${remove}</span>`;
      })
      .join("");
  }

  /**
   * Adiciona uma tag (normalizada, sem repetir).
   * @param {string} raw - Texto da tag.
   * @returns {void}
   */
  add(raw) {
    const tag = normalizeTag(raw);
    if (!tag || this.tags.includes(tag)) return;
    this.tags.push(tag);
    this.renderChips();
    this.onChange();
  }

  /**
   * Adiciona várias tags.
   * @param {string[]} parts - Textos.
   * @returns {void}
   */
  addMany(parts) {
    parts.forEach((part) => this.add(part));
    this.input.value = "";
    this.closeList();
  }

  /**
   * Remove uma tag.
   * @param {string} tag - Tag.
   * @returns {void}
   */
  remove(tag) {
    this.tags = this.tags.filter((t) => t !== tag);
    this.renderChips();
    this.onChange();
  }

  /** Transforma o texto digitado em tag. @private */
  commitPending() {
    if (this.input.value.trim()) this.add(this.input.value);
    this.input.value = "";
  }

  /** Reage à digitação: vírgula confirma a tag; senão atualiza as sugestões. @private */
  onInput() {
    const value = this.input.value;
    if (value.includes(",")) {
      const parts = value.split(",");
      const rest = parts.pop();
      parts.forEach((part) => this.add(part));
      this.input.value = rest.replace(/^\s+/, "");
    }
    // O "#" é só enfeite: se for digitado, sai
    if (/^\s*#/.test(this.input.value)) {
      this.input.value = this.input.value.replace(/^\s*#+/, "");
    }
    this.updateSuggestions();
  }

  /**
   * Teclado: Enter confirma (a sugestão marcada, se houver), setas navegam, Backspace remove a última tag.
   * @param {KeyboardEvent} e
   * @private
   */
  onKeyDown(e) {
    const open = !this.listEl.hidden && this.suggestions.length > 0;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!open) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      this.active =
        (this.active + step + this.suggestions.length) %
        this.suggestions.length;
      this.renderList();
    } else if (e.key === "Enter") {
      // Enter nunca envia o formulário daqui: só confirma a tag
      e.preventDefault();
      if (open && this.active >= 0) this.add(this.suggestions[this.active]);
      else this.add(this.input.value);
      this.input.value = "";
      this.closeList();
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      this.closeList();
    } else if (
      e.key === "Backspace" &&
      !this.input.value &&
      this.tags.length > 0
    ) {
      this.remove(this.tags[this.tags.length - 1]);
    }
  }

  /** Busca (entre as tags já cadastradas no livro) as que combinam com o texto digitado. @private */
  updateSuggestions() {
    const typed = foldText(normalizeTag(this.input.value));
    if (!typed) {
      this.closeList();
      return;
    }
    this.suggestions = this.getKnownTags()
      .filter(
        (tag) => !this.tags.includes(tag) && foldText(tag).includes(typed),
      )
      .sort((a, b) => {
        const pa = foldText(a).startsWith(typed) ? 0 : 1;
        const pb = foldText(b).startsWith(typed) ? 0 : 1;
        return pa - pb || a.localeCompare(b);
      })
      .slice(0, MAX_SUGGESTIONS);
    this.active = this.suggestions.length ? 0 : -1;
    this.renderList();
  }

  /** Desenha a lista de sugestões. @private */
  renderList() {
    this.listEl.hidden = this.suggestions.length === 0;
    if (this.suggestions.length > 0) this.positionList();
    this.listEl.innerHTML = this.suggestions
      .map((tag, i) => {
        const cls = i === this.active ? "active" : "";
        return `<li role="option" data-tag="${escapeHtml(tag)}" class="${cls}">${tagChipHtml(tag)}</li>`;
      })
      .join("");
  }

  /** Posiciona a lista (fixed) logo abaixo do campo, para ela poder passar dos limites da caixa de dados. @private */
  positionList() {
    const rect = this.root
      .querySelector(".tag-input-box")
      .getBoundingClientRect();
    this.listEl.style.left = `${rect.left}px`;
    this.listEl.style.top = `${rect.bottom + 2}px`;
    this.listEl.style.maxWidth = `${Math.max(rect.width, 200)}px`;
  }

  /** Fecha a lista de sugestões. @private */
  closeList() {
    this.suggestions = [];
    this.active = -1;
    this.listEl.hidden = true;
  }
}
