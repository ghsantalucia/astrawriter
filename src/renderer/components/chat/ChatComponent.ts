/**
 * @file Componente responsável pela renderização estrutural do chat do assistente de IA
 */

import { t, intlLocale } from "../../../shared/i18n.js";
import { appSettings } from "../../utils/appSettings.js";
import { playPing } from "../../utils/sounds.js";
import { isAppLink, openAppLink } from "../../utils/appLinks.js";
import "./styles.css";
import templateHtml from "./templates/main.hbs?raw";
import { initStarryBackground, setStarsPalette } from "./animations.js";
import { Component } from "../Component.js";
import { gsap } from "gsap";
import { renderChatMarkdown } from "../../utils/chatMarkdown.js";
import { isInternalHref } from "../Editor/editorTools.js";
import { formatDuration } from "../../ai/apiError.js";
import { mountNebula } from "./nebula.js";
import { mountOrbits, ORBIT_PRESETS } from "./orbits.js";
import {
  getChatBackground,
  getExtraColors,
  hasSavedColor,
} from "../../utils/chatBackground.js";
import {
  QUICK_REPLY_EVENT,
  isAllowedChatEvent,
} from "../../utils/chatActions.js";

import messageTpl from "./templates/message.hbs?raw";
import dateDividerTpl from "./templates/dateDivider.hbs?raw";
import startMarkerTpl from "./templates/startMarker.hbs?raw";

/**
 * Representa o chat do assistente de IA.
 * @class
 */
export class ChatComponent extends Component {
  declare aiBusy: any;
  declare bg: any;
  declare bgKey: any;
  declare currentOffset: any;
  declare defaultPlaceholder: any;
  declare domainBus: any;
  declare hasMoreHistory: any;
  declare inputNav: any;
  declare isLoadingHistory: any;
  declare lastUsage: any;
  declare scrollTimer: any;
  declare sendIconHtml: any;
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

    // Controle da paginação e scroll infinito
    this.currentOffset = 0;
    this.isLoadingHistory = false;
    this.hasMoreHistory = true;
  }

  onInit() {
    initStarryBackground();
    this.applyChatBackground(document.body.classList.contains("dark-theme"));
    this.setupAutoResizeAndInputListeners();
    this.setupScrollListener();
  }

  /**
   * Configura os ouvintes de eventos específicos do chat.
   * @returns {void}
   */
  setupListeners() {
    // Fundo do chat: estrelas no tema escuro, nebulosa animada no claro
    this.uiBus.on("theme:changed", ({ theme }) => {
      this.applyChatBackground(theme === "dark");
    });
    // Abre a gaveta do chat (ex.: Central de Revisões pedindo à IA para corrigir)
    this.uiBus.on("chat:open", () => {
      const drawer = document.getElementById("chat-container");
      if (drawer && !drawer.classList.contains("expanded"))
        this.toggleAiDrawer();
    });

    // Esc com o foco no chat: fecha a gaveta e devolve a navegação por setas ao explorer
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const drawer = document.getElementById("chat-container");
      if (!drawer?.classList.contains("expanded")) return;
      if (!(e.target as Element).closest?.("#chat-container")) return;
      if (document.querySelector("#modal-container:not(.hidden)")) return;
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.();
      this.toggleAiDrawer();
      this.uiBus.emit("explorer:keyboard-restore");
    });

    // Preferência de fundo alterada nas configurações
    this.uiBus.on("chat-bg:apply", () => {
      this.applyChatBackground(document.body.classList.contains("dark-theme"));
    });
    // Cores extras alteradas na Central do Sistema: reconstrói o fundo com a nova paleta
    this.uiBus.on("chat-bg:rebuild", () => {
      this.bgKey = null;
      this.applyChatBackground(document.body.classList.contains("dark-theme"));
    });

    // Alterna visibilidade da gaveta
    this.uiBus.on("ai-chat:toggle", () => {
      this.toggleAiDrawer();
    });

    // Renderiza uma mensagem no chat (chamado pelo chatHandler/uiController)
    this.uiBus.on("chat:render-message", (msgData) => {
      this.renderChatMessage(msgData);
      // Resposta da IA com a gaveta recolhida: bolinha no cabeçalho e um som suave
      if (msgData?.role === "assistant" && !document.getElementById("chat-container")?.classList.contains("expanded") && appSettings.get("chat.notify")) {
        const dot = document.getElementById("ai-unread-dot");
        if (dot) dot.hidden = false;
        playPing();
      }
    });

    // Controla o estado de carregamento/bloqueio do input
    this.uiBus.on("chat:set-loading", (isLoading) => {
      this.setChatLoadingState(isLoading);
    });

    // Renderiza histórico inicial do chat
    this.uiBus.on("chat:render-history", (data) => {
      this.clearChatContainer();

      const messages = Array.isArray(data) ? data : data?.messages || [];
      const hasMore = Array.isArray(data) ? true : Boolean(data?.hasMore);

      // Atualiza o offset com o valor retornado ou reseta para 0
      this.currentOffset = data?.offsetUsed ?? 0;

      this.renderChatHistory(messages, hasMore);
      this.scrollToBottom();
    });

    // Adiciona histórico mais antigo ao chat (Infinite Scroll)
    this.uiBus.on("chat:append-history", (data) => {
      const messages = Array.isArray(data) ? data : data?.messages || [];
      const hasMore = Array.isArray(data) ? true : Boolean(data?.hasMore);

      this.renderChatHistory(messages, hasMore);
    });

    // Atualiza a faixa de consumo de tokens
    this.domainBus.on("ai:usage-updated", (usage) => {
      this.lastUsage = usage;
      this.updateUsageBar(usage);
    });

    // A contagem regressiva de um limite atingido é atualizada a cada 30 s
    setInterval(() => {
      if (this.lastUsage?.limit?.kind === "blocked") {
        this.updateUsageBar(this.lastUsage);
      }
    }, 30_000);

    // A IA começou a editar arquivos: ajusta o texto do indicador
    this.domainBus.on("ai:edit-started", () => {
      this.setWorkingLabel(t("A IA está editando arquivos…"));
    });

    // Links no chat nunca navegam a janela do app (mesmo comportamento do editor: web no navegador padrão, arquivos do
    // livro no editor); respostas prontas só podem ser usadas uma vez
    document
      .getElementById("ai-chat-messages")
      ?.addEventListener("click", (e) => {
        const link = (e.target as Element).closest("a");
        if (link) {
          e.preventDefault();
          this.openChatLink(link.getAttribute("href"));
        }

        const replyBtn = (e.target as Element).closest(".chat-button.reply");
        if (replyBtn) {
          replyBtn.closest(".chat-buttons")?.classList.add("answered");
          replyBtn.classList.add("chosen");
        }
      });

    // Limpa a caixa de mensagens
    this.uiBus.on("chat:clear", () => {
      this.clearChatContainer();
      this.currentOffset = 0;
      this.isLoadingHistory = false;
      this.hasMoreHistory = true;
    });
  }

  /**
   * Define o fundo do chat conforme o tema e a preferência do usuário (estrelas, nebulosa, órbitas ou cor sólida).
   * @param {boolean} isDark - Se o tema atual é o escuro.
   * @returns {void}
   */
  applyChatBackground(isDark) {
    const body = document.getElementById("ai-body-container");
    const stars = document.getElementById("ai-bg-canvas");
    if (!body || !stars) return;

    const theme = isDark ? "dark" : "light";
    const { mode, color } = getChatBackground(theme);
    setStarsPalette(getExtraColors(theme, "stars"));

    // Mesmo tipo e tema: só a cor mudou (não reconstrói a animação)
    if (this.bgKey === `${theme}:${mode}` && this.bg) {
      this.bg.setColor?.(color);
      return;
    }
    this.bg?.destroy();
    this.bg = null;
    this.bgKey = `${theme}:${mode}`;

    stars.style.display = mode === "stars" ? "" : "none";
    // Estrelas sem cor escolhida: vale o degradê padrão do tema
    if (mode === "stars" && !hasSavedColor(theme, "stars")) return;

    const expanded = document
      .getElementById("chat-container")
      ?.classList.contains("expanded");
    try {
      if (mode === "solid" || mode === "stars") {
        body.style.backgroundImage = "none";
        body.style.backgroundColor = color;
        this.bg = {
          setColor: (c) => (body.style.backgroundColor = c),
          pause() {},
          resume() {},
          destroy() {
            body.style.backgroundColor = "";
            body.style.backgroundImage = "";
          },
        };
      } else if (mode === "orbits") {
        const orbits = mountOrbits(body, {
          ...ORBIT_PRESETS[theme],
          ...getExtraColors(theme, "orbits"),
          background: color,
        });
        this.bg = { ...orbits, setColor: (c) => orbits.setBackground(c) };
      } else {
        const nebula = mountNebula(body, { colors: getExtraColors(theme, "nebula") });
        this.bg = { ...nebula, setColor: () => nebula.setColors(getExtraColors(theme, "nebula")) };
      }
      // Gaveta recolhida: a animação fica pausada
      if (!expanded) this.bg.pause();
    } catch (error) {
      console.error("[ChatComponent] Fundo indisponível:", error);
    }
  }

  /**
   * Alterna o estado da gaveta (Drawer) com fade-in no canvas.
   * @returns {void}
   */
  toggleAiDrawer() {
    const aiDrawer = document.getElementById("chat-container");
    const canvas = document.getElementById("ai-bg-canvas");
    if (!aiDrawer) return;

    const isOpening = !aiDrawer.classList.contains("expanded");
    aiDrawer.classList.toggle("expanded");
    // Abriu a gaveta: a resposta nova foi vista
    if (isOpening) {
      const dot = document.getElementById("ai-unread-dot");
      if (dot) dot.hidden = true;
    }
    if (isOpening) this.bg?.resume();
    else this.bg?.pause();

    if (isOpening) {
      if (canvas) gsap.set(canvas, { opacity: 0 });

      if (typeof window.resetStarsPosition === "function") {
        setTimeout(window.resetStarsPosition, 50);
        setTimeout(window.resetStarsPosition, 350);
      }

      if (canvas) {
        gsap.to(canvas, {
          opacity: 1,
          duration: 0.5,
          ease: "power2.out",
          delay: 0.1,
        });
      }

      const textarea = document.getElementById("ai-chat-input");
      if (textarea) textarea.focus();
      this.scrollToBottom();
    } else if (canvas) {
      gsap.to(canvas, {
        opacity: 0,
        duration: 0.2,
      });
    }
  }

  /**
   * Rola o chat para o final, garantindo que a última mensagem esteja visível.
   * @returns {void}
   */
  scrollToBottom() {
    const drawer = document.getElementById("chat-container");
    const chatMessages = document.getElementById("ai-chat-messages");

    if (!drawer || !chatMessages) return;

    if (drawer.classList.contains("expanded")) {
      // requestAnimationFrame / setTimeout garante que o DOM já calculou
      // a altura final das mensagens antes de rolar até ao fundo
      requestAnimationFrame(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      });
    }
  }

  /**
   * Renderiza uma mensagem individual no DOM do chat.
   * @param {Object} msgData
   * @returns {void}
   */
  renderChatMessage(msgData) {
    const chatContainer = document.getElementById("ai-chat-messages");
    if (!chatContainer) return;

    const messageElement = this.createMessageElement(msgData);
    const indicator = chatContainer.querySelector("#ai-working-indicator");
    chatContainer.insertBefore(messageElement, indicator);
    this.scrollToBottom();
  }

  /**
   * Renderiza um lote de mensagens do histórico no topo do container de chat com divisores de data.
   * Mantém a ancoragem do scroll para evitar loops e pulos na tela.
   *
   * @param {Array<{role: string, content: string, timestamp?: string}>} msgData - Lista de mensagens retornada pelo histórico.
   * @param {boolean} [hasMore=true] - Indica se ainda existem lotes mais antigos.
   * @returns {void}
   */
  renderChatHistory(msgData, hasMore = true) {
    this.hasMoreHistory = hasMore;

    const chatContainer = document.getElementById("ai-chat-messages");
    if (!chatContainer) {
      this.isLoadingHistory = false;
      return;
    }

    const fragment = document.createDocumentFragment();

    // 1. Se chegou ao fim do histórico, insere o indicador no topo
    if (!hasMore) {
      const existingStart = chatContainer.querySelector(".start-of-chat");
      if (existingStart) existingStart.remove();

      fragment.appendChild(this.createStartOfChatElement());
    }

    // 2. Se houver mensagens, insere com os divisores de data
    let currentDateStr = null;
    if (Array.isArray(msgData) && msgData.length > 0) {
      // Pega o divisor de data atual do topo para evitar duplicatas
      const firstExistingChild = chatContainer.firstElementChild;
      let topExistingDate = null;
      if (
        firstExistingChild &&
        firstExistingChild.classList.contains("chat-date-divider")
      ) {
        topExistingDate = firstExistingChild.getAttribute("data-date");
      }

      msgData.forEach((msg) => {
        const msgDateStr = this.formatDateLabel(msg.timestamp);

        if (msgDateStr && msgDateStr !== currentDateStr) {
          currentDateStr = msgDateStr;
          fragment.appendChild(this.createDateDividerElement(currentDateStr));
        }

        const messageElement = this.createMessageElement(msg);
        fragment.appendChild(messageElement);
      });

      // Deduplicação de data
      if (
        currentDateStr &&
        currentDateStr === topExistingDate &&
        firstExistingChild
      ) {
        firstExistingChild.remove();
      }
    }

    // 3. Salva a altura antes de anexar para a ancoragem do scroll
    const previousScrollHeight = chatContainer.scrollHeight;

    // 4. Injeta tudo no DOM
    chatContainer.prepend(fragment);

    // 5. Ancoragem de scroll
    if (this.currentOffset > 0) {
      const newScrollHeight = chatContainer.scrollHeight;
      chatContainer.scrollTop = newScrollHeight - previousScrollHeight;
    }

    this.isLoadingHistory = false;
  }

  /**
   * Limpa o container de mensagens da interface.
   * @returns {void}
   */
  clearChatContainer() {
    const chatContainer = document.getElementById("ai-chat-messages");
    if (chatContainer) {
      chatContainer.innerHTML = "";
    }
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
      this.scrollTimer = null;
    }
  }

  /**
   * Define o estado visual de carregamento do chat (bloqueando ou liberando a digitação).
   * @param {boolean} isLoading - Indica se o assistente está processando a requisição.
   * @returns {void}
   */
  setChatLoadingState(isLoading) {
    const textarea = document.getElementById("ai-chat-input") as HTMLTextAreaElement;
    const btnSend = document.getElementById("btn-send-ai") as HTMLButtonElement;

    if (textarea) {
      textarea.disabled = isLoading;
      if (isLoading) {
        this.defaultPlaceholder ??= textarea.placeholder;
        textarea.placeholder = t("A IA está trabalhando…");
      } else if (this.defaultPlaceholder) {
        textarea.placeholder = this.defaultPlaceholder;
      }
      if (
        !isLoading &&
        document.getElementById("chat-container").classList.contains("expanded")
      ) {
        textarea.focus();
      }
    }

    if (btnSend) {
      // Enquanto a IA trabalha, o botão de enviar vira o de parar (interrompe a resposta)
      this.aiBusy = Boolean(isLoading);
      btnSend.classList.toggle("stop", this.aiBusy);
      btnSend.title = this.aiBusy ? t("Parar a IA") : t("Enviar mensagem");
      btnSend.setAttribute("aria-label", btnSend.title);
      this.sendIconHtml ??= btnSend.innerHTML;
      btnSend.innerHTML = this.aiBusy
        ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>'
        : this.sendIconHtml;
      btnSend.disabled = false;
      btnSend.style.opacity = "1";
      btnSend.style.pointerEvents = "auto";
    }

    // Gaveta recolhida + IA trabalhando: a estrela do cabeçalho vira os três pontinhos animados
    document
      .getElementById("chat-container")
      ?.classList.toggle("ai-busy", Boolean(isLoading));

    // Brilho animado na borda do campo de entrada enquanto a IA trabalha
    document
      .querySelector(".ai-input-wrapper")
      ?.classList.toggle("working", Boolean(isLoading));

    this.toggleWorkingIndicator(isLoading);
  }

  /**
   * Mostra/remove o indicador "A IA está trabalhando…" ao final das mensagens.
   * @param {boolean} show
   * @returns {void}
   */
  toggleWorkingIndicator(show) {
    const chatContainer = document.getElementById("ai-chat-messages");
    if (!chatContainer) return;

    chatContainer.querySelector("#ai-working-indicator")?.remove();
    if (!show) return;

    const indicator = this.createDOMElement(
      `<div class="ai-message assistant ai-working" id="ai-working-indicator">
        <span class="ai-working-dots"><i></i><i></i><i></i></span>
        <span class="ai-working-label">${t("A IA está trabalhando…")}</span>
      </div>`,
    );
    chatContainer.appendChild(indicator);
    this.scrollToBottom();
  }

  /**
   * Altera o texto do indicador de trabalho, se ele estiver visível.
   * @param {string} label
   * @returns {void}
   */
  setWorkingLabel(label) {
    const el = document.querySelector(
      "#ai-working-indicator .ai-working-label",
    );
    if (el) el.textContent = label;
  }

  /**
   * Abre um link de uma mensagem do chat: links da web e e-mails no navegador padrão; links internos (.md do livro) no
   * editor, como no texto do editor.
   * @param {string|null} href - Endereço do link.
   * @returns {Promise<void>}
   * @private
   */
  async openChatLink(href) {
    if (!href || href.startsWith("#")) return;
    if (isAppLink(href)) {
      openAppLink(href, this.uiBus);
      return;
    }

    if (!isInternalHref(href)) {
      const url = /^[a-z][a-z0-9+.-]*:/i.test(href) ? href : `https://${href}`;
      window.electronAPI.openExternal(url);
      return;
    }

    const bookPath = (this.state.currentBookPath || "")
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
    if (!bookPath) return;
    let clean = href.split(/[?#]/)[0];
    try {
      clean = decodeURIComponent(clean);
    } catch {
      // mantém como veio
    }
    const rel = clean.replace(/^[/\\]+/, "").replace(/\\/g, "/");
    const path = `${bookPath}/${rel}`;
    const exists =
      (await window.electronAPI.readFile(path)) !== null ||
      (await window.electronAPI.readFile(`${path}.temp`)) !== null;
    if (!exists) {
      this.uiBus.emit("toast:show", {
        message: t("Este arquivo não existe mais."),
        type: "error",
      });
      return;
    }
    this.uiBus.emit("editor:open-file", {
      path,
      relativePath: `${bookPath.split("/").pop()}/${rel}`,
    });
  }

  /**
   * Atualiza a faixa de consumo de tokens da sessão, o uso de contexto e o limite de uso da IA.
   * @param {Object} usage - Dados publicados por `AiService#publishUsage`.
   * @param {number} usage.inputTokens - Tokens de entrada da sessão.
   * @param {number} usage.outputTokens - Tokens de saída da sessão.
   * @param {number} usage.contextTokens - Tokens do contexto na última chamada.
   * @param {number|null} usage.contextWindow - Janela de contexto do modelo.
   * @param {string} [usage.provider] - Provedor ativo.
   * @param {string} [usage.model] - Modelo ativo.
   * @param {Object|null} [usage.limit] - Limite conhecido (restante informado pela API ou bloqueio por cota).
   * @param {{requests: number, input: number, output: number}} [usage.daily] - Uso local de hoje no modelo.
   * @returns {void}
   */
  updateUsageBar(usage) {
    const { inputTokens, outputTokens, contextTokens, contextWindow } = usage;
    const modelLine = document.getElementById("ai-usage-model");
    if (modelLine) {
      modelLine.hidden = !usage.model;
      modelLine.innerHTML = usage.model ? `<strong></strong><span></span>` : "";
      if (usage.model) {
        modelLine.querySelector("strong").textContent = usage.model;
        modelLine.querySelector("span").textContent = [
          ...new Set([usage.account, usage.providerLabel].filter(Boolean)),
        ].join(" · ");
      }
    }
    const text = document.getElementById("ai-usage-text");
    const meter = document.getElementById("ai-usage-meter");
    const fill = document.getElementById("ai-usage-meter-fill");
    const context = document.getElementById("ai-usage-context");
    if (!text || !meter || !fill || !context) return;

    const fmt = (n) =>
      n >= 1_000_000
        ? `${(n / 1_000_000).toFixed(1)}M`
        : n >= 1000
          ? `${(n / 1000).toFixed(1)}k`
          : String(n);

    text.textContent = t("Sessão: {total} tokens (↑{input} ↓{output})", { total: fmt(inputTokens + outputTokens), input: fmt(inputTokens), output: fmt(outputTokens) });
    this.updateLimitLine(usage, fmt);

    if (!contextWindow) {
      meter.hidden = true;
      context.textContent = "";
      return;
    }

    const percent = Math.min(100, (contextTokens / contextWindow) * 100);
    meter.hidden = false;
    fill.style.width = `${percent}%`;
    fill.classList.toggle("warn", percent >= 70);
    fill.classList.toggle("danger", percent >= 90);
    context.textContent = t("Contexto: {percent}% de {window}", { percent: percent.toFixed(percent < 10 ? 1 : 0), window: fmt(contextWindow) });
  }

  /**
   * Preenche a linha de limite de uso abaixo da faixa de tokens:
   *  - limite atingido (cota estourada, com contagem regressiva);
   *  - restante informado pela API (ex.: Claude);
   *  - uso de hoje contado pelo app (a API do Gemini não informa a cota restante).
   * @param {Object} usage - Dados de uso publicados.
   * @param {(n: number) => string} fmt - Formatador de números.
   * @returns {void}
   * @private
   */
  updateLimitLine(usage, fmt) {
    const line = document.getElementById("ai-usage-limit");
    const bar = document.getElementById("ai-usage-bar");
    if (!line || !bar) return;

    const { limit, daily, dailyQuota, model, provider } = usage;
    const active = limit && !(limit.until && limit.until < Date.now());
    let message = "";
    let level = "";
    let tooltip = t(
      "A barra mostra a ocupação da janela de contexto do modelo. A cota restante da conta só é informada por algumas APIs.",
    );

    if (active && limit.kind === "blocked") {
      const period = limit.period === "day" ? t(" (diário)") : limit.period === "minute" ? t(" (por minuto)") : "";
      message = t("⛔ Limite atingido{period} — volta em ~{time}", { period, time: formatDuration(limit.until - Date.now()) });
      level = "blocked";
      tooltip = limit.message || tooltip;
    } else if (active && limit.kind === "remaining") {
      const parts = [];
      if (limit.tokensRemaining !== undefined) {
        parts.push(
          limit.tokensLimit
            ? t("{tokens} de {limit} tokens restantes", { tokens: fmt(limit.tokensRemaining), limit: fmt(limit.tokensLimit) })
            : t("{tokens} tokens restantes", { tokens: fmt(limit.tokensRemaining) }),
        );
      }
      if (limit.requestsRemaining !== undefined) {
        parts.push(
          t("{count} requisições", { count: `${limit.requestsRemaining}${limit.requestsLimit ? `/${limit.requestsLimit}` : ""}` }),
        );
      }
      message = t("Limite da API: {parts}", { parts: parts.join(" · ") });
      const ratio = limit.tokensLimit
        ? limit.tokensRemaining / limit.tokensLimit
        : 1;
      if (ratio < 0.2) level = "low";
      const reset = limit.resetAt ? t(" (renovam em {time})", { time: formatDuration(limit.resetAt - Date.now()) }) : "";
      tooltip = t("Valores informados pela API do {provider} na última resposta{reset}.", { provider, reset });
    } else if (dailyQuota) {
      const used = daily?.requests || 0;
      const left = Math.max(0, dailyQuota - used);
      message = t("Hoje ({model}): {used} de {quota} requisições · restam ~{left}", { model, used, quota: dailyQuota, left });
      if (left / dailyQuota <= 0.2) level = "low";
      tooltip = t(
        "O limite diário de requisições foi informado pela API na última vez que a cota estourou. O uso é contado pelo app neste computador; outros programas que usam a mesma chave também consomem a cota.",
      );
    } else if (daily?.requests > 0) {
      message = t("Hoje ({model}): {requests} requisições · {tokens} tokens · limite ainda desconhecido", { model, requests: daily.requests, tokens: fmt(daily.input + daily.output) });
      tooltip = t(
        "A API do Gemini não informa a cota restante. O app conta o que enviou hoje e passa a mostrar quanto falta assim que descobrir o limite real (a API o informa quando a cota estoura).",
      );
    }

    line.hidden = !message;
    line.textContent = message;
    line.classList.toggle("blocked", level === "blocked");
    line.classList.toggle("low", level === "low");
    bar.title = tooltip;
  }

  /**
   * Captura o texto do input e dispara o evento de envio de mensagem via uiBus.
   * @returns {void}
   */
  triggerSendMessage() {
    const textarea = document.getElementById("ai-chat-input") as HTMLTextAreaElement;
    if (!textarea) return;

    const promptText = textarea.value.trim();
    if (!promptText) return;

    // Enviou: o rascunho guardado pela navegação do histórico (setas) deixa de valer
    this.inputNav = null;

    // Reseta o valor e a altura dinâmica do textarea
    textarea.value = "";
    textarea.style.height = "auto";

    // Emite o evento para a camada de controle tratar
    this.uiBus.emit("chat:send-message", { promptText });
  }

  /**
   * Navega pelas mensagens já enviadas com as setas do teclado (como o histórico de um terminal).
   * Seta para cima na primeira linha do campo traz a última mensagem do usuário (guardando o que estava escrito);
   * seta para baixo na última linha avança e, ao passar da mais recente, devolve o rascunho guardado.
   * @param {KeyboardEvent} e - Evento de teclado.
   * @param {HTMLTextAreaElement} textarea - Campo de texto do chat.
   * @returns {void}
   * @private
   */
  navigateInputHistory(e, textarea) {
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    const { selectionStart, selectionEnd, value } = textarea;
    if (selectionStart !== selectionEnd) return;

    const sent = [
      ...document.querySelectorAll("#ai-chat-messages .ai-message.user"),
    ]
      .map((el) => el.textContent.trim())
      .filter(Boolean);

    if (e.key === "ArrowUp") {
      const onFirstLine = !value.slice(0, selectionStart).includes("\n");
      if (!onFirstLine || sent.length === 0) return;
      const index = this.inputNav ? this.inputNav.index - 1 : sent.length - 1;
      if (index < 0) return;
      e.preventDefault();
      this.inputNav ??= { draft: value, index };
      this.inputNav.index = index;
      this.fillInput(textarea, sent[index]);
    } else if (this.inputNav) {
      const onLastLine = !value.slice(selectionEnd).includes("\n");
      if (!onLastLine) return;
      e.preventDefault();
      const index = this.inputNav.index + 1;
      if (index >= sent.length) {
        const { draft } = this.inputNav;
        this.inputNav = null;
        this.fillInput(textarea, draft);
      } else {
        this.inputNav.index = index;
        this.fillInput(textarea, sent[index]);
      }
    }
  }

  /**
   * Preenche o campo de texto do chat, ajusta a altura e posiciona o cursor (no início enquanto navega pelo
   * histórico, para que a seta continue navegando).
   * @param {HTMLTextAreaElement} textarea - Campo de texto do chat.
   * @param {string} text - Texto a exibir.
   * @returns {void}
   * @private
   */
  fillInput(textarea, text) {
    textarea.value = text;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
    const pos = this.inputNav ? 0 : text.length;
    textarea.setSelectionRange(pos, pos);
  }

  /**
   * Configura os ouvintes de redimensionamento automático e atalhos de teclado para o textarea.
   * @returns {void}
   */
  setupAutoResizeAndInputListeners() {
    const textarea = document.getElementById("ai-chat-input");
    const btnSend = document.getElementById("btn-send-ai");

    if (textarea) {
      textarea.addEventListener("input", () => {
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight}px`;
      });

      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.triggerSendMessage();
          return;
        }
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          this.navigateInputHistory(e, textarea);
        }
      });
    }

    if (btnSend) {
      btnSend.addEventListener("click", (e) => {
        e.preventDefault();
        if (this.aiBusy) {
          this.uiBus.emit("ai:stop");
          return;
        }
        this.triggerSendMessage();
      });
    }
  }

  /**
   * Configura o evento de rolagem para disparar o infinite scroll com delay de 1s.
   * Se o usuário rolar para baixo antes de 1s, a busca é cancelada.
   * @returns {void}
   */
  setupScrollListener() {
    const chatContainer = document.getElementById("ai-chat-messages");
    if (!chatContainer) return;

    // Guarda a referência do timer para cancelamento
    this.scrollTimer = null;

    chatContainer.addEventListener("scroll", () => {
      const isAtTop = chatContainer.scrollTop <= 30;

      if (isAtTop) {
        // Se já está no topo, não está carregando, há mais histórico e ainda não iniciou o timer
        if (
          !this.isLoadingHistory &&
          this.hasMoreHistory &&
          !this.scrollTimer
        ) {
          this.scrollTimer = setTimeout(() => {
            this.isLoadingHistory = true;
            this.currentOffset += 1;
            this.scrollTimer = null;

            // Dispara o evento após manter 1s no topo
            this.uiBus.emit("chat:fetch-more-history", {
              offset: this.currentOffset,
            });
          }, 1000); // Delay de 1 segundo
        }
      } else {
        // Se o usuário rolou para baixo antes de dar 1s, cancela a chamada
        if (this.scrollTimer) {
          clearTimeout(this.scrollTimer);
          this.scrollTimer = null;
        }
      }
    });
  }

  /**
   * Converte o timestamp para uma string formatada de data (DD/MM/YYYY).
   * @param {string|number} timestamp
   * @returns {string}
   */
  formatDateLabel(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "";

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Cria a estrutura DOM de uma mensagem individual renderizada via template Handlebars.
   * @param {Object} msgData - Objeto contendo os dados da mensagem.
   * @param {string} msgData.role - Papel do emissor da mensagem ('user' | 'assistant' | 'system').
   * @param {string} msgData.content - Conteúdo em texto da mensagem.
   * @param {Array<{label: string, event: string, data?: Object}>} [msgData.buttons] - Botões exibidos abaixo da mensagem.
   * @returns {HTMLElement} Elemento DOM do nó da mensagem pronto para injeção.
   */
  createMessageElement({ role, content, buttons, timestamp }) {
    // Horário (só hora e minuto: a data já aparece no divisor do dia); aparece ao passar o mouse
    const date = timestamp ? new Date(timestamp) : null;
    const time = date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString(intlLocale(), { hour: "2-digit", minute: "2-digit" }) : "";
    // Respostas da IA vêm em Markdown; mensagens do usuário continuam texto puro
    const html = this.compile(messageTpl, {
      role,
      content,
      time,
      html: role === "assistant" ? renderChatMarkdown(content) : null,
      buttons: this.prepareButtons(buttons),
    });
    return this.createDOMElement(html);
  }

  /**
   * Prepara os botões de uma mensagem para o template, descartando qualquer evento fora da lista permitida
   * (as mensagens vêm de um log em disco e de uma IA, então nunca emitimos eventos arbitrários).
   * @param {Array<{label: string, event: string, data?: Object}>} [buttons] - Botões da mensagem.
   * @returns {Array<{label: string, event: string, data: Object, isReply: boolean}>}
   * @private
   */
  prepareButtons(buttons) {
    if (!Array.isArray(buttons)) return [];

    return buttons
      .filter((btn) => btn?.label && isAllowedChatEvent(btn.event))
      .map((btn) => ({
        label: btn.label,
        event: btn.event,
        data: btn.data || {},
        isReply: btn.event === QUICK_REPLY_EVENT,
      }));
  }

  /**
   * Cria o elemento visual do divisor de data no chat via template Handlebars.
   * @param {string} dateText - Texto da data formatada a ser exibida (ex: "10/10/2026").
   * @returns {HTMLElement} Elemento DOM do nó do divisor de data pronto para injeção.
   */
  createDateDividerElement(dateText) {
    const html = this.compile(dateDividerTpl, { dateText });
    return this.createDOMElement(html);
  }

  /**
   * Cria o elemento visual indicando o início absoluto do histórico de conversa via template Handlebars.
   * @returns {HTMLElement} Elemento DOM do nó de marcação do início da conversa pronto para injeção.
   */
  createStartOfChatElement() {
    const html = this.compile(startMarkerTpl);
    return this.createDOMElement(html);
  }
}
