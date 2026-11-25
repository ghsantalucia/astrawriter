/**
 * @file Utilitários compartilhados pelas páginas das centrais (Revisões, Livro e IA): montagem do HTML com delegação de
 * eventos, janela de confirmação e formatação.
 */

import { escapeHtml } from "../../../utils/helpers.js";
import { t, getLanguage } from "../../../../shared/i18n.js";

/**
 * Escapa texto para uso em HTML.
 * @param {any} text - Texto.
 * @returns {string}
 */
export const esc = (text) => escapeHtml(String(text ?? ""));

/**
 * Monta o HTML em um elemento e liga um único ouvinte de clique por delegação: qualquer elemento com `data-act` chama
 * `handlers[act](elemento, evento)`. Também liga `change`/`input` aos elementos com `data-change`/`data-input`.
 * @param {HTMLElement} host - Elemento que recebe o conteúdo (o conteúdo anterior é descartado, com os ouvintes).
 * @param {string} html - HTML.
 * @param {Object<string, (el: HTMLElement, event: Event) => any>} handlers - Ações por nome.
 * @returns {HTMLElement} A raiz criada dentro do host.
 */
export function mount(host, html, handlers = {}) {
  const root = document.createElement("div");
  root.className = "cn-root";
  root.innerHTML = html;
  const run = (event, attr) => {
    const el = event.target.closest(`[${attr}]`);
    if (!el || !root.contains(el)) return;
    const handler = handlers[el.getAttribute(attr)];
    if (handler) handler(el, event);
  };
  root.addEventListener("click", (e) => run(e, "data-act"));
  root.addEventListener("change", (e) => run(e, "data-change"));
  root.addEventListener("input", (e) => run(e, "data-input"));
  host.replaceChildren(root);
  return root;
}

/**
 * Abre a janela de confirmação do app (acima da central).
 * @param {Object} uiBus - Barramento de UI.
 * @param {Object} options
 * @param {string} options.title - Título.
 * @param {string} options.html - Conteúdo (HTML já escapado).
 * @param {string} [options.confirmText="Confirmar"] - Texto do botão principal.
 * @param {boolean} [options.danger=false] - Botão principal vermelho.
 * @param {() => any} options.onConfirm - Chamado ao confirmar.
 * @returns {void}
 */
export function confirmModal(uiBus, { title, html, confirmText = t("Confirmar"), danger = false, onConfirm }) {
  uiBus.emit("modal:open", {
    id: `central-confirm-${Date.now()}`,
    title,
    content: `<div class="cn-confirm">${html}</div>`,
    buttons: [
      { text: t("Cancelar"), class: "btn-secondary" },
      {
        text: confirmText,
        class: danger ? "btn-danger" : "btn-primary",
        onClick: async (modal) => {
          modal.close();
          await onConfirm();
        },
      },
    ],
  });
}

/**
 * Linha com título, descrição e um switch (o mesmo visual das Configurações).
 * @param {Object} options
 * @param {string} [options.id] - Id do input.
 * @param {boolean} options.checked - Estado.
 * @param {string} options.title - Título (já escapado).
 * @param {string} [options.hint] - Descrição (já escapada).
 * @param {string} [options.attrs] - Atributos extras do input (ex.: `data-change="x"`).
 * @param {boolean} [options.disabled] - Desabilitado.
 * @returns {string}
 */
export function switchRow({ id = "", checked, title, hint = "", attrs = "", disabled = false }) {
  return `<label class="cn-switch-row${disabled ? " disabled" : ""}">
    <span class="cn-switch-text"><strong>${title}</strong>${hint ? `<small>${hint}</small>` : ""}</span>
    <span class="switch"><input type="checkbox" ${id ? `id="${id}"` : ""} ${attrs} ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} /><span class="slider"></span></span>
  </label>`;
}

/**
 * Tamanho em bytes legível (KB, MB, GB).
 * @param {number} bytes - Tamanho.
 * @returns {string}
 */
export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toLocaleString(getLanguage(), { maximumFractionDigits: value < 10 ? 2 : 1 })} ${units[i]}`;
}

/**
 * Número com o substantivo no singular ou plural.
 * @param {number} n - Quantidade.
 * @param {string} one - Singular.
 * @param {string} many - Plural.
 * @returns {string}
 */
export function plural(n, one, many) {
  return `${n} ${t(n === 1 ? one : many)}`;
}

/**
 * Data/hora curta para exibição.
 * @param {string} iso - Data ISO.
 * @returns {string}
 */
export function shortDate(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
