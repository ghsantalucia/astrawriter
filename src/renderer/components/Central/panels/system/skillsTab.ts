// @ts-nocheck
/**
 * @file Aba "Skills" da Central de IA: a biblioteca do usuário ("Minhas skills"), o catálogo ("Mercado", por enquanto
 * offline), a página completa de cada skill (estilo página de plugin) e o formulário de criação e edição. Mostra gatilhos,
 * tools permitidas, estimativa de tokens, execuções e a opção de pedir permissão antes de rodar.
 */

import { TRIGGER_GROUPS, TRIGGERS } from "../../../../services/skillService.js";
import { autoSkillColor } from "../../../../ai/skills/index.js";
import { toolRegistry } from "../../../../ai/aiTools.js";
import { renderChatMarkdown } from "../../../../utils/chatMarkdown.js";
import { appSettings } from "../../../../utils/appSettings.js";
import { confirmModal, esc, mount, plural, switchRow } from "../panelKit.js";

/**
 * Primeira frase de uma descrição (resumo da tool).
 * @param {string} text - Descrição.
 * @returns {string}
 */
const firstSentence = (text) => {
  const sentence = String(text || "").split(/(?<=[.!?])\s/)[0];
  return sentence.length > 110 ? `${sentence.slice(0, 107).trimEnd()}…` : sentence;
};

/**
 * Tabela de tools com caixas de seleção personalizadas (nome, descrição curta e a caixa, bem alinhados).
 * @param {Array<Object>} registry - Definições das tools.
 * @param {string[]} selected - Tools marcadas.
 * @param {string} change - Nome do manipulador `data-change`.
 * @param {boolean} [disabled=false] - Só leitura.
 * @returns {string}
 */
function toolTable(registry, selected, change, disabled = false) {
  const rows = [...registry]
    // As tools marcadas primeiro; depois, ordem alfabética
    .sort((a, b) => Number(selected.includes(b.name)) - Number(selected.includes(a.name)) || a.name.localeCompare(b.name))
    .map(
      (t) => `<label class="cn-tool-row ${selected.includes(t.name) ? "on" : ""}" data-search="${esc(`${t.name} ${t.description}`.toLowerCase())}">
        <input type="checkbox" class="cn-cbx-input" data-change="${change}" data-id="${esc(t.name)}" ${selected.includes(t.name) ? "checked" : ""} ${disabled ? "disabled" : ""} />
        <span class="cn-cbx" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
        <code>${esc(t.name)}</code>
        <small>${esc(firstSentence(t.description))}</small>
      </label>`,
    )
    .join("");
  return `<div class="cn-tool-table"><input class="cn-input cn-tool-filter" data-input="filter-tools" placeholder="Filtrar tools…" />${rows}</div>`;
}

/**
 * Esconde os itens (com `data-search`) que não contêm o texto buscado.
 * @param {HTMLElement} scope - Contêiner dos itens.
 * @param {string} selector - Seletor dos itens.
 * @param {string} query - Texto buscado.
 * @returns {number} Quantos continuam visíveis.
 */
function filterItems(scope, selector, query) {
  const q = query.trim().toLowerCase();
  let shown = 0;
  for (const item of scope.querySelectorAll(selector)) {
    const ok = !q || item.dataset.search.includes(q);
    item.hidden = !ok;
    if (ok) shown++;
  }
  return shown;
}

/**
 * Aba Skills.
 * @class
 */
export class SkillsTab {
  /** @param {Object} ctx - Contexto da central. */
  constructor(ctx) {
    this.ctx = ctx;
    /** "library" | "market" | "detail" | "edit" */
    this.view = "library";
    this.slug = null;
    this.draft = null;
    this.back = "library";
    /** Texto da busca (a mesma barra serve à biblioteca e ao mercado). */
    this.query = "";
  }

  /** @returns {Object} Biblioteca de skills. */
  get skills() {
    return this.ctx.services.skills;
  }

  /**
   * Desenha a aba.
   * @param {HTMLElement} el - Contêiner.
   * @returns {Promise<void>}
   */
  async render(el) {
    await this.skills.ready;
    if (this.view === "detail" && this.skills.get(this.slug)) return this.renderDetail(el);
    if (this.view === "market-detail") return this.renderDetail(el, true);
    if (this.view === "edit") return this.renderForm(el);
    if (this.view === "market") return this.renderMarket(el);
    this.view = "library";
    return this.renderLibrary(el);
  }

  /** Fechou a central. @returns {void} */
  dispose() {}

  // ========== Barra superior ========== //

  /**
   * Chips das duas listas, botão de criar e a opção geral de permissão.
   * @returns {string}
   * @private
   */
  topHtml() {
    const installed = this.skills.installed();
    const ask = this.skills.askAlways();
    const total = this.skills.totalTokens();
    const runs = installed.reduce((n, s) => n + this.skills.runs(s.slug).length, 0);
    const chips = `<div class="rv-chips">
      <button class="rv-chip ${this.view === "library" ? "active" : ""}" data-act="go" data-view="library">Minhas skills <b>${installed.length}</b></button>
      <button class="rv-chip ${this.view === "market" ? "active" : ""}" data-act="go" data-view="market">Mercado <b>${this.skills.market().filter((m) => !m.installed).length}</b></button>
      <button class="cn-btn small primary" data-act="new" style="margin-left:auto"><i class="fa-solid fa-plus"></i> Criar skill</button>
    </div>`;
    const permission = `<div class="cn-setting-list">${switchRow({
      attrs: 'data-change="ask-always"',
      checked: ask.value,
      disabled: ask.forced,
      title: "Todas as skills pedem permissão antes de rodar",
      hint: ask.forced ? "Marcado automaticamente pelo perfil de uso atual (Mínimo ou Econômico). Ao trocar de perfil, volta ao que você tinha escolhido." : "Toda execução mostra uma janela com o que a skill pode fazer e a estimativa de tokens.",
    })}</div>`;
    const search = this.view === "library" || this.view === "market"
      ? `<div class="cn-searchbar"><i class="fa-solid fa-magnifying-glass"></i><input class="cn-input" type="search" data-input="search" value="${esc(this.query)}" placeholder="${this.view === "market" ? "Buscar no mercado…" : "Buscar nas suas skills (nome, descrição, tag)…"}" /></div>`
      : "";
    return `${chips}${search}${permission}<p class="cn-hint">${plural(runs, "execução", "execuções")} no total · ${total.toLocaleString("pt-BR")} tokens usados por skills.</p>`;
  }

  /** @returns {Object} Manipuladores comuns da barra superior. @private */
  topHandlers() {
    return {
      go: (btn) => {
        this.view = btn.dataset.view;
        this.ctx.refresh();
      },
      new: () => {
        this.draft = { title: "", slug: "", description: "", details: "", body: "", kind: "once", tags: [], triggers: [], tools: ["list_files", "read_file"] };
        this.slug = null;
        this.view = "edit";
        this.ctx.refresh();
      },
      search: (input) => {
        this.query = input.value;
        const root = input.closest(".cn-root");
        const shown = filterItems(root, ".cn-skill-card", this.query);
        const none = root.querySelector(".cn-no-results");
        if (none) none.hidden = shown > 0;
      },
      "ask-always": (input) => {
        appSettings.set("skills.askAlways", input.checked);
        this.ctx.refresh();
      },
    };
  }

  // ========== Cartões ========== //

  /**
   * Cartão resumido de uma skill.
   * @param {Object} s - Skill.
   * @param {"library"|"market"} where - Lista onde aparece.
   * @returns {string}
   * @private
   */
  cardHtml(s, where) {
    const runs = where === "library" ? this.skills.runs(s.slug).length : 0;
    // Estado: só as recorrentes ligam e desligam; as de uso único estão sempre disponíveis (rodam quando o autor manda)
    const status =
      where !== "library"
        ? ""
        : s.kind === "recurring"
          ? s.enabled
            ? '<span class="cn-status on"><i class="fa-solid fa-circle"></i> ativa</span>'
            : '<span class="cn-status off"><i class="fa-regular fa-circle"></i> inativa</span>'
          : '<span class="cn-status on"><i class="fa-solid fa-circle"></i> disponível</span>';
    const badges = [
      `<span class="cn-pill">${s.kind === "recurring" ? "recorrente" : "uso único"}</span>`,
      s.origin === "builtin" ? '<span class="cn-pill">do app</span>' : "",
      s.edited ? '<span class="cn-pill warning">editado</span>' : "",
      s.installed ? '<span class="cn-pill success">na biblioteca</span>' : "",
      s.hasUpdate ? '<span class="cn-pill warning">atualização disponível</span>' : "",
    ].join(" ");
    const search = `${s.title} ${s.slug} ${s.description} ${s.author} ${s.tags.join(" ")}`.toLowerCase();
    return `<div class="cn-theme cn-skill-card ${where === "library" && s.kind === "recurring" && !s.enabled ? "inactive" : ""}" style="--skill-color:${esc(s.color || autoSkillColor(s.slug))}" data-act="open" data-slug="${esc(s.slug)}" data-where="${where}" data-search="${esc(search)}" tabindex="0">
      <div class="cn-skill-head"><span class="cn-skill-dot"></span><strong>${esc(s.title)}${s.edited ? ' <small class="cn-edited">(editado)</small>' : ""}</strong>${status}</div>
      <small>${esc(s.author)} · v${esc(s.version)}</small>
      <span>${esc(s.description)}</span>
      <div class="cn-row" style="gap:4px">${badges}${s.tags.map((t) => `<span class="cn-pill">#${esc(t)}</span>`).join(" ")}</div>
      ${where === "library" ? `<small>${plural(runs, "execução", "execuções")}</small>` : ""}
    </div>`;
  }

  /**
   * Manipulador do clique no cartão.
   * @returns {Object}
   * @private
   */
  cardHandlers() {
    return {
      open: (card) => {
        this.slug = card.dataset.slug;
        this.back = card.dataset.where;
        this.view = card.dataset.where === "market" ? "market-detail" : "detail";
        this.ctx.refresh();
      },
    };
  }

  /**
   * Lista "Minhas skills".
   * @param {HTMLElement} el - Contêiner.
   * @returns {void}
   * @private
   */
  renderLibrary(el) {
    const list = this.skills.installed();
    mount(
      el,
      `<section class="cn-section">${this.topHtml()}
         <div class="cn-theme-grid">${list.map((s) => this.cardHtml(s, "library")).join("")}</div>
         <p class="cn-hint cn-no-results" hidden>Nenhuma skill encontrada para essa busca.</p>
       </section>`,
      { ...this.topHandlers(), ...this.cardHandlers() },
    );
    this.applyQuery(el);
  }

  /**
   * Mercado (catálogo offline).
   * @param {HTMLElement} el - Contêiner.
   * @returns {void}
   * @private
   */
  renderMarket(el) {
    const list = this.skills.market();
    mount(
      el,
      `<section class="cn-section">${this.topHtml()}
         <p class="cn-hint">O mercado já funciona offline com as skills que vêm com o app. Em breve, usuários poderão compartilhar skills e personalizações aqui.</p>
         <div class="cn-theme-grid">${list.map((s) => this.cardHtml(s, "market")).join("")}</div>
         <p class="cn-hint cn-no-results" hidden>Nenhuma skill encontrada para essa busca.</p>
       </section>`,
      { ...this.topHandlers(), ...this.cardHandlers() },
    );
    this.applyQuery(el);
  }

  /**
   * Reaplica a busca depois de redesenhar a lista.
   * @param {HTMLElement} el - Contêiner.
   * @returns {void}
   * @private
   */
  applyQuery(el) {
    if (!this.query) return;
    const shown = filterItems(el, ".cn-skill-card", this.query);
    const none = el.querySelector(".cn-no-results");
    if (none) none.hidden = shown > 0;
  }

  // ========== Página completa ========== //

  /**
   * Página de uma skill.
   * @param {HTMLElement} el - Contêiner.
   * @param {boolean} [fromMarket=false] - Aberta pelo mercado (ainda pode não estar na biblioteca).
   * @returns {Promise<void>}
   * @private
   */
  async renderDetail(el, fromMarket = false) {
    const market = this.skills.market().find((m) => m.slug === this.slug);
    const installed = this.skills.get(this.slug);
    const s = installed || market;
    if (!s) {
      this.view = "library";
      return this.render(el);
    }
    const inLibrary = Boolean(installed);
    const runs = this.skills.runs(s.slug);
    const bookTokens = await this.skills.bookTokens();
    const est = this.skills.estimate(s, bookTokens);
    const registry = toolRegistry.getDefinitions();
    const tools = inLibrary ? s.tools : market.tools;
    const triggers = inLibrary ? s.triggers : market.triggers;

    const triggerList = s.kind === "recurring"
      ? `<p class="cn-hint">Roda sozinha nestas ocasiões. ${inLibrary ? "Você pode marcar ou desmarcar:" : ""}</p>
         ${TRIGGER_GROUPS.map((g) => `<details class="cn-trig-group" ${g.triggers.some((t) => triggers.includes(t.id)) ? "open" : ""}><summary>${esc(g.group)}</summary>
           <div class="cn-checks">${g.triggers.map((t) => `<label class="cn-check"><input type="checkbox" data-change="trigger" data-id="${esc(t.id)}" ${triggers.includes(t.id) ? "checked" : ""} ${inLibrary ? "" : "disabled"} /> ${esc(t.label)}</label>`).join("")}</div></details>`).join("")}`
      : '<p class="cn-hint">Uso único: roda só quando você manda executar.</p>';

    const toolList = toolTable(registry, tools, "tool", !inLibrary);

    const runRows = runs.length
      ? `<table class="cn-table"><thead><tr><th>Quando</th><th>Origem</th><th>Resultado</th><th>Tokens</th></tr></thead><tbody>${runs
          .map((r) => `<tr><td>${new Date(r.at).toLocaleString("pt-BR")}</td><td>${esc(TRIGGERS.get(r.trigger)?.label || (r.trigger === "ai" ? "Pedido da IA" : "Manual"))}</td><td>${r.ok ? '<span class="cn-pill success">sucesso</span>' : `<span class="cn-pill error" title="${esc(r.error || "")}">falha</span>`}</td><td>${(r.tokens || 0).toLocaleString("pt-BR")}</td></tr>`)
          .join("")}</tbody></table>`
      : '<p class="cn-hint">Nenhuma execução ainda.</p>';

    const actions = inLibrary
      ? `<button class="cn-btn primary" data-act="run"><i class="fa-solid fa-play"></i> Executar agora</button>
         <button class="cn-btn" data-act="edit"><i class="fa-solid fa-pen"></i> Editar</button>
         ${s.hasEditedCopy ? '<button class="cn-btn ghost" data-act="restore">Restaurar o original</button>' : ""}
         ${market?.hasUpdate ? `<button class="cn-btn" data-act="update">Atualizar para a v${esc(market.version)}</button>` : ""}
         ${s.removable ? '<button class="cn-btn danger" data-act="remove"><i class="fa-regular fa-trash-can"></i> Remover</button>' : ""}`
      : `<button class="cn-btn primary" data-act="install"><i class="fa-solid fa-plus"></i> Incluir na biblioteca</button>
         <button class="cn-btn" data-act="install-run"><i class="fa-solid fa-play"></i> Executar imediatamente</button>`;

    const prefs = inLibrary
      ? `<div class="cn-setting-list">
           ${switchRow({ attrs: 'data-change="ask"', checked: s.askBefore, title: "Pedir permissão antes de ativar", hint: "Marcado por padrão. Desmarcado, a skill roda sozinha quando o gatilho dispara (a opção geral acima ainda vale)." })}
           <div class="cn-setting-row"><span class="cn-switch-text"><strong>Cor da skill</strong><small>Aparece no cartão para achar a skill mais rápido. A sugestão vem do nome.</small></span><span class="cn-row" style="gap:6px"><input type="color" class="cn-skill-color" data-change="color" value="${esc(s.color)}" /><button class="cn-btn small ghost" data-act="color-auto">Automática</button></span></div>
           ${s.kind === "recurring" ? switchRow({ attrs: 'data-change="enabled"', checked: s.enabled, title: "Ativa", hint: "Desligada, a skill não roda nos gatilhos (continua na biblioteca)." }) : ""}
         </div>`
      : "";

    mount(
      el,
      `<section class="cn-section cn-skill-page">
         <div class="cn-row"><button class="cn-btn small ghost" data-act="back"><i class="fa-solid fa-arrow-left"></i> Voltar</button></div>
         <h3 style="--skill-color:${esc(s.color)}"><span class="cn-skill-dot"></span>${esc(s.title)}${s.edited ? ' <small class="cn-edited">(editado)</small>' : ""}</h3>
         <p class="cn-hint"><strong>${esc(s.author)}</strong> · versão ${esc(s.version)} · ${s.kind === "recurring" ? "recorrente" : "uso único"}${s.origin === "builtin" ? " · skill do app" : s.origin === "market" ? " · do catálogo" : " · sua"}</p>
         <div class="cn-row" style="gap:4px">${s.tags.map((t) => `<span class="cn-pill">#${esc(t)}</span>`).join(" ")}</div>
         <div class="cn-row" style="margin:10px 0">${actions}</div>
         <div class="cn-skill-about">${renderChatMarkdown(s.details || s.description)}</div>
         <div class="cn-stats">
           <div class="cn-stat"><strong>${est.tokens ? `~${est.tokens.toLocaleString("pt-BR")}` : "—"}</strong><span>tokens estimados neste livro${est.basis ? ` (${esc(est.basis)})` : ""}</span></div>
           <div class="cn-stat"><strong>${runs.length}</strong><span>execuções</span></div>
           <div class="cn-stat"><strong>${this.skills.totalTokens(s.slug).toLocaleString("pt-BR")}</strong><span>tokens usados</span></div>
         </div>
         ${prefs}
         <details class="cn-fold"><summary>Texto completo da skill</summary><pre class="cn-code" style="max-height:420px;overflow:auto">${esc(s.body)}</pre></details>
         <details class="cn-fold"><summary>${s.kind === "recurring" ? "Gatilhos" : "Gatilhos (uso único)"}</summary>${triggerList}</details>
         <details class="cn-fold"><summary>Tools que a skill pode usar (${tools.length})</summary><p class="cn-hint">A skill só consegue usar estas ferramentas. ${inLibrary ? "Você pode ajustar a lista, mesmo em uma skill de outra pessoa." : ""}</p>${toolList}</details>
         <details class="cn-fold" ${runs.length ? "open" : ""}><summary>Execuções (${runs.length})</summary>${runRows}</details>
       </section>`,
      {
        back: () => {
          this.view = this.back === "market" ? "market" : "library";
          this.ctx.refresh();
        },
        run: () => this.ctx.services.skillRunner.request(s, { manual: true }),
        edit: () => this.startEdit(s),
        restore: () => confirmModal(this.ctx.uiBus, { title: "Restaurar o original?", danger: true, confirmText: "Restaurar", html: "<p>A sua edição do texto desta skill será descartada e o original volta.</p>", onConfirm: async () => { await this.skills.restore(s.slug); this.ctx.refresh(); } }),
        update: async () => {
          await this.skills.update(s.slug);
          this.ctx.toast("Skill atualizada para a versão mais recente.", "success");
          this.ctx.refresh();
        },
        remove: () => confirmModal(this.ctx.uiBus, { title: "Remover a skill?", danger: true, confirmText: "Remover", html: `<p>A skill <strong>${esc(s.title)}</strong> sai da biblioteca${s.origin === "market" ? " (ela continua no mercado)" : " e é apagada"}.</p>`, onConfirm: async () => { await this.skills.remove(s.slug); this.view = "library"; this.ctx.refresh(); } }),
        install: async () => {
          await this.skills.install(s.slug);
          this.ctx.toast("Skill incluída na biblioteca.", "success");
          this.view = "detail";
          this.ctx.refresh();
        },
        "install-run": async () => {
          await this.skills.install(s.slug);
          this.view = "detail";
          this.ctx.refresh();
          this.ctx.services.skillRunner.request(this.skills.get(s.slug), { manual: true });
        },
        color: (input) => {
          this.skills.setPrefs(s.slug, { color: input.value });
          this.ctx.refresh();
        },
        "color-auto": () => {
          this.skills.setPrefs(s.slug, { color: "" });
          this.ctx.refresh();
        },
        ask: (input) => this.skills.setPrefs(s.slug, { askBefore: input.checked }),
        enabled: (input) => this.skills.setPrefs(s.slug, { enabled: input.checked }),
        trigger: (input) => {
          const set = new Set(s.triggers);
          input.checked ? set.add(input.dataset.id) : set.delete(input.dataset.id);
          this.skills.setPrefs(s.slug, { triggers: [...set] });
        },
        "filter-tools": (input) => filterItems(input.closest(".cn-tool-table"), ".cn-tool-row", input.value),
        tool: (input) => {
          input.closest(".cn-tool-row")?.classList.toggle("on", input.checked);
          const set = new Set(s.tools);
          input.checked ? set.add(input.dataset.id) : set.delete(input.dataset.id);
          this.skills.setPrefs(s.slug, { tools: [...set] });
        },
      },
    );
    void fromMarket;
  }

  // ========== Criação e edição ========== //

  /**
   * Abre o formulário para editar uma skill.
   * @param {Object} s - Skill.
   * @returns {void}
   * @private
   */
  startEdit(s) {
    this.draft = { color: this.skills.prefs(s.slug).color || "", title: s.title, slug: s.slug, description: s.description, details: s.details, body: s.body, kind: s.kind, tags: [...s.tags], triggers: [...s.triggers], tools: [...s.tools] };
    this.slug = s.slug;
    this.view = "edit";
    this.ctx.refresh();
  }

  /**
   * Formulário de criação e edição.
   * @param {HTMLElement} el - Contêiner.
   * @returns {void}
   * @private
   */
  renderForm(el) {
    const d = this.draft;
    const editing = Boolean(this.slug);
    const current = editing ? this.skills.get(this.slug) : null;
    const copyNote = current && (current.origin === "builtin" || current.origin === "market")
      ? '<p class="cn-hint">Esta skill veio do app ou do catálogo: ao salvar o texto, é criada uma <strong>cópia editada</strong> (com ID novo e o selo “editado”). Dá para restaurar o original depois.</p>'
      : "";
    const registry = toolRegistry.getDefinitions();

    mount(
      el,
      `<section class="cn-section">
         <div class="cn-row"><button class="cn-btn small ghost" data-act="cancel"><i class="fa-solid fa-arrow-left"></i> Voltar</button></div>
         <h4>${editing ? `Editar “${esc(d.title)}”` : "Criar uma skill"}</h4>
         ${copyNote}
         <label class="cn-field"><span>Nome</span><input class="cn-input" data-input="f" data-key="title" value="${esc(d.title)}" placeholder="Revisar diálogos" /></label>
         <label class="cn-field"><span>Identificador (minúsculas e hífens; o que a IA enxerga)</span><input class="cn-input" data-input="f" data-key="slug" value="${esc(d.slug)}" ${editing ? "readonly" : ""} placeholder="revisar-dialogos" /></label>
         <label class="cn-field"><span>Quando a IA deve usar (descrição curta)</span><input class="cn-input" data-input="f" data-key="description" value="${esc(d.description)}" placeholder="Ao revisar diálogos de um capítulo" /></label>
         <label class="cn-field"><span>Descrição completa (Markdown, aparece na página da skill)</span><textarea class="cn-textarea" data-input="f" data-key="details" rows="4">${esc(d.details)}</textarea></label>
         <label class="cn-field"><span>Instruções (o texto que a IA segue ao executar)</span><textarea class="cn-textarea" data-input="f" data-key="body" rows="10" placeholder="Passo a passo que a IA deve seguir...">${esc(d.body)}</textarea></label>
         <label class="cn-field"><span>Tipo</span><select class="cn-select" data-change="kind"><option value="once" ${d.kind === "once" ? "selected" : ""}>Uso único (executo quando quiser)</option><option value="recurring" ${d.kind === "recurring" ? "selected" : ""}>Recorrente (roda nos gatilhos escolhidos)</option></select></label>
         <div class="cn-field"><span>Cor da skill (aparece no cartão; a sugestão vem do nome)</span><div class="cn-row" style="gap:8px"><input type="color" class="cn-skill-color" data-change="fcolor" value="${esc(d.color || autoSkillColor(d.slug || d.title))}" /><button class="cn-btn small ghost" data-act="fcolor-auto">Usar a sugestão</button></div></div>
         <label class="cn-field"><span>Tags (separadas por vírgula)</span><input class="cn-input" data-input="f" data-key="tags" value="${esc(d.tags.join(", "))}" /></label>
         ${d.kind === "recurring" ? `<div class="cn-field"><span>Gatilhos (quando roda sozinha)</span>${TRIGGER_GROUPS.map((g) => `<details class="cn-trig-group" ${g.triggers.some((t) => d.triggers.includes(t.id)) ? "open" : ""}><summary>${esc(g.group)}</summary><div class="cn-checks">${g.triggers.map((t) => `<label class="cn-check"><input type="checkbox" data-change="ftrigger" data-id="${esc(t.id)}" ${d.triggers.includes(t.id) ? "checked" : ""} /> ${esc(t.label)}</label>`).join("")}</div></details>`).join("")}</div>` : ""}
         <div class="cn-field"><span>Tools que a skill pode usar</span><p class="cn-hint">A skill só consegue usar o que estiver marcado. Marque o mínimo necessário: quem instalar sua skill verá esta lista.</p>
           ${toolTable(registry, d.tools, "ftool")}</div>
         <div class="cn-row"><button class="cn-btn primary" data-act="save"><i class="fa-solid fa-check"></i> ${editing ? "Salvar alterações" : "Criar skill"}</button><button class="cn-btn ghost" data-act="cancel">Cancelar</button></div>
       </section>`,
      {
        f: (input) => {
          const key = input.dataset.key;
          this.draft[key] = key === "tags" ? input.value.split(",").map((t) => t.trim()).filter(Boolean) : input.value;
        },
        kind: (select) => {
          this.draft.kind = select.value;
          this.ctx.refresh();
        },
        fcolor: (input) => {
          this.draft.color = input.value;
        },
        "fcolor-auto": () => {
          this.draft.color = "";
          this.ctx.refresh();
        },
        ftrigger: (input) => {
          const set = new Set(this.draft.triggers);
          input.checked ? set.add(input.dataset.id) : set.delete(input.dataset.id);
          this.draft.triggers = [...set];
        },
        "filter-tools": (input) => filterItems(input.closest(".cn-tool-table"), ".cn-tool-row", input.value),
        ftool: (input) => {
          input.closest(".cn-tool-row")?.classList.toggle("on", input.checked);
          const set = new Set(this.draft.tools);
          input.checked ? set.add(input.dataset.id) : set.delete(input.dataset.id);
          this.draft.tools = [...set];
        },
        cancel: () => {
          this.view = editing ? "detail" : "library";
          this.ctx.refresh();
        },
        save: async () => {
          try {
            const slug = await this.skills.save(this.draft, { slug: editing ? this.slug : undefined });
            this.skills.setPrefs(slug, { color: this.draft.color || "" });
            this.ctx.toast(editing ? "Skill salva." : "Skill criada.", "success");
            this.slug = slug;
            this.view = "detail";
            this.ctx.refresh();
          } catch (error) {
            this.ctx.toast(error.message, "error");
          }
        },
      },
    );
  }
}
