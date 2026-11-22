/**
 * @file Componente responsável pela renderização estrutural da drawer de configurações
 */

import "./styles.css";
import templateHtml from "./templates/main.hbs?raw";
import { Component } from "../Component.js";
import { AI_PROVIDERS, getProviderInfo } from "../../ai/providers/index.js";
import {
  getChatBackground,
  modeUsesColor,
  setChatBackgroundColor,
  setChatBackgroundMode,
} from "../../utils/chatBackground.js";

/**
 * Representa a drawer de configurações.
 * @class
 */
export class SettingsComponent extends Component {
  declare element: any;
  declare modelsByProvider: any;
  declare state: any;
  declare uiBus: any;

  /**
   * Cria uma instância da classe
   * @param {string} selector - Seletor CSS do elemento do DOM onde será injetada.
   * @param {Object} context - Objeto de contexto e infraestrutura (state, uiBus, domainBus)
   * @param {Object|Array|null} [params=null] - Parâmetros opcionais dinâmicos para a exigência do componente.
   * @param {Component} [parent=null]
   */
  constructor(selector, context, params, parent = null) {
    super(selector, context, templateHtml, params, parent);

    /** Modelos obtidos da API, por provider (sobrepõem a lista padrão). */
    this.modelsByProvider = {};
  }

  /**
   * Contexto do template: lista de provedores com o ativo marcado.
   * @returns {Object}
   */
  getContext() {
    return {
      providers: AI_PROVIDERS.map((p) => ({
        ...p,
        selected: p.id === this.state.aiProvider,
      })),
    };
  }

  /**
   * Preenche o formulário de IA com o provider ativo e sua chave salva.
   */
  onInit() {
    this.syncAiForm();
    this.syncChatBackgroundForm();
  }

  /**
   * Preenche os seletores de plano de fundo do chat com a preferência salva (e mostra a cor quando o tipo usa cor).
   * @returns {void}
   */
  syncChatBackgroundForm() {
    ["dark", "light"].forEach((theme) => {
      const select = this.element?.querySelector(`#chat-bg-mode-${theme}`);
      const color = this.element?.querySelector(`#chat-bg-color-${theme}`);
      if (!select || !color) return;
      const { mode, color: saved } = getChatBackground(theme);
      select.value = mode;
      color.hidden = !modeUsesColor(mode);
      if (saved) color.value = saved;
    });
  }

  /**
   * Configura os ouvintes de eventos.
   */
  setupListeners() {
    // Abre a drawer
    this.uiBus.on("settings:open", () => {
      this.syncSpellForm();
      this.syncAiForm();
      this.syncChatBackgroundForm();
      this.open();
      this.uiBus.emit("ai-settings:models-requested", {
        provider: this.state.aiProvider,
      });
    });

    // Conta ou modelo alterados: salva na hora (a chave de API fica na Central de IA)
    this.uiBus.on("ai-settings:changed", ({ data }) => {
      const form = this.collectAiForm();
      // Trocou de conta: o modelo vem da própria conta, a menos que o autor tenha escolhido outro agora
      if (data.field === "account") {
        const account = (this.state.aiSettings.accounts || []).find((a) => a.id === form.accountId);
        form.model = account?.model;
      }
      this.uiBus.emit("ai-settings:save-requested", form);
      if (data.field === "account") {
        const account = (this.state.aiSettings.accounts || []).find((a) => a.id === form.accountId);
        if (account) this.uiBus.emit("ai-settings:models-requested", { provider: account.provider, accountId: account.id });
      }
    });

    // Correção ortográfica alterada (aqui ou na Central de Revisões): os controles acompanham
    this.uiBus.on("spellcheck:changed", () => this.syncSpellForm());

    // As contas mudaram (aqui ou na Central de IA): o formulário acompanha
    this.uiBus.on("ai-accounts:changed", () => this.syncAiForm());

    // Lista de modelos vinda da API do provider
    this.uiBus.on("ai-settings:models-loaded", ({ provider, models }) => {
      this.modelsByProvider[provider] = models;
      this.syncAiForm();
    });

    // Plano de fundo do chat (tipo e cor, um para cada tema): salva e pede ao chat para aplicar
    this.uiBus.on("chat-bg:changed", ({ data, value }) => {
      const { theme, field } = data;
      if (field === "mode") {
        setChatBackgroundMode(theme, value);
      } else {
        setChatBackgroundColor(theme, getChatBackground(theme).mode, value);
      }
      this.syncChatBackgroundForm();
      this.uiBus.emit("chat-bg:apply");
    });

    // Fecha a drawer
    this.uiBus.on("settings:close", () => {
      this.close();
    });

    // Sincroniza o estado do switch sempre que o tema mudar (inclusive no init)
    this.uiBus.on("theme:changed", (data) => {
      this.toggleThemeSwitch(data.theme);
    });
  }

  /**
   * Abre a gaveta de configurações.
   */
  open() {
    // Impede abrir as configurações se houver algum modal ativo na tela
    // if (Modal.activeModals.length > 0) return;

    const drawer = document.getElementById("settings-drawer");
    this.element?.classList.add("open");

    // toggleAppOverlay('show');
  }

  /**
   * Fecha a gaveta de configurações.
   */
  close() {
    this.element?.classList.remove("open");

    // Remove a chave 'settings-drawer' da pilha do overlay global
    // toggleAppOverlay('hide');
  }

  /**
   * Lê o formulário de IA.
   * @returns {{accountId: string, model: string}}
   */
  collectAiForm() {
    return {
      accountId: this.element.querySelector("#ai-provider-select").value,
      model: this.element.querySelector("#ai-model-select").value,
    };
  }

  /**
   * Sincroniza o interruptor e o idioma da correção ortográfica com o que está salvo.
   * @returns {void}
   */
  syncSpellForm() {
    const toggle = this.element?.querySelector("#spellcheck-toggle");
    if (toggle) toggle.checked = localStorage.getItem("app_spellcheck_enabled") !== "false";
    const select = this.element?.querySelector("#spell-language-select");
    if (select) select.value = localStorage.getItem("app_spell_language") || "pt-BR";
  }

  /**
   * Preenche o seletor de contas e o de modelos com o que está salvo (conta ativa e o modelo dela).
   * @returns {void}
   */
  syncAiForm() {
    if (!this.element) return;
    const accountSelect = this.element.querySelector("#ai-provider-select");
    const modelSelect = this.element.querySelector("#ai-model-select");
    if (!accountSelect || !modelSelect) return;

    const settings = this.state.aiSettings || {};
    const accounts = settings.accounts || [];
    const active = accounts.find((a) => a.id === settings.activeAccount);

    accountSelect.replaceChildren(
      ...accounts.map((a) => {
        const option = document.createElement("option");
        option.value = a.id;
        const short = getProviderInfo(a.provider)?.label?.replace(/ \(.*\)$/, "") || a.provider;
        option.textContent = a.nickname.toLowerCase() === short.toLowerCase() ? a.nickname : `${a.nickname} (${short})`;
        option.selected = a.id === active?.id;
        return option;
      }),
    );

    const info = getProviderInfo(active?.provider);
    if (!info) return;
    const selectedModel = active.model || info.defaultModel;
    const models = [...(this.modelsByProvider[info.id] || this.state.aiModels?.[info.id] || info.models)];
    // Garante que o modelo salvo apareça mesmo que a lista não o contenha
    if (!models.some((m) => m.id === selectedModel)) models.unshift({ id: selectedModel, label: selectedModel });
    modelSelect.replaceChildren(
      ...models.map((m) => {
        const option = document.createElement("option");
        option.value = m.id;
        option.textContent = m.label;
        option.selected = m.id === selectedModel;
        return option;
      }),
    );
    // Resumo do bloco recolhido: conta · modelo
    setTimeout(() => this.updateAiSummary(), 0);
  }

  /**
   * Altera o estado do switch de alteração do theme
   */
  toggleThemeSwitch(theme) {
    const themeToggle = this.element?.querySelector("#theme-toggle");

    if (themeToggle) {
      themeToggle.checked = theme === "dark";
    }
  }

  /**
   * Atualiza o resumo (provedor · modelo) mostrado quando o formulário de IA está recolhido.
   * @returns {void}
   */
  updateAiSummary() {
    const provider = this.element.querySelector("#ai-provider-select");
    const model = this.element.querySelector("#ai-model-select");
    const summary = this.element.querySelector("#ai-summary-value");
    if (!provider || !model || !summary) return;
    const nickname = provider.selectedOptions[0]?.textContent?.replace(/ \(.*\)$/, "") || "—";
    summary.textContent = `${nickname} · ${model.value || "—"}`;
  }
}
