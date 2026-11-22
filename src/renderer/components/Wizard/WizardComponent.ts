/**
 * @file Componente de formulário em passos (wizard). Exibe um passo por vez, guarda as respostas ao navegar
 * (ir e voltar) e, ao concluir, emite `wizard:submit` no uiBus. É genérico: o conteúdo vem da lista de passos
 * recebida, então serve a criação de livros, capítulos, fichas, anotações e à edição de variáveis.
 */

import "./styles.css";
import templateHtml from "./templates/main.hbs?raw";
import { Component } from "../Component.js";
import { TagInput } from "../Editor/tagInput.js";
import { collectEventNames, normalizeEventName, parseEventNames } from "../../utils/eventNames.js";
import { flattenBookTree } from "../../utils/bookFiles.js";

/**
 * Wizard dinâmico renderizado dentro de um modal.
 * @class
 * @extends Component
 */
export class WizardComponent extends Component {
  declare destroyed: any;

  declare busListeners: any;
  declare busy: any;
  declare config: any;
  declare element: any;
  declare eventInputs: any;
  declare followers: any;
  declare index: any;
  declare state: any;
  declare steps: any;
  declare touched: any;
  declare uiBus: any;
  declare values: any;

  /**
   * Cria uma instância do WizardComponent.
   * @param {string} selector - Seletor CSS do container onde o wizard será renderizado.
   * @param {Object} context - Objeto de infraestrutura (state, uiBus, domainBus).
   * @param {Object} params - Configuração do wizard.
   * @param {string} params.wizardId - Identificador único (correlaciona `wizard:submit` e o resultado).
   * @param {string} params.kind - Tipo do wizard (devolvido no envio).
   * @param {Object} [params.context] - Dados repassados sem alteração no envio.
   * @param {Array<import("../../utils/template.js").WizardStep>} params.steps - Passos do formulário.
   * @param {string} [params.submitLabel="Concluir"] - Texto do botão final.
   * @param {boolean} [params.allowSkip=false] - Exibe "Pular e criar" nos passos que não são o último.
   * @param {boolean} [params.readOnly=false] - Desabilita os campos e oculta o botão final.
   * @param {Object} [params.modal] - Instância do modal que contém o wizard (fechada ao concluir).
   * @param {Component|null} [parent=null] - Componente pai opcional.
   */
  constructor(selector, context, params, parent = null) {
    super(selector, context, templateHtml, params, parent);

    this.config = params || {};
    this.steps = this.config.steps || [];
    this.index = 0;
    /** Respostas por id de campo (preservadas ao navegar entre passos). */
    this.values = {};
    this.busy = false;
    this.destroyed = false;
    /** Campos que acompanham outro, e os que o autor já alterou à mão (deixam de acompanhar). */
    this.followers = new Set(this.steps.flatMap((s) => s.fields).filter((f) => f.follows).map((f) => f.id));
    this.touched = new Set();
    /** Ouvintes registrados no uiBus (removidos em {@link WizardComponent#destroy}). */
    this.busListeners = [];

    this.steps.forEach((step) =>
      step.fields.forEach((field) => {
        this.values[field.id] = field.value ?? "";
      }),
    );
  }

  /**
   * Fornece os dados do passo atual para o template.
   * @returns {Object} Contexto do template Handlebars.
   */
  getContext() {
    const step = this.steps[this.index];

    return {
      step: {
        ...step,
        fields: step.fields.map((field) => ({
          ...field,
          isTextarea: field.type === "textarea",
          isSelect: field.type === "select" && (field.options || []).length > 0,
          isEvents: field.type === "events",
          options: (field.options || []).map((o) => ({
            ...o,
            selected: o.value === (this.values[field.id] ?? ""),
          })),
          rows: field.rows || 6,
          value: this.values[field.id] ?? "",
        })),
      },
      isMulti: this.steps.length > 1,
      progress: this.steps.map((s, i) => ({
        title: s.title,
        number: i + 1,
        active: i === this.index,
        done: i < this.index,
      })),
      current: this.index + 1,
      total: this.steps.length,
      isFirst: this.index === 0,
      isLast: this.isLast(),
      canSkip:
        Boolean(this.config.allowSkip) && this.index < this.steps.length - 1,
      readOnly: Boolean(this.config.readOnly),
      submitLabel: this.config.submitLabel || "Concluir",
    };
  }

  /**
   * Ao montar, foca o primeiro campo do passo.
   * @returns {void}
   */
  onInit() {
    this.mountEventFields();
    this.focusFirstField();
  }

  /**
   * Monta os campos de eventos ("antes"/"depois") do passo atual: itens separados por vírgula, com sugestões dos eventos
   * cadastrados e criação de nomes novos.
   * @returns {void}
   * @private
   */
  mountEventFields() {
    this.eventInputs = [];
    const hosts = this.element?.querySelectorAll("[data-events-host]") || [];
    if (hosts.length === 0) return;
    const files = this.state?.currentBookMap && this.state?.currentBookPath ? flattenBookTree(this.state.currentBookMap, this.state.currentBookPath) : [];
    const { titles, pending } = collectEventNames(files);
    hosts.forEach((host) => {
      const hidden = host.parentElement.querySelector('input[type="hidden"]');
      const input = new TagInput(host, {
        getKnownTags: () => [...titles, ...pending],
        normalize: normalizeEventName,
        parse: parseEventNames,
        placeholder: host.dataset.placeholder || "Nome do evento (vírgula ou Enter)",
        label: host.dataset.placeholder || "Eventos",
        stripHash: false,
        colored: false,
        stopEnter: true,
        onChange: () => {
          hidden.value = input.getTags().join(", ");
        },
      });
      input.setTags(parseEventNames(hidden.value));
      input.setDisabled(Boolean(this.config.readOnly));
      this.eventInputs.push({ input, hidden });
    });
  }

  /**
   * Registra os ouvintes de cliques/teclado do formulário e dos resultados enviados pelo controller.
   * @returns {void}
   */
  setupListeners() {
    this.element.addEventListener("click", (e) => {
      const button = e.target.closest("[data-action]");
      if (button && !this.busy) this.handleAction(button.dataset.action);
    });

    // Enter em um campo de linha única avança (ou envia, no último passo)
    this.element.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.target.tagName !== "INPUT" || this.busy)
        return;
      e.preventDefault();
      this.handleAction(this.isLast() ? "submit" : "next");
    });

    // Campo que acompanha outro (ex.: o perfil de templates acompanha o modo da IA) até o autor mexer nele
    this.element.addEventListener("change", (e) => {
      const input = e.target.closest("[data-field-id]");
      if (!input) return;
      const id = input.dataset.fieldId;
      if (this.followers.has(id)) {
        this.touched.add(id);
        return;
      }
      for (const field of this.steps.flatMap((s) => s.fields)) {
        if (field.follows?.field !== id || this.touched.has(field.id)) continue;
        const next = field.follows.map?.[input.value];
        if (!next) continue;
        this.values[field.id] = next;
        const target = this.element.querySelector(`[data-field-id="${field.id}"]`);
        if (target) target.value = next;
      }
    });

    // Remove o aviso de erro assim que o usuário volta a digitar
    this.element.addEventListener("input", (e) => {
      const field = e.target.closest(".wizard-field");
      if (field) this.setFieldError(field, false);
    });

    // Respostas do controller (sem replay: ignora eventos de wizards anteriores)
    this.listen("wizard:completed", ({ wizardId }) => {
      if (wizardId === this.config.wizardId) this.close();
    });
    this.listen("wizard:failed", ({ wizardId, error }) => {
      if (wizardId !== this.config.wizardId) return;
      this.setBusy(false);
      this.showError(error);
    });
  }

  /**
   * Registra um ouvinte no uiBus (sem replay) guardando a referência para remoção posterior.
   * @param {string} event - Nome do evento.
   * @param {Function} callback - Função executada ao receber o evento.
   * @returns {void}
   * @private
   */
  listen(event, callback) {
    this.uiBus.on(event, callback, false);
    this.busListeners.push([event, callback]);
  }

  /**
   * Indica se o passo atual é o último.
   * @returns {boolean}
   */
  isLast() {
    return this.index === this.steps.length - 1;
  }

  /**
   * Executa a ação de um botão do wizard.
   * @param {"cancel"|"back"|"next"|"skip"|"submit"} action - Ação solicitada.
   * @returns {void}
   * @private
   */
  handleAction(action) {
    this.collectValues();

    switch (action) {
      case "cancel":
        this.close();
        break;
      case "back":
        this.goTo(this.index - 1);
        break;
      case "next":
        if (this.validateStep(this.index)) this.goTo(this.index + 1);
        break;
      case "skip":
      case "submit":
        this.submit();
        break;
    }
  }

  /**
   * Lê os valores dos campos exibidos e os guarda nas respostas.
   * @returns {void}
   * @private
   */
  collectValues() {
    // Campos de eventos: o que ainda está digitado também entra
    this.eventInputs?.forEach(({ input, hidden }) => {
      hidden.value = input.getTags().join(", ");
    });
    this.element.querySelectorAll("[data-field-id]").forEach((input) => {
      this.values[input.dataset.fieldId] = input.value;
    });
  }

  /**
   * Navega para outro passo, redesenhando o formulário com as respostas guardadas.
   * @param {number} index - Índice do passo de destino.
   * @returns {void}
   * @private
   */
  goTo(index) {
    if (index < 0 || index >= this.steps.length) return;
    this.index = index;
    this.render().then(() => {
      this.mountEventFields();
      this.focusFirstField();
    });
  }

  /**
   * Valida os campos obrigatórios de um passo, destacando os vazios quando ele é o passo exibido.
   * @param {number} index - Índice do passo.
   * @returns {boolean} Verdadeiro se todos os obrigatórios estão preenchidos.
   * @private
   */
  validateStep(index) {
    const missing = this.steps[index].fields.filter(
      (field) => field.required && !String(this.values[field.id] ?? "").trim(),
    );

    if (index === this.index) {
      this.element.querySelectorAll(".wizard-field").forEach((fieldEl) => {
        const isMissing = missing.some((f) => f.id === fieldEl.dataset.field);
        this.setFieldError(fieldEl, isMissing);
      });
      if (missing.length > 0) this.focusField(missing[0].id);
    }

    return missing.length === 0;
  }

  /**
   * Valida todos os passos e, estando tudo certo, emite `wizard:submit`.
   * Se faltar um obrigatório em outro passo, volta até ele.
   * @returns {void}
   * @private
   */
  submit() {
    for (let i = 0; i < this.steps.length; i++) {
      if (!this.validateStep(i)) {
        if (i !== this.index) {
          this.goTo(i);
          this.validateStep(i);
        }
        return;
      }
    }

    this.setBusy(true);
    this.uiBus.emit("wizard:submit", {
      wizardId: this.config.wizardId,
      kind: this.config.kind,
      context: this.config.context || {},
      values: { ...this.values },
    });
  }

  /**
   * Alterna o estado "processando": desabilita os botões enquanto o controller trabalha.
   * @param {boolean} busy - Se está processando.
   * @returns {void}
   * @private
   */
  setBusy(busy) {
    this.busy = busy;
    this.showError("");
    this.element?.querySelectorAll(".wizard-footer button").forEach((btn) => {
      btn.disabled = busy;
    });
  }

  /**
   * Exibe (ou oculta, com texto vazio) a mensagem de erro geral do wizard.
   * @param {string} message - Texto do erro.
   * @returns {void}
   * @private
   */
  showError(message) {
    const el = this.element?.querySelector(".wizard-error");
    if (!el) return;
    el.textContent = message || "";
    el.hidden = !message;
  }

  /**
   * Marca ou desmarca o aviso de campo obrigatório.
   * @param {HTMLElement} fieldEl - Elemento `.wizard-field`.
   * @param {boolean} hasError - Se o campo está inválido.
   * @returns {void}
   * @private
   */
  setFieldError(fieldEl, hasError) {
    fieldEl.classList.toggle("invalid", hasError);
    const message = fieldEl.querySelector(".wizard-field-error");
    if (message) message.hidden = !hasError;
  }

  /**
   * Foca o primeiro campo do passo atual.
   * @returns {void}
   * @private
   */
  focusFirstField() {
    this.element?.querySelector("[data-field-id]:not([disabled])")?.focus();
  }

  /**
   * Foca um campo pelo id.
   * @param {string} fieldId - Id do campo.
   * @returns {void}
   * @private
   */
  focusField(fieldId) {
    [...this.element.querySelectorAll("[data-field-id]")]
      .find((input) => input.dataset.fieldId === fieldId)
      ?.focus();
  }

  /**
   * Fecha o modal que contém o wizard (a limpeza ocorre no `onClose` do modal).
   * @returns {void}
   */
  close() {
    if (this.config.modal && !this.destroyed) this.config.modal.close();
    else this.destroy();
  }

  /**
   * Remove os ouvintes do barramento. Seguro para chamar mais de uma vez.
   * @returns {void}
   */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.busListeners.forEach(([event, callback]) =>
      this.uiBus.off(event, callback),
    );
    this.busListeners = [];
  }
}
