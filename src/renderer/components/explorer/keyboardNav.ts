/**
 * @file Navegação do explorer pelo teclado. Depois de clicar no explorer:
 *  - ↑ ↓ percorrem os itens visíveis da aba atual com o mesmo destaque do hover (sem selecionar/abrir o arquivo);
 *  - ← → percorrem as opções do item (criar, renomear, editar, excluir...), que ficam visíveis como no hover;
 *  - Enter abre/fecha a pasta, abre o arquivo ou aciona a opção escolhida;
 *  - ↓ no último item seleciona a gaveta do assistente de IA; Enter nela a abre (com o foco no campo de texto).
 *
 * O ponto de partida é o arquivo selecionado da aba (ou o primeiro item, se não houver).
 */

/** Seletor das linhas navegáveis (arquivos e pastas). */
const ROW_SELECTOR = "#file-tree .file-name, #file-tree .folder-name";

/** Classe do destaque por teclado (equivale ao `:hover`). */
const FOCUS_CLASS = "kb-focus";
const BTN_CLASS = "kb-btn-focus";

/**
 * Navegação por teclado do explorer.
 * @class
 */
export class ExplorerKeyboard {
  declare btn: any;
  declare chat: any;
  declare key: any;
  declare lastRowKey: any;
  declare on: any;
  declare root: any;
  declare shown: any;

  /**
   * @param {HTMLElement} root - Elemento do explorer (`#explorer-container`).
   */
  constructor(root) {
    this.root = root;
    /** Se o explorer "tem o teclado" (depois de um clique nele). */
    this.on = false;
    /** Chave (data-path) e botão do item destacado. */
    this.key = null;
    this.btn = -1;
    /** Se a gaveta do chat é o destaque atual. */
    this.chat = false;
    /** Se há algum destaque de teclado visível. */
    this.shown = false;
    /** Última linha destacada (o Esc no chat devolve a seleção a ela). */
    this.lastRowKey = null;

    root.addEventListener("mousedown", (e) => this.onMouseDown(e));
    document.addEventListener("mousedown", (e) => {
      if (!root.contains(e.target as Node) && !this.chatHeader()?.contains(e.target as Node)) {
        this.deactivate();
      }
    });
    document.addEventListener("keydown", (e) => this.onKeyDown(e));
  }

  /** @returns {HTMLElement|null} Cabeçalho (botão) da gaveta do assistente. */
  chatHeader() {
    return document.getElementById("ai-assistant-header");
  }

  /**
   * Linhas visíveis da aba atual, na ordem da tela.
   * @returns {HTMLElement[]}
   */
  rows() {
    return [...this.root.querySelectorAll(ROW_SELECTOR)].filter(
      (el) => el.getClientRects().length > 0,
    );
  }

  /**
   * Identificador estável de uma linha (sobrevive a redesenhos da árvore).
   * @param {HTMLElement} row - Linha.
   * @returns {string}
   */
  keyOf(row) {
    return (
      row.dataset.absolutePath ||
      row.closest("li")?.dataset.path ||
      row.dataset.path ||
      ""
    );
  }

  /**
   * Linha destacada (procurada de novo se a árvore foi redesenhada).
   * @returns {HTMLElement|null}
   */
  current() {
    if (!this.key) return null;
    return this.rows().find((row) => this.keyOf(row) === this.key) || null;
  }

  /**
   * Opções (botões) de uma linha, da esquerda para a direita.
   * @param {HTMLElement} row - Linha.
   * @returns {HTMLElement[]}
   */
  buttons(row) {
    if (row.classList.contains("folder-name")) {
      return [...row.querySelectorAll(".folder-act-btn")];
    }
    const li = row.closest("li");
    return li
      ? [
          ...li.querySelectorAll(
            ":scope > .item-edit-btn, :scope > .item-delete-btn",
          ),
        ]
      : [];
  }

  /**
   * Remove todo destaque de teclado.
   * @returns {void}
   */
  clearMarks() {
    this.root
      .querySelectorAll(`.${FOCUS_CLASS}, .${BTN_CLASS}`)
      .forEach((el) => el.classList.remove(FOCUS_CLASS, BTN_CLASS));
    this.chatHeader()?.classList.remove(FOCUS_CLASS);
    this.shown = false;
  }

  /**
   * Desliga a navegação (clique fora do explorer, troca de aba...).
   * @returns {void}
   */
  deactivate() {
    this.on = false;
    this.key = null;
    this.btn = -1;
    this.chat = false;
    this.clearMarks();
  }

  /**
   * Reinicia o ponto de partida (ex.: troca de aba), mantendo o teclado no explorer.
   * @returns {void}
   */
  reset() {
    this.key = null;
    this.btn = -1;
    this.chat = false;
    this.clearMarks();
  }

  /**
   * Clique no explorer: liga o teclado e define o ponto de partida (o item clicado, ou o arquivo selecionado da aba).
   * @param {MouseEvent} e
   * @returns {void}
   */
  onMouseDown(e) {
    this.on = true;
    this.btn = -1;
    this.chat = false;
    this.clearMarks();
    const row = e.target.closest?.(".file-name, .folder-name");
    this.key = row && this.root.contains(row) ? this.keyOf(row) : null;
    // Botões clicados não devem ficar com o foco (Enter seria tratado duas vezes)
    setTimeout(() => {
      const active = document.activeElement;
      if (active?.tagName === "BUTTON" && this.root.contains(active)) {
        (active as HTMLElement).blur();
      }
    });
  }

  /**
   * Destaca uma linha (e a rola para a vista).
   * @param {HTMLElement} row - Linha.
   * @param {number} [btn=-1] - Índice da opção destacada (-1 = só a linha).
   * @returns {void}
   */
  mark(row, btn = -1) {
    this.clearMarks();
    this.chat = false;
    this.key = this.keyOf(row);
    this.lastRowKey = this.key;
    this.btn = btn;
    row.classList.add(FOCUS_CLASS);
    this.shown = true;
    // Arquivos: as opções ficam no <li>, então ele também recebe o destaque
    if (row.classList.contains("file-name")) {
      row.closest("li")?.classList.add(FOCUS_CLASS);
    }
    const options = this.buttons(row);
    if (btn >= 0 && options[btn]) options[btn].classList.add(BTN_CLASS);
    row.scrollIntoView({ block: "nearest" });
  }

  /**
   * Devolve o teclado ao explorer (ex.: Esc no chat): destaca a última linha usada, ou o arquivo selecionado da aba, ou o
   * primeiro item, e as setas voltam a navegar.
   * @returns {void}
   */
  restore() {
    this.on = true;
    const rows = this.rows();
    if (rows.length === 0) return;
    const row =
      rows.find((r) => this.keyOf(r) === this.lastRowKey) ||
      rows.find((r) => r.classList.contains("active")) ||
      rows[0];
    this.mark(row);
  }

  /**
   * Destaca a gaveta do assistente de IA.
   * @returns {void}
   */
  markChat() {
    this.clearMarks();
    this.chat = true;
    this.key = null;
    this.btn = -1;
    this.chatHeader()?.classList.add(FOCUS_CLASS);
    this.shown = true;
  }

  /**
   * Se a tecla pertence ao explorer neste momento.
   * @param {KeyboardEvent} e
   * @returns {boolean}
   */
  shouldHandle(e) {
    if (!this.on || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
      return false;
    }
    if (document.querySelector("#modal-container:not(.hidden)")) return false;
    const t = e.target;
    if (t instanceof HTMLElement) {
      if (t.isContentEditable) return false;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return false;
      // Só quando o foco está no corpo da página ou no próprio explorer
      if (t !== document.body && !this.root.contains(t)) return false;
    }
    return true;
  }

  /**
   * Tratamento das teclas.
   * @param {KeyboardEvent} e
   * @returns {void}
   */
  onKeyDown(e) {
    if (
      ![
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Enter",
        "Escape",
      ].includes(e.key)
    ) {
      return;
    }
    if (!this.shouldHandle(e)) return;

    const rows = this.rows();
    if (e.key === "Escape") {
      this.reset();
      return;
    }

    // --- Gaveta do assistente ---
    if (this.chat) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (rows.length) this.mark(rows[rows.length - 1]);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const drawer = document.getElementById("chat-container");
        if (drawer?.classList.contains("expanded")) {
          document.getElementById("ai-chat-input")?.focus();
        } else {
          this.chatHeader()?.click(); // mesmo caminho do clique (foca o campo de texto)
        }
        this.deactivate();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
      }
      return;
    }

    if (rows.length === 0) return;
    const row = this.current();
    const index = row ? rows.indexOf(row) : -1;
    const active = rows.findIndex((r) => r.classList.contains("active"));

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        if (!row) {
          // Primeiro uso: parte do arquivo selecionado (anda um) ou do primeiro item
          this.mark(
            rows[active >= 0 ? Math.min(active + 1, rows.length - 1) : 0],
          );
          if (active >= 0 && active === rows.length - 1) this.markChat();
        } else if (index >= rows.length - 1) {
          this.markChat();
        } else {
          this.mark(rows[index + 1]);
        }
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        if (!row) {
          this.mark(rows[active > 0 ? active - 1 : 0]);
        } else if (index > 0) {
          this.mark(rows[index - 1]);
        }
        break;
      }
      case "ArrowRight": {
        e.preventDefault();
        if (!row) return;
        const count = this.buttons(row).length;
        if (count && this.btn < count - 1) this.mark(row, this.btn + 1);
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        if (!row) return;
        if (this.btn >= 0) this.mark(row, this.btn - 1);
        break;
      }
      case "Enter": {
        // Só age sobre o que está destacado por teclado
        if (!row || !this.shown) return;
        e.preventDefault();
        const option = this.buttons(row)[this.btn];
        if (option) option.click();
        else row.click();
        break;
      }
      default:
    }
  }
}
