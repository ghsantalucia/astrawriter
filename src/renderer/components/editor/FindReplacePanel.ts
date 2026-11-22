/**
 * @file Painel flutuante de "procurar e substituir" do editor (aberto pelo botão da toolbar ou por Ctrl+F).
 *
 * A busca é feita enquanto o usuário digita, destaca todas as ocorrências (via plugin de decoração do editor) e
 * permite ir para a próxima/anterior, substituir a ocorrência atual ou todas.
 */

import { findMatches, replaceMatches } from "./editorTools.js";

/**
 * Painel de busca e substituição ligado a um editor Toast UI.
 * @class
 */
export class FindReplacePanel {
  declare count: any;
  declare current: any;
  declare getPm: any;
  declare getView: any;
  declare input: any;
  declare isReadOnly: any;
  declare panel: any;
  declare replaceInput: any;
  declare term: any;

  /**
   * @param {HTMLElement} panel - Elemento do painel (markup em `templates/main.hbs`).
   * @param {Object} options
   * @param {() => Object} options.getView - Retorna o EditorView do ProseMirror do modo ativo.
   * @param {() => boolean} options.isReadOnly - Se o editor está somente leitura (bloqueia a substituição).
   * @param {() => {TextSelection: Function}} options.getPm - Classes do ProseMirror expostas pelo plugin do editor.
   */
  constructor(panel, { getView, isReadOnly, getPm }) {
    this.panel = panel;
    this.getView = getView;
    this.getPm = getPm;
    this.isReadOnly = isReadOnly;
    /** Termo buscado (lido pelo plugin de decoração). */
    this.term = "";
    /** Índice da ocorrência atual. */
    this.current = 0;

    this.input = panel.querySelector(`[data-role="find-input"]`);
    this.replaceInput = panel.querySelector(`[data-role="replace-input"]`);
    this.count = panel.querySelector(`[data-role="find-count"]`);

    this.bind();
  }

  /**
   * Busca ativa, no formato esperado pelo plugin de decoração.
   * @returns {{term: string, current: number}}
   */
  getFind() {
    return { term: this.isOpen() ? this.term : "", current: this.current };
  }

  /**
   * Indica se o painel está aberto.
   * @returns {boolean}
   */
  isOpen() {
    return !this.panel.classList.contains("hidden");
  }

  /**
   * Liga os eventos do painel.
   * @returns {void}
   * @private
   */
  bind() {
    this.input.addEventListener("input", () => {
      this.term = this.input.value;
      this.current = 0;
      this.refresh(true);
    });

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (e.target === this.replaceInput && !e.shiftKey)
          this.replaceCurrent();
        else this.step(e.shiftKey ? -1 : 1);
      }
    };
    this.input.addEventListener("keydown", onKey);
    this.replaceInput.addEventListener("keydown", onKey);

    const click = (selector, handler) =>
      this.panel.querySelector(selector)?.addEventListener("click", handler);
    click(`[data-role="find-prev"]`, () => this.step(-1));
    click(`[data-role="find-next"]`, () => this.step(1));
    click(`[data-role="find-close"]`, () => this.close());
    click(`[data-role="replace-one"]`, () => this.replaceCurrent());
    click(`[data-role="replace-all"]`, () => this.replaceAll());
  }

  /**
   * Abre o painel com o foco na busca (usando o texto selecionado no editor, se houver).
   * @returns {void}
   */
  open() {
    const view = this.getView();
    if (view) {
      const { from, to, empty } = view.state.selection;
      const selected = empty ? "" : view.state.doc.textBetween(from, to, " ");
      if (selected && !selected.includes("\n")) {
        this.input.value = selected;
        this.term = selected;
      }
    }
    this.panel.classList.remove("hidden");
    this.input.focus();
    this.input.select();
    this.current = 0;
    this.refresh(true);
  }

  /**
   * Fecha o painel, remove os destaques e devolve o foco ao editor.
   * @returns {void}
   */
  close() {
    this.panel.classList.add("hidden");
    this.redraw();
    this.getView()?.focus();
  }

  /**
   * Alterna o painel (botão da toolbar).
   * @returns {void}
   */
  toggle() {
    if (this.isOpen()) this.close();
    else this.open();
  }

  /**
   * Ocorrências atuais no documento.
   * @returns {Array<{from: number, to: number}>}
   * @private
   */
  matches() {
    const view = this.getView();
    return view && this.term ? findMatches(view.state.doc, this.term) : [];
  }

  /**
   * Atualiza o contador, o destaque e (opcionalmente) rola até a ocorrência atual.
   * Também deve ser chamado quando o documento muda enquanto o painel está aberto.
   * @param {boolean} [scroll=false] - Se deve levar a ocorrência atual à vista.
   * @returns {void}
   */
  refresh(scroll = false) {
    if (!this.isOpen()) return;
    const matches = this.matches();
    if (this.current >= matches.length) this.current = 0;

    if (!this.term) this.count.textContent = "";
    else if (matches.length === 0) this.count.textContent = "Sem resultados";
    else this.count.textContent = `${this.current + 1} de ${matches.length}`;
    this.count.classList.toggle("empty", Boolean(this.term) && !matches.length);

    this.redraw();
    if (scroll && matches[this.current]) this.reveal(matches[this.current]);
  }

  /**
   * Força o editor a reaplicar as decorações (sem alterar o documento).
   * @returns {void}
   * @private
   */
  redraw() {
    const view = this.getView();
    if (view) view.dispatch(view.state.tr.setMeta("dw-find-refresh", true));
  }

  /**
   * Seleciona a ocorrência e a leva à vista, sem tirar o foco do campo de busca.
   * @param {{from: number, to: number}} match - Ocorrência.
   * @returns {void}
   * @private
   */
  reveal(match) {
    const view = this.getView();
    if (!view) return;
    const { TextSelection } = this.getPm();
    const selection = TextSelection.create(
      view.state.doc,
      match.from,
      match.to,
    );
    view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  }

  /**
   * Vai para a próxima (1) ou anterior (-1) ocorrência.
   * @param {1|-1} direction - Sentido.
   * @returns {void}
   */
  step(direction) {
    const matches = this.matches();
    if (matches.length === 0) return;
    this.current = (this.current + direction + matches.length) % matches.length;
    this.refresh(true);
  }

  /**
   * Substitui a ocorrência atual e passa para a seguinte.
   * @returns {void}
   */
  replaceCurrent() {
    if (this.isReadOnly()) return;
    const matches = this.matches();
    const match = matches[this.current];
    if (!match) return;
    replaceMatches(this.getView(), [match], this.replaceInput.value);
    this.refresh(true);
  }

  /**
   * Substitui todas as ocorrências.
   * @returns {void}
   */
  replaceAll() {
    if (this.isReadOnly()) return;
    const matches = this.matches();
    replaceMatches(this.getView(), matches, this.replaceInput.value);
    this.current = 0;
    this.refresh();
  }
}
