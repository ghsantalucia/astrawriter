// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Menu de contexto dos problemas de escrita (palavra desconhecida ou repetida): sugestões, ignorar e adicionar ao
 * dicionário. É um menu do próprio app, no mesmo visual das demais janelinhas.
 */

/**
 * Menu flutuante simples (um item por linha).
 * @class
 */
export class WritingMenu {
  constructor() {
    this.el = null;
    this.onAway = (event) => {
      if (this.el && !this.el.contains(event.target)) this.close();
    };
    this.onKey = (event) => {
      if (event.key === "Escape") this.close();
    };
  }

  /**
   * Abre o menu.
   * @param {Object} params
   * @param {number} params.x - Posição horizontal (tela).
   * @param {number} params.y - Posição vertical (tela).
   * @param {string} params.title - Linha de cabeçalho (não clicável).
   * @param {Array<{label?: string, onClick?: Function, separator?: boolean, muted?: boolean, icon?: string}>} params.items - Itens.
   * @returns {void}
   */
  open({ x, y, title, items }) {
    this.close();
    const el = document.createElement("div");
    el.className = "writing-menu";
    el.setAttribute("role", "menu");

    const head = document.createElement("div");
    head.className = "writing-menu-title";
    head.textContent = title;
    el.appendChild(head);

    items.forEach((item) => {
      if (item.separator) {
        const hr = document.createElement("div");
        hr.className = "writing-menu-sep";
        el.appendChild(hr);
        return;
      }
      const row = document.createElement("button");
      row.type = "button";
      row.className = `writing-menu-item${item.muted ? " muted" : ""}`;
      row.setAttribute("role", "menuitem");
      row.disabled = !item.onClick;
      if (item.icon) {
        const icon = document.createElement("i");
        icon.className = item.icon;
        row.appendChild(icon);
      }
      row.appendChild(document.createTextNode(item.label));
      row.addEventListener("click", () => {
        this.close();
        item.onClick?.();
      });
      el.appendChild(row);
    });

    document.body.appendChild(el);
    const box = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(x, window.innerWidth - box.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(y, window.innerHeight - box.height - 8))}px`;
    this.el = el;

    // Pequeno atraso para o clique que abriu o menu não fechá-lo
    setTimeout(() => {
      document.addEventListener("mousedown", this.onAway, true);
      document.addEventListener("keydown", this.onKey, true);
      window.addEventListener("blur", () => this.close(), { once: true });
    });
  }

  /**
   * Fecha o menu.
   * @returns {void}
   */
  close() {
    document.removeEventListener("mousedown", this.onAway, true);
    document.removeEventListener("keydown", this.onKey, true);
    this.el?.remove();
    this.el = null;
  }
}
