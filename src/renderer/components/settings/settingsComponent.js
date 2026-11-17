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
    this.syncAiForm(this.state.aiProvider);
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
      this.syncAiForm(this.state.aiProvider);
      this.syncChatBackgroundForm();
      this.open();
      this.uiBus.emit("ai-settings:models-requested", {
        provider: this.state.aiProvider,
      });
    });

    // Qualquer campo de IA alterado (provider, modelo ou chave): salva na hora
    this.uiBus.on("ai-settings:changed", ({ data }) => {
      const field = data.field;

      // Trocou de provider: carrega o modelo/chave salvos dele antes de persistir
      if (field === "provider") {
        this.syncAiForm(
          this.element.querySelector("#ai-provider-select").value,
        );
      }

      const form = this.collectAiForm();
      this.uiBus.emit("ai-settings:save-requested", form);

      // Chave nova: busca os modelos reais disponíveis na conta
      if (field === "key" || field === "provider") {
        this.uiBus.emit("ai-settings:models-requested", {
          provider: form.provider,
        });
      }
    });

    // Lista de modelos vinda da API do provider
    this.uiBus.on("ai-settings:models-loaded", ({ provider, models }) => {
      this.modelsByProvider[provider] = models;
      if (
        this.element.querySelector("#ai-provider-select").value === provider
      ) {
        this.syncAiForm(provider);
      }
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
   * @returns {{provider: string, model: string, apiKey: string}}
   */
  collectAiForm() {
    return {
      provider: this.element.querySelector("#ai-provider-select").value,
      model: this.element.querySelector("#ai-model-select").value,
      apiKey: this.element.querySelector("#ai-api-key").value,
    };
  }

  /**
   * Sincroniza select de modelos e campo de chave com o provider informado,
   * usando o que está salvo (ou o modelo padrão).
   * @param {string} providerId
   */
  syncAiForm(providerId) {
    this.element
      .querySelector("#spell-language-select")
      ?.setAttribute("data-ready", "1");
    if (!this.element) return;

    const info = getProviderInfo(providerId);
    const providerSelect = this.element.querySelector("#ai-provider-select");
    const modelSelect = this.element.querySelector("#ai-model-select");
    const keyInput = this.element.querySelector("#ai-api-key");
    if (!info || !providerSelect || !modelSelect || !keyInput) return;

    const saved = this.state.aiSettings.providers?.[providerId] || {};
    const selectedModel = saved.model || info.defaultModel;
    const models = [...(this.modelsByProvider[providerId] || info.models)];

    // Garante que o modelo salvo apareça mesmo que a lista não o contenha
    if (!models.some((m) => m.id === selectedModel)) {
      models.unshift({ id: selectedModel, label: selectedModel });
    }

    providerSelect.value = providerId;
    // Resumo do bloco recolhido: provedor · modelo
    setTimeout(() => this.updateAiSummary(), 0);
    modelSelect.replaceChildren(
      ...models.map((m) => {
        const option = document.createElement("option");
        option.value = m.id;
        option.textContent = m.label;
        option.selected = m.id === selectedModel;
        return option;
      }),
    );
    keyInput.value = saved.apiKey || "";
    this.element
      .querySelector("#ai-key-group")
      ?.classList.toggle("hidden", !info.requiresKey);
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
    summary.textContent = `${provider.selectedOptions[0]?.textContent || "—"} · ${model.value || "—"}`;
  }
}
