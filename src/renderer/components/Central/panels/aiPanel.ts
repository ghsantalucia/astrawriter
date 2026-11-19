// @ts-nocheck
/**
 * @file Central de IA: modelo ativo, fallback de modelos, relatório de uso, depuração do que é enviado e recebido (com as
 * tools usadas), skills do livro e configuração da análise do livro.
 */

import { AI_PROVIDERS, getProviderInfo } from "../../../ai/providers/index.js";
import { getUsageReport } from "../../../ai/usageTracker.js";
import { MAX_RECENT, clearExchanges, ensureDebugLoaded, isPinned, listExchanges, listPinned, loadPinned, pinExchange, subscribeExchanges, unpinExchange } from "../../../ai/debugLog.js";
import { builtinSkillNames, listSkills } from "../../../ai/skills/index.js";
import { PROFILES, PROFILE_OPTIONS, detectProfile, resolveAnalysis, toSaved } from "../../../ai/profiles.js";
import { confirmModal, esc, mount, plural, shortDate, switchRow } from "./panelKit.js";

/**
 * Lista de modelos de um provedor (da API, se já carregada; senão o catálogo padrão).
 * @param {Object} state - Estado global.
 * @param {string} provider - Provedor.
 * @returns {Array<{id: string, label: string}>}
 */
function modelsOf(state, provider) {
  return state.aiModels?.[provider] || getProviderInfo(provider)?.models || [];
}

/**
 * Número formatado em pt-BR.
 * @param {number} n - Número.
 * @returns {string}
 */
const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");

/** Alfinete em SVG: só o contorno quando não está fixado; o CSS (`.cn-pin.on`) preenche quando está. */
const PIN_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 14v7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

/**
 * Página "Central de IA".
 * @class
 */
export class AiPanel {
  /**
   * @param {Object} ctx - Contexto da central.
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.title = "Central de IA";
    this.usageDays = 7;
    this.unsubscribe = null;
    /** Skill em edição na aba de skills (null: formulário em branco). */
    this.editingSkill = null;
    this.editingKey = null;
    // Contas alteradas (aqui ou nas Configurações): a página se atualiza
    ctx.uiBus.on("ai-accounts:changed", () => {
      if (this.ctx.isOpen?.("ai")) this.ctx.refresh();
    });
  }

  /** @returns {Object} Estado global. */
  get state() {
    return this.ctx.state;
  }

  /** @returns {Object} AiService. */
  get ai() {
    return this.ctx.services.ai;
  }

  /**
   * Abas laterais.
   * @returns {Array<Object>}
   */
  getTabs() {
    return [
      { id: "model", label: "Contas e modelo", icon: "fa-robot" },
      { id: "fallback", label: "Fallback de contas", icon: "fa-shuffle" },
      { id: "usage", label: "Uso por modelo", icon: "fa-chart-column" },
      { id: "analysis", label: "Perfil e análises", icon: "fa-gauge-high" },
      { separator: true },
      { id: "debug", label: "Depuração", icon: "fa-bug" },
      { id: "errors", label: "Log de erros", icon: "fa-triangle-exclamation" },
      { id: "skills", label: "Skills", icon: "fa-wand-magic-sparkles" },
    ];
  }

  /**
   * Subtítulo e texto de apoio.
   * @param {string} tab - Aba.
   * @returns {{subtitle: string, lead: string}}
   */
  getHeader(tab) {
    const titles = {
      model: ["Contas e modelo de IA", "Cadastre quantas contas quiser (várias Gemini, várias Claude...), cada uma com a sua chave e um apelido. A conta ativa e o modelo valem para o chat e as análises; as chaves nunca são exibidas por inteiro."],
      fallback: ["Fallback de contas", "Se a conta ativa ficar sem cota ou o serviço estiver instável, o app tenta a próxima da lista automaticamente."],
      errors: ["Log de erros da IA", "Erros retornados pela IA, do mais recente para o mais antigo (sem chaves de API). O arquivo é limitado: os registros mais antigos são descartados."],
      usage: ["Uso por modelo", "Requisições e tokens contados pelo app neste computador (a API nem sempre informa a cota restante)."],
      analysis: ["Perfil de uso e análises", "Escolha quanto a IA trabalha (e gasta tokens) neste app, como nas configurações de qualidade de um jogo. Mexer em qualquer opção muda o perfil para Personalizado."],
      debug: ["Depuração", "Os últimos 10 turnos de conversa com a IA: o texto completo enviado (instruções do sistema, histórico e mensagem), a resposta, as tools usadas e os tokens. Use o alfinete para salvar um turno importante; a chave de API nunca aparece aqui."],
      skills: ["Skills", "Pacotes de instruções que a IA carrega sob demanda. Crie as suas para este livro."],
    };
    const [subtitle, lead] = titles[tab] || ["", ""];
    return { subtitle, lead };
  }

  /**
   * Desenha a aba.
   * @param {string} tab - Aba.
   * @param {HTMLElement} el - Contêiner.
   * @returns {Promise<void>}
   */
  async render(tab, el) {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (tab === "model") return this.renderModel(el);
    if (tab === "fallback") return this.renderFallback(el);
    if (tab === "usage") return this.renderUsage(el);
    if (tab === "analysis") return this.renderAnalysis(el);
    if (tab === "debug") return this.renderDebug(el);
    if (tab === "skills") return this.renderSkills(el);
    if (tab === "errors") return this.renderErrors(el);
  }

  /**
   * Ao fechar a central.
   * @returns {void}
   */
  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  // ========== Contas e modelo ========== //

  /**
   * Contas de IA: lista (ativa, apelido, provedor, modelo, chave mascarada) e formulário de nova conta.
   * @param {HTMLElement} el - Contêiner.
   * @returns {void}
   * @private
   */
  renderModel(el) {
    const accounts = this.ai.accounts();
    const activeId = this.state.aiSettings.activeAccount;
    const options = (list, current) =>
      list.map((m) => `<option value="${esc(m.id)}" ${m.id === current ? "selected" : ""}>${esc(m.label || m.id)}</option>`).join("");
    const mask = (key) => (key ? `••••${esc(key.slice(-4))}` : "");
    const ctxWindow = this.ai.getContextWindow();

    const toolModeLabels = { auto: "Automático", native: "Nativas", simulated: "Simuladas" };
    const extras = (a, info) => {
      if (!info?.toolModes && !info?.editableUrl) return "";
      const url = info.editableUrl
        ? `<label class="cn-inline"><span>Endereço</span><input class="cn-input" value="${esc(a.baseUrl || info.defaultUrl || "")}" data-change="baseurl" data-id="${esc(a.id)}" placeholder="endereço do servidor" title="Endereço do servidor" style="min-width:260px" /></label>`
        : "";
      const mode = info.toolModes
        ? `<label class="cn-inline" title="Como a IA usa as tools neste modelo. Automático: tenta o modo nativo e, se o modelo recusar, simula."><span>Tools</span><select class="cn-select" data-change="toolmode" data-id="${esc(a.id)}">${Object.entries(toolModeLabels).map(([v, t]) => `<option value="${v}" ${(a.toolMode || "auto") === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>`
        : "";
      const ctx = info.id === "ollama"
        ? `<label class="cn-inline" title="Contexto (tokens) pedido ao Ollama. O padrão dele (4096) é pequeno para este app."><span>Contexto</span><input class="cn-input" type="number" min="2048" step="1024" value="${esc(a.numCtx || info.defaultContext)}" data-change="numctx" data-id="${esc(a.id)}" style="width:100px" /></label>`
        : "";
      return `${mode}${ctx}${url}`;
    };
    const modelCell = (a, info) => {
      const list = modelsOf(this.state, a.provider);
      const field = list.length
        ? `<select class="cn-select" data-change="model" data-id="${esc(a.id)}" style="max-width:210px">${options(list, a.model || info?.defaultModel)}</select>`
        : `<input class="cn-input" value="${esc(a.model || "")}" data-change="model" data-id="${esc(a.id)}" placeholder="nome do modelo" style="max-width:210px" />`;
      return `<div class="cn-nowrap">${field}${info?.id !== "mock" ? `<button class="cn-btn small ghost" data-act="refresh-models" data-id="${esc(a.id)}" title="Atualizar a lista de modelos"><i class="fa-solid fa-rotate"></i></button>` : ""}</div>`;
    };

    const rows = accounts
      .map((a) => {
        const info = getProviderInfo(a.provider);
        const keyOk = Boolean(a.apiKey) || !info?.requiresKey;
        const sub = extras(a, info);
        return `<tr data-id="${esc(a.id)}" class="${sub ? "has-sub" : ""}">
          <td><input type="radio" name="active-account" value="${esc(a.id)}" ${a.id === activeId ? "checked" : ""} data-change="activate" title="Usar esta conta" /></td>
          <td><input class="cn-input" value="${esc(a.nickname)}" data-change="nick" data-id="${esc(a.id)}" maxlength="40" style="width:150px" /></td>
          <td>${esc(info?.label || a.provider)}</td>
          <td>${modelCell(a, info)}</td>
          <td><div class="cn-keycell">${keyOk ? `<span class="cn-pill success">${info?.requiresKey ? mask(a.apiKey) : "sem chave"}</span>` : '<span class="cn-pill error">sem chave</span>'}
            ${info?.requiresKey || info?.editableUrl ? `<button class="cn-btn small ghost" data-act="key" data-id="${esc(a.id)}">${a.apiKey ? "Trocar chave" : "Definir chave"}</button>` : ""}</div></td>
          <td style="text-align:right"><button class="cn-btn small ghost" data-act="remove" data-id="${esc(a.id)}" title="Remover conta"><i class="fa-regular fa-trash-can"></i></button></td>
        </tr>${sub ? `<tr class="cn-sub" data-id="${esc(a.id)}"><td></td><td colspan="5"><div class="cn-inline-row">${sub}</div></td></tr>` : ""}`;
      })
      .join("");

    const root = mount(
      el,
      `<section class="cn-section">
         <h4>Contas de IA</h4>
         ${
           accounts.length
             ? `<table class="cn-table cn-accounts"><thead><tr><th style="width:36px">Ativa</th><th>Apelido</th><th>Provedor</th><th>Modelo</th><th>Chave de API</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
             : '<p class="cn-hint">Nenhuma conta. Adicione uma abaixo.</p>'
         }
         ${ctxWindow ? `<p class="cn-hint">Janela de contexto do modelo ativo: <strong>${fmt(ctxWindow)}</strong> tokens.</p>` : ""}
         <div id="key-editor" class="cn-row" hidden>
           <input class="cn-input" id="key-input" type="password" autocomplete="off" spellcheck="false" placeholder="Cole a chave de API" style="min-width:320px" />
           <button class="cn-btn primary small" data-act="key-save">Salvar chave</button>
           <button class="cn-btn small ghost" data-act="key-cancel">Cancelar</button>
         </div>
       </section>
       <section class="cn-section">
         <h4>Adicionar conta</h4>
         <div class="cn-row">
           <label class="cn-field"><span>Provedor</span>
             <select class="cn-select" id="new-provider" data-change="new-provider">${AI_PROVIDERS.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join("")}</select></label>
           <label class="cn-field"><span>Apelido</span>
             <input class="cn-input" id="new-nick" maxlength="40" placeholder="Ex.: Gemini pessoal" /></label>
           <label class="cn-field" style="min-width:260px"><span>Chave de API</span>
             <input class="cn-input" id="new-key" type="password" autocomplete="off" spellcheck="false" placeholder="Cole a chave" /></label>
           <label class="cn-field"><span>Modelo</span>
             <input class="cn-input" id="new-model" list="new-model-list" style="min-width:200px" value="${esc(AI_PROVIDERS[0].defaultModel)}" />
             <datalist id="new-model-list">${AI_PROVIDERS[0].models.map((m) => `<option value="${esc(m.id)}">${esc(m.label)}</option>`).join("")}</datalist></label>
           <label class="cn-field" id="new-url-field" hidden style="min-width:260px"><span>Endereço do servidor</span>
             <input class="cn-input" id="new-url" spellcheck="false" /></label>
         </div>
         <p class="cn-hint" id="new-hint">${esc(AI_PROVIDERS[0].hint || "")}</p>
         <div class="cn-row"><button class="cn-btn primary" data-act="add"><i class="fa-solid fa-plus"></i> Adicionar conta</button></div>
       </section>`,
      {
        activate: async (input) => {
          await this.ai.selectAccount(input.value);
        },
        nick: async (input) => {
          const account = accounts.find((a) => a.id === input.dataset.id);
          if (account) await this.ai.saveAccount({ id: account.id, provider: account.provider, nickname: input.value });
        },
        model: async (select) => {
          const account = accounts.find((a) => a.id === select.dataset.id);
          if (account) await this.ai.saveAccount({ id: account.id, provider: account.provider, nickname: account.nickname, model: select.value });
        },
        "new-provider": (select) => {
          const info = getProviderInfo(select.value);
          const list = modelsOf(this.state, select.value);
          root.querySelector("#new-model").value = info?.defaultModel || "";
          root.querySelector("#new-model-list").innerHTML = list.map((m) => `<option value="${esc(m.id)}">${esc(m.label || m.id)}</option>`).join("");
          root.querySelector("#new-key").disabled = !info?.requiresKey && !info?.editableUrl;
          root.querySelector("#new-key").placeholder = info?.requiresKey ? "Cole a chave" : "Chave (opcional)";
          root.querySelector("#new-url-field").hidden = !info?.editableUrl;
          root.querySelector("#new-url").value = info?.defaultUrl || "";
          root.querySelector("#new-hint").textContent = info?.hint || "";
        },
        baseurl: async (input) => {
          const account = accounts.find((a) => a.id === input.dataset.id);
          if (account) await this.ai.saveAccount({ id: account.id, provider: account.provider, nickname: account.nickname, baseUrl: input.value });
        },
        toolmode: async (select) => {
          const account = accounts.find((a) => a.id === select.dataset.id);
          if (account) await this.ai.saveAccount({ id: account.id, provider: account.provider, nickname: account.nickname, toolMode: select.value });
        },
        numctx: async (input) => {
          const account = accounts.find((a) => a.id === input.dataset.id);
          if (account) await this.ai.saveAccount({ id: account.id, provider: account.provider, nickname: account.nickname, numCtx: input.value });
        },
        "refresh-models": async (btn) => {
          const account = accounts.find((a) => a.id === btn.dataset.id);
          if (!account) return;
          try {
            const models = await this.ai.listModels(account.provider, account.id);
            this.ctx.toast(models ? `${plural(models.length, "modelo encontrado", "modelos encontrados")}.` : "Nenhum modelo encontrado (confira a chave e o endereço).", models ? "success" : "info");
            if (models && !account.model) await this.ai.saveAccount({ id: account.id, provider: account.provider, nickname: account.nickname, model: models[0].id });
            this.ctx.refresh();
          } catch (error) {
            this.ctx.toast(error.message, "error");
          }
        },
        key: (btn) => {
          this.editingKey = btn.dataset.id;
          const box = root.querySelector("#key-editor");
          box.hidden = false;
          root.querySelector("#key-input").value = "";
          root.querySelector("#key-input").focus();
        },
        "key-cancel": () => {
          root.querySelector("#key-editor").hidden = true;
        },
        "key-save": async () => {
          const account = accounts.find((a) => a.id === this.editingKey);
          const value = root.querySelector("#key-input").value.trim();
          if (!account || !value) return this.ctx.toast("Cole a chave de API.", "error");
          await this.ai.saveAccount({ id: account.id, provider: account.provider, nickname: account.nickname, apiKey: value });
          this.ai.listModels(account.provider, account.id).catch(() => null);
          this.ctx.toast("Chave salva.", "success");
        },
        add: async () => {
          const provider = root.querySelector("#new-provider").value;
          const info = getProviderInfo(provider);
          const apiKey = root.querySelector("#new-key").value.trim();
          if (info?.requiresKey && !apiKey) return this.ctx.toast("Cole a chave de API da conta.", "error");
          try {
            const id = await this.ai.saveAccount({
              provider,
              nickname: root.querySelector("#new-nick").value,
              apiKey,
              model: root.querySelector("#new-model").value.trim(),
              baseUrl: info?.editableUrl ? root.querySelector("#new-url").value : undefined,
              numCtx: info?.defaultContext,
              activate: accounts.length === 0,
            });
            // Sem modelo informado (ex.: Ollama): usa o primeiro da lista que o servidor devolver
            this.ai
              .listModels(provider, id)
              .then(async (models) => {
                const saved = this.ai.accounts().find((x) => x.id === id);
                if (models?.length && saved && !saved.model) {
                  await this.ai.saveAccount({ id, provider, nickname: saved.nickname, model: models[0].id });
                }
              })
              .catch(() => null);
            this.ctx.toast("Conta adicionada.", "success");
          } catch (error) {
            this.ctx.toast(error.message, "error");
          }
        },
        remove: (btn) => {
          const account = accounts.find((a) => a.id === btn.dataset.id);
          if (!account) return;
          confirmModal(this.ctx.uiBus, {
            title: "Remover a conta?",
            danger: true,
            confirmText: "Remover",
            html: `<p>A conta <strong>${esc(account.nickname)}</strong> e a chave dela serão apagadas deste computador.</p>`,
            onConfirm: () => this.ai.removeAccount(account.id),
          });
        },
      },
    );
  }

  // ========== Fallback ========== //

  /**
   * Lista de fallback (contas, na ordem de tentativa).
   * @param {HTMLElement} el - Contêiner.
   * @returns {void}
   * @private
   */
  renderFallback(el) {
    const fb = this.state.aiSettings.fallback || { enabled: false, chain: [] };
    const accounts = this.ai.accounts();
    const chain = (fb.chain || []).filter((c) => c.accountId && accounts.some((a) => a.id === c.accountId));
    const active = this.ai.activeAccount();
    const save = async (next) => {
      const ok = await this.ai.saveExtraSettings({ fallback: next });
      if (!ok) this.ctx.toast("Não foi possível salvar.", "error");
    };
    const nameOf = (id) => accounts.find((a) => a.id === id);

    const rows = chain
      .map((item, i) => {
        const account = nameOf(item.accountId);
        return `<tr>
          <td>${i + 1}º</td>
          <td><strong>${esc(account.nickname)}</strong></td>
          <td>${esc(getProviderInfo(account.provider)?.label || account.provider)}</td>
          <td>${esc(item.model || account.model)}</td>
          <td style="text-align:right">
            <button class="cn-btn small ghost" data-act="up" data-i="${i}" ${i === 0 ? "disabled" : ""} title="Subir"><i class="fa-solid fa-arrow-up"></i></button>
            <button class="cn-btn small ghost" data-act="remove" data-i="${i}" title="Remover"><i class="fa-solid fa-xmark"></i></button>
          </td></tr>`;
      })
      .join("");
    const candidates = accounts.filter((a) => !chain.some((c) => c.accountId === a.id) && a.id !== active?.id);

    const root = mount(
      el,
      `<section class="cn-section">
         ${switchRow({ id: "fb-enabled", attrs: 'data-change="toggle"', checked: fb.enabled, title: "Usar fallback automático", hint: "Troca de conta sozinho quando a ativa não puder responder." })}
         <p class="cn-hint">Conta ativa: <strong>${esc(active?.nickname || "—")}</strong>. Quando ela recusa por limite de uso ou o serviço está indisponível, a mesma mensagem é reenviada à primeira conta da lista, depois à seguinte. Só acontece se nenhuma alteração em arquivos já tiver sido feita naquela resposta. Cada troca fica no changelog com o autor "Sistema".</p>
         ${chain.length ? `<table class="cn-table"><thead><tr><th>Ordem</th><th>Conta</th><th>Provedor</th><th>Modelo</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="cn-hint">Nenhuma conta na lista de fallback.</p>'}
       </section>
       <section class="cn-section">
         <h4>Adicionar à lista</h4>
         ${
           candidates.length
             ? `<div class="cn-row">
                 <select class="cn-select" id="fb-account">${candidates.map((a) => `<option value="${esc(a.id)}">${esc(a.nickname)} · ${esc(a.model)}</option>`).join("")}</select>
                 <button class="cn-btn" data-act="add"><i class="fa-solid fa-plus"></i> Adicionar</button>
               </div>`
             : '<p class="cn-hint">Não há outras contas para adicionar. Cadastre mais contas na aba "Contas e modelo".</p>'
         }
       </section>`,
      {
        toggle: (input) => save({ enabled: input.checked, chain }),
        add: () => save({ enabled: fb.enabled, chain: [...chain, { accountId: root.querySelector("#fb-account").value }] }),
        remove: (btn) => save({ enabled: fb.enabled, chain: chain.filter((_, i) => i !== Number(btn.dataset.i)) }),
        up: (btn) => {
          const i = Number(btn.dataset.i);
          const next = [...chain];
          [next[i - 1], next[i]] = [next[i], next[i - 1]];
          save({ enabled: fb.enabled, chain: next });
        },
      },
    );
  }

  // ========== Log de erros ========== //

  /**
   * Log de erros retornados pela IA.
   * @param {HTMLElement} el - Contêiner.
   * @returns {Promise<void>}
   * @private
   */
  async renderErrors(el) {
    const raw = (await window.electronAPI.readAiErrorLog()) || [];
    const rows = raw
      .map(
        (e) => `<details class="cn-log-item">
          <summary><span class="cn-pill error">${esc(e.status || "erro")}</span> <strong>${esc(e.provider || "")}</strong> ${esc(e.model || "")}
            <small> · ${shortDate(e.ts)}</small></summary>
          <p class="cn-hint" style="margin-top:6px">${esc(e.message)}</p>
          ${e.details ? `<pre class="cn-code">${esc(typeof e.details === "string" ? e.details : JSON.stringify(e.details, null, 1))}</pre>` : ""}
        </details>`,
      )
      .join("");
    mount(
      el,
      `<div class="cn-row"><button class="cn-btn small" data-act="clear" ${raw.length ? "" : "disabled"}><i class="fa-regular fa-trash-can"></i> Limpar log</button>
         <span class="cn-hint">${plural(raw.length, "registro", "registros")}.</span></div>
       ${raw.length ? `<div class="cn-log">${rows}</div>` : '<div class="cn-empty">Nenhum erro registrado.</div>'}`,
      {
        clear: () =>
          confirmModal(this.ctx.uiBus, {
            title: "Limpar o log de erros da IA?",
            danger: true,
            confirmText: "Limpar log",
            html: `<p>Todos os <strong>${raw.length}</strong> registros serão apagados. Esta ação não pode ser desfeita.</p>`,
            onConfirm: async () => {
              await window.electronAPI.clearAiErrorLog();
              this.ctx.refresh();
            },
          }),
      },
    );
  }

  // ========== Uso ========== //

  /**
   * Relatório de uso.
   * @param {HTMLElement} el - Contêiner.
   * @returns {void}
   * @private
   */
  renderUsage(el) {
    const report = getUsageReport(this.usageDays);
    const session = this.state.aiUsage || {};
    const total = report.reduce((s, r) => ({ requests: s.requests + r.requests, input: s.input + r.input, output: s.output + r.output }), { requests: 0, input: 0, output: 0 });
    const max = Math.max(1, ...report.map((r) => r.input + r.output));
    const periods = [[1, "Hoje"], [7, "7 dias"], [30, "30 dias"]]
      .map(([d, label]) => `<button class="rv-chip ${this.usageDays === d ? "active" : ""}" data-act="period" data-days="${d}">${label}</button>`)
      .join("");

    mount(
      el,
      `<div class="rv-chips">${periods}</div>
       <div class="cn-stats">
         <div class="cn-stat"><strong>${fmt(total.requests)}</strong><span>requisições</span></div>
         <div class="cn-stat"><strong>${fmt(total.input)}</strong><span>tokens enviados</span></div>
         <div class="cn-stat"><strong>${fmt(total.output)}</strong><span>tokens recebidos</span></div>
         <div class="cn-stat"><strong>${fmt(session.inputTokens + session.outputTokens)}</strong><span>tokens na sessão do chat</span></div>
       </div>
       <section class="cn-section">
         <h4>Por modelo</h4>
         ${
           report.length === 0
             ? '<p class="cn-hint">Nenhum uso registrado neste período.</p>'
             : `<table class="cn-table"><thead><tr><th>Modelo</th><th>Requisições</th><th>Enviados</th><th>Recebidos</th><th style="width:22%"></th></tr></thead><tbody>
                ${report
                  .map(
                    (r) => `<tr><td><strong>${esc(r.model)}</strong><br><small>${esc(getProviderInfo(r.provider)?.label || r.provider)}</small></td>
                      <td>${fmt(r.requests)}</td><td>${fmt(r.input)}</td><td>${fmt(r.output)}</td>
                      <td><div class="cn-bar"><span style="width:${Math.round(((r.input + r.output) / max) * 100)}%"></span></div></td></tr>`,
                  )
                  .join("")}</tbody></table>`
         }
       </section>
       <p class="cn-hint">O app guarda os últimos 30 dias neste computador. Os valores são uma contagem local, não a fatura do provedor.</p>`,
      {
        period: (btn) => {
          this.usageDays = Number(btn.dataset.days);
          this.ctx.refresh();
        },
      },
    );
  }

  // ========== Análise do livro ========== //

  /**
   * Configuração da análise.
   * @param {HTMLElement} el - Contêiner.
   * @returns {Promise<void>}
   * @private
   */
  async renderAnalysis(el) {
    const analysis = this.ctx.services.analysis;
    const digests = this.state.currentBookPath ? (await analysis.allDigests()).length : 0;
    const pending = this.state.currentBookPath ? await analysis.pending() : null;

    const draw = () => {
      const values = resolveAnalysis(this.state.aiSettings?.analysis);
      const current = values.profile;
      const profile = PROFILES.find((p) => p.id === current);
      const groups = [...new Set(PROFILE_OPTIONS.map((o) => o.group))];

      // "Apenas conversa" bloqueia todas as outras opções (sem tools, nada mais faz sentido)
      const lockedBy = (o) => Boolean(values.chatOnly) && o.id !== "chatOnly";
      const control = (o) =>
        o.type === "bool"
          ? switchRow({ attrs: `data-change="opt" data-opt="${o.id}"`, checked: Boolean(values[o.id]), title: esc(o.label), hint: esc(o.hint), disabled: lockedBy(o) })
          : `<label class="cn-switch-row ${lockedBy(o) ? "disabled" : ""}"><span class="cn-switch-text"><strong>${esc(o.label)}</strong><small>${esc(o.hint)}</small></span>
              <select class="cn-select" data-change="opt" data-opt="${o.id}" ${lockedBy(o) ? "disabled" : ""}>${o.choices.map((c) => `<option value="${c.value}" ${c.value === values[o.id] ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select></label>`;

      const root = mount(
        el,
        `<section class="cn-section">
           <h4>Perfil de uso</h4>
           <div class="cn-profiles" role="radiogroup">
             ${PROFILES.map((p) => `<button class="cn-profile ${p.id === current ? "active" : ""}" data-act="profile" data-id="${p.id}" role="radio" aria-checked="${p.id === current}">${esc(p.label)}</button>`).join("")}
             <span class="cn-profile custom ${current === "custom" ? "active" : ""}" title="Aparece quando você muda uma opção manualmente">Personalizado</span>
           </div>
           <p class="cn-hint">${current === "custom" ? "Você ajustou as opções manualmente. Escolha um perfil para voltar a um conjunto pronto." : esc(profile.description)}</p>
           ${pending && this.ctx.services.analysis.settings().onSync ? `<p class="cn-hint">Neste livro: ${plural(pending.files.length, "arquivo pendente de análise", "arquivos pendentes de análise")} (≈ ${fmt(pending.tokens)} tokens), ${plural(digests, "arquivo já analisado", "arquivos já analisados")}.</p>` : ""}
         </section>
         ${groups
           .map((g) => `<section class="cn-section"><h4>${esc(g)}</h4>${PROFILE_OPTIONS.filter((o) => o.group === g).map(control).join("")}</section>`)
           .join("")}
         <section class="cn-section">
           <h4>Como o app economiza tokens</h4>
           <ul class="cn-hint" style="margin:0;padding-left:18px;line-height:1.7">
             <li>Cada arquivo é lido pela IA <strong>uma única vez</strong>; só é reanalisado se o conteúdo mudar (hash) ou se você ligar algo que o resumo ainda não tem.</li>
             <li>A IA guarda um <strong>digest</strong> (resumo, fatos, eventos) em <code>.system/digests/</code>; consultas e conferências usam o digest, não o capítulo.</li>
             <li>Erros de links, ortografia, palavras repetidas e a ordem da linha do tempo são achados <strong>sem IA</strong>; contradições também, e só os casos duvidosos são verificados, com citações curtas.</li>
             <li>O esboço e a análise de cada capítulo não entram na análise: só o manuscrito, as fichas e as anotações.</li>
           </ul>
         </section>`,
        {
          profile: async (btn) => {
            const chosen = PROFILES.find((p) => p.id === btn.dataset.id);
            if (!chosen) return;
            await this.ai.saveExtraSettings({ analysis: toSaved(chosen.id, chosen.values) });
          },
          opt: async (input) => {
            const next = { ...resolveAnalysis(this.state.aiSettings?.analysis) };
            const option = PROFILE_OPTIONS.find((o) => o.id === input.dataset.opt);
            if (!option) return;
            const numeric = typeof option.choices?.[0]?.value === "number";
            next[option.id] = option.type === "bool" ? input.checked : numeric ? Number(input.value) : input.value;
            delete next.profile;
            // Se as opções coincidem com um perfil, ele é o escolhido; senão vira "Personalizado"
            await this.ai.saveExtraSettings({ analysis: toSaved(detectProfile(next), next) });
          },
        },
      );
      return root;
    };
    draw();
  }

  // ========== Depuração ========== //

  /**
   * Depuração: os 10 últimos turnos do chat (e as chamadas em segundo plano), com o texto completo enviado, as tools
   * usadas e os tokens. Um turno pode ser fixado com o alfinete (fica salvo no livro); desafixar pede confirmação.
   * @param {HTMLElement} el - Contêiner.
   * @returns {Promise<void>}
   * @private
   */
  async renderDebug(el) {
    const bookPath = this.state.currentBookPath;
    await Promise.all([loadPinned(bookPath), ensureDebugLoaded(bookPath)]);
    const KIND = { chat: "Chat", digest: "Resumo de arquivo", verify: "Verificação de contradições" };
    const block = (title, text) =>
      `<h4 style="margin:10px 0 4px;font-size:.8rem">${title}</h4><pre class="cn-code" style="max-height:340px;overflow:auto">${esc(text)}</pre>`;
    const duration = (ms) => (ms ? (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`) : "");

    const item = (x, saved) => {
      const tokens = x.usage ? `${fmt(x.usage.input)} enviados · ${fmt(x.usage.output)} recebidos` : "tokens não informados";
      const pinned = saved || isPinned(x.uid);
      return `<details class="cn-log-item" data-id="${esc(x.uid)}" ${this.openDebug.has(x.uid) ? "open" : ""}>
        <summary>
          <span class="cn-pill ${x.status === "error" ? "error" : x.status === "ok" ? "success" : "warning"}">${x.status === "running" ? "em andamento" : x.status === "ok" ? "ok" : "erro"}</span>
          <strong>${esc(KIND[x.kind] || x.kind)}</strong> · ${esc(getProviderInfo(x.provider)?.label || x.provider)} · ${esc(x.model)}
          ${x.fallbackFrom ? `<span class="cn-pill warning">fallback de ${esc(x.fallbackFrom)}</span>` : ""}
          <small> · ${shortDate(x.startedAt)} · ${tokens}${x.tools.length ? ` · ${plural(x.tools.length, "tool", "tools")}` : ""}</small>
          <button class="cn-pin ${pinned ? "on" : ""}" data-act="${pinned ? "unpin" : "pin"}" data-uid="${esc(x.uid)}" aria-pressed="${pinned}" aria-label="${pinned ? "Desafixar turno" : "Fixar turno"}" title="${pinned ? "Fixado: clique para desafixar (o registro salvo será apagado)" : "Fixar este turno (salva o registro no livro)"}">${PIN_SVG}</button>
        </summary>
        <ul class="cn-hint" style="margin:6px 0 0;padding-left:18px">
          <li>Modelo: <strong>${esc(x.model)}</strong> (${esc(getProviderInfo(x.provider)?.label || x.provider)}) · início ${shortDate(x.startedAt)}${x.durationMs ? ` · duração ${duration(x.durationMs)}` : ""}</li>
          <li>Tokens: ${fmt(x.usage?.input)} enviados, ${fmt(x.usage?.output)} recebidos · ${plural(x.usage?.requests || 1, "rodada", "rodadas")} (chamadas ao modelo) nesta interação</li>
          <li>Tools oferecidas: ${fmt(x.toolsOffered)} · usadas: ${x.tools.length ? esc([...new Set(x.tools.map((t) => t.name))].join(", ")) : "nenhuma"}</li>
          <li>Instruções do sistema: ${fmt(x.systemChars)} caracteres · histórico: ${plural(x.historyMessages || 0, "mensagem", "mensagens")}</li>
        </ul>
        ${block("Instruções do sistema (prompt padrão enviado)", x.system || "(não registrado)")}
        ${x.history?.length ? block(`Histórico enviado (${x.history.length})`, x.history.map((m) => `[${m.role}]\n${m.content}`).join("\n\n---\n\n")) : ""}
        ${block("Mensagem do usuário", x.prompt)}
        ${x.tools.length ? `<h4 style="margin:10px 0 4px;font-size:.8rem">Tools usadas (${x.tools.length})</h4>${x.tools.map((t, i) => `<pre class="cn-code" style="max-height:220px;overflow:auto"><strong>${i + 1}. ${esc(t.name)}</strong>${t.isError ? " (erro)" : ""}\n${esc(t.args)}\n→ ${esc(t.output)}</pre>`).join("")}` : ""}
        ${block(x.error ? "Erro" : "Resposta da IA", x.error || x.response || "(sem texto)")}
      </details>`;
    };

    const draw = () => {
      this.openDebug = new Set([...el.querySelectorAll("details[open]")].map((d) => d.dataset.id));
      const all = listExchanges();
      const chat = all.filter((x) => x.kind === "chat");
      const background = all.filter((x) => x.kind !== "chat");
      const saved = listPinned();
      const section = (title, hint, list, isSaved) =>
        `<section class="cn-section"><h4>${title}</h4>${hint ? `<p class="cn-hint">${hint}</p>` : ""}${
          list.length ? `<div class="cn-log">${list.map((x) => item(x, isSaved)).join("")}</div>` : '<div class="cn-empty">Nada por aqui.</div>'
        }</section>`;
      const tab = this.debugTab === "pinned" ? "pinned" : "recent";
      const tabs = `<div class="rv-chips" role="tablist">
        <button class="rv-chip ${tab === "recent" ? "active" : ""}" role="tab" aria-selected="${tab === "recent"}" data-act="debug-tab" data-tab="recent">Recentes <b>${all.length}</b></button>
        <button class="rv-chip ${tab === "pinned" ? "active" : ""}" role="tab" aria-selected="${tab === "pinned"}" data-act="debug-tab" data-tab="pinned">Fixados <b>${saved.length}</b></button>
      </div>`;
      const body =
        tab === "pinned"
          ? section("Turnos fixados", bookPath ? "Salvos em .system/debug do livro. Não somem ao fechar o app." : "Abra um livro para fixar turnos.", saved, true)
          : `<div class="cn-row"><button class="cn-btn small" data-act="clear" ${all.length ? "" : "disabled"}><i class="fa-regular fa-trash-can"></i> Limpar recentes</button>
               <span class="cn-hint">Só os ${MAX_RECENT} turnos mais recentes são mantidos (salvos no livro, sobrevivem ao reiniciar o app).</span></div>
             ${section(`Turnos recentes do chat (${chat.length}/${MAX_RECENT})`, "", chat, false)}
             ${background.length ? section(`Análises em segundo plano (${background.length}/${MAX_RECENT})`, "Resumos de arquivos e verificações de contradições.", background, false) : ""}`;

      mount(
        el,
        tabs + body,
        {
          "debug-tab": (btn) => {
            this.debugTab = btn.dataset.tab;
            draw();
          },
          clear: () => clearExchanges(),
          pin: async (btn, event) => {
            event.preventDefault();
            if (!bookPath) return this.ctx.toast("Abra um livro para fixar turnos.", "info");
            await pinExchange(btn.dataset.uid, bookPath);
            this.ctx.toast("Turno fixado.", "success");
          },
          unpin: (btn, event) => {
            event.preventDefault();
            confirmModal(this.ctx.uiBus, {
              title: "Desafixar este turno?",
              danger: true,
              confirmText: "Desafixar e apagar",
              html: "<p>O registro salvo deste turno será <strong>apagado</strong> e não poderá ser recuperado. Se ele ainda estiver entre os 10 mais recentes, continua visível até sair da lista.</p>",
              onConfirm: () => unpinExchange(btn.dataset.uid, bookPath),
            });
          },
        },
      );
    };
    this.openDebug = new Set();
    this.debugTab = this.debugTab || "recent";
    draw();
    this.unsubscribe = subscribeExchanges(draw);
  }

  // ========== Skills ========== //

  /**
   * Skills do app e do livro, com o formulário de criação/edição.
   * @param {HTMLElement} el - Contêiner.
   * @returns {Promise<void>}
   * @private
   */
  async renderSkills(el) {
    const skillsService = this.ctx.services.skills;
    const custom = this.state.currentBookPath ? await skillsService.list() : [];
    const editing = this.editingSkill && custom.find((s) => s.name === this.editingSkill);
    const builtin = builtinSkillNames();

    const root = mount(
      el,
      `<section class="cn-section">
         <h4>Skills do app</h4>
         ${listSkills().filter((s) => builtin.includes(s.name)).map((s) => `<p class="cn-hint"><strong>${esc(s.name)}</strong> — ${esc(s.description)}</p>`).join("") || '<p class="cn-hint">Nenhuma.</p>'}
       </section>
       <section class="cn-section">
         <h4>Skills deste livro</h4>
         ${
           custom.length === 0
             ? '<p class="cn-hint">Você ainda não criou nenhuma. Skills ficam em <code>.system/skills/</code> dentro do livro.</p>'
             : `<table class="cn-table"><tbody>${custom
                 .map(
                   (s) => `<tr><td><strong>${esc(s.name)}</strong><br><small>${esc(s.description)}</small></td>
                     <td style="text-align:right"><button class="cn-btn small" data-act="edit" data-name="${esc(s.name)}"><i class="fa-solid fa-pen"></i> Editar</button>
                     <button class="cn-btn small ghost" data-act="delete" data-name="${esc(s.name)}"><i class="fa-regular fa-trash-can"></i></button></td></tr>`,
                 )
                 .join("")}</tbody></table>`
         }
       </section>
       <section class="cn-section">
         <h4>${editing ? `Editar "${esc(editing.name)}"` : "Criar uma skill"}</h4>
         <label class="cn-field"><span>Nome (minúsculas e hífens)</span>
           <input class="cn-input" id="sk-name" value="${esc(editing?.name || "")}" ${editing ? "readonly" : ""} placeholder="revisar-dialogos" /></label>
         <label class="cn-field"><span>Quando a IA deve usar (aparece no prompt de sistema)</span>
           <input class="cn-input" id="sk-desc" value="${esc(editing?.description || "")}" placeholder="Ao revisar diálogos de um capítulo" /></label>
         <label class="cn-field"><span>Instruções (a IA só lê quando carregar a skill)</span>
           <textarea class="cn-textarea" id="sk-body" placeholder="Passo a passo que a IA deve seguir...">${esc(editing?.body || "")}</textarea></label>
         <div class="cn-row">
           <button class="cn-btn primary" data-act="save"><i class="fa-solid fa-check"></i> ${editing ? "Salvar alterações" : "Criar skill"}</button>
           ${editing ? '<button class="cn-btn ghost" data-act="cancel">Cancelar edição</button>' : ""}
         </div>
       </section>`,
      {
        edit: (btn) => {
          this.editingSkill = btn.dataset.name;
          this.ctx.refresh();
        },
        cancel: () => {
          this.editingSkill = null;
          this.ctx.refresh();
        },
        delete: (btn) =>
          confirmModal(this.ctx.uiBus, {
            title: "Excluir a skill?",
            danger: true,
            confirmText: "Excluir",
            html: `<p>A skill <strong>${esc(btn.dataset.name)}</strong> será apagada deste livro.</p>`,
            onConfirm: async () => {
              await skillsService.remove(btn.dataset.name);
              this.editingSkill = null;
              this.ctx.refresh();
            },
          }),
        save: async () => {
          try {
            await skillsService.save({
              name: root.querySelector("#sk-name").value,
              description: root.querySelector("#sk-desc").value,
              body: root.querySelector("#sk-body").value,
            });
            this.editingSkill = null;
            this.ctx.toast("Skill salva. A IA já pode usá-la.", "success");
            this.ctx.refresh();
          } catch (error) {
            this.ctx.toast(error.message, "error");
          }
        },
      },
    );
  }
}
