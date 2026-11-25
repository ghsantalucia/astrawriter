/**
 * @file Central de Revisões: página inicial (painel com números, mais graves, correção pela IA, tipos dispensados e
 * dicionário) e uma página por categoria, com os issues em cards (tag do tipo, arquivo, trecho, solução recomendada e
 * ações: ir para o trecho, corrigir, dispensar, adicionar ao dicionário e dispensar todos do tipo).
 */

import { CATEGORIES, ISSUE_TYPES, categoryInfo, typeInfo } from "../../../review/issueTypes.js";
import { confirmModal, esc, mount, plural, shortDate, switchRow } from "./panelKit.js";
import { t, getLanguage } from "../../../../shared/i18n.js";

/** Quantos cards aparecem de uma vez em cada categoria (o resto vem em "mostrar mais"). */
const PAGE_SIZE = 40;

/** Mensagem enviada ao chat quando o autor pede para a IA corrigir os pendentes. */
const AI_FIX_MESSAGE =
  "Corrija os pendentes da Central de Revisões. Consulte a lista com list_issues e corrija apenas os que tiverem uma solução segura, " +
  "respeitando as permissões dos arquivos (não altere arquivos com aiWrite desligado). Depois de corrigir, marque os itens com " +
  "resolve_issues. Se algum não puder ser corrigido (arquivo protegido, trecho ambíguo ou erro de ferramenta), avise-me aqui no chat dizendo qual e por quê.";

/**
 * Página "Central de Revisões".
 * @class
 */
export class IssuesPanel {
  declare ctx: any;
  declare filters: any;
  declare limits: any;
  declare pendingCache: any;
  declare title: any;

  /**
   * @param {Object} ctx - Contexto da central (services, uiBus, refresh, close...).
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.title = t("Central de Revisões");
    /** Filtro de tipo e quantidade exibida por aba. */
    this.filters = {};
    this.limits = {};
    /** Arquivos pendentes de análise (cache curto: calcular lê e confere o hash dos arquivos). */
    this.pendingCache = null;

    // Progresso da análise da IA (atualiza só o texto, sem redesenhar a página)
    ctx.uiBus.on("analysis:progress", (p) => {
      const box = document.getElementById("analysis-progress");
      if (box && p) {
        box.textContent =
          p.phase === "digest"
            ? t("Analisando arquivos: {done}/{total}", { done: p.done, total: p.total }) + (p.current ? ` (${p.current})` : "")
            : t("Conferindo contradições: {done}/{total}", { done: p.done, total: p.total });
      }
    });
    ctx.uiBus.on("analysis:changed", () => {
      this.pendingCache = null;
      ctx.refresh();
    });
    ctx.uiBus.on("sync:completed", () => {
      this.pendingCache = null;
    });
    // Ligar/desligar a correção ou trocar o idioma (aqui ou nas Configurações) atualiza as opções da página
    ctx.uiBus.on("spellcheck:changed", () => {
      if (ctx.isOpen?.("issues")) ctx.refresh();
    });
  }

  /**
   * Arquivos pendentes de análise (com cache de poucos segundos).
   * @returns {Promise<Object>}
   * @private
   */
  async getPending() {
    if (this.pendingCache && Date.now() - this.pendingCache.at < 15000) return this.pendingCache.data;
    const data = await this.ctx.services.analysis.pending();
    this.pendingCache = { at: Date.now(), data };
    return data;
  }

  /** @returns {Object} Serviço de issues. */
  get issues() {
    return this.ctx.services.issues;
  }

  // ========== Contrato com a central ========== //

  /**
   * Abas laterais: resumo + categorias, cada uma com as bolinhas vermelha/amarela.
   * @returns {Array<Object>}
   */
  getTabs() {
    const summary = this.issues.summary();
    return [
      {
        id: "overview",
        label: t("Resumo"),
        icon: "fa-gauge-high",
        badges: { error: summary.errors, warning: summary.warnings },
      },
      { separator: true },
      ...CATEGORIES.map((c) => ({
        id: c.id,
        label: c.label,
        icon: c.icon,
        badges: summary.byCategory[c.id] || { error: 0, warning: 0 },
      })),
    ];
  }

  /**
   * Subtítulo e texto de apoio da aba.
   * @param {string} tab - Aba.
   * @returns {{subtitle: string, lead: string}}
   */
  getHeader(tab) {
    if (tab === "overview") {
      return {
        subtitle: t("Resumo do livro"),
        lead: t("Problemas, inconsistências e sugestões encontrados no livro. Erros confirmados são vermelhos; possíveis erros e sugestões, amarelos."),
      };
    }
    const cat = categoryInfo(tab);
    return { subtitle: cat?.label || "", lead: cat?.description || "" };
  }

  /**
   * Desenha a aba.
   * @param {string} tab - Aba.
   * @param {HTMLElement} el - Contêiner.
   * @returns {void}
   */
  render(tab, el) {
    if (tab === "overview") this.renderOverview(el);
    else this.renderCategory(tab, el);
  }

  // ========== Página inicial ========== //

  /**
   * Painel principal.
   * @param {HTMLElement} el - Contêiner.
   * @returns {void}
   * @private
   */
  async renderOverview(el) {
    const pending = await this.getPending();
    const s = this.issues.summary();
    const dismissed = this.issues.dismissedTypes();
    const words = this.issues.dictionaryWords();
    const worst = this.issues.list({ severity: "error" }).slice(0, 5);
    const fixable = this.issues.all().filter((i) => typeof i.suggestion?.replace === "string").length;

    const stats = `
      <div class="cn-stats">
        <div class="cn-stat ${s.total === 0 ? "success" : ""}"><strong>${s.total}</strong><span>${t("pendências no total")}</span></div>
        <div class="cn-stat error"><strong>${s.errors}</strong><span>${s.errors === 1 ? t("erro confirmado") : t("erros confirmados")}</span></div>
        <div class="cn-stat warning"><strong>${s.warnings}</strong><span>${t("possíveis erros e sugestões")}</span></div>
        <div class="cn-stat"><strong>${fixable}</strong><span>${t("com correção pronta")}</span></div>
      </div>`;

    const empty = `
      <div class="cn-empty">
        <i class="fa-solid fa-circle-check"></i>
        <strong>${t("Tudo certo por aqui.")}</strong>
        <p class="cn-hint">${t("Nenhuma pendência encontrada no livro. A central se atualiza sozinha quando você escreve, sincroniza ou a IA registra algo.")}</p>
      </div>`;

    const worstHtml =
      worst.length > 0
        ? `<section class="cn-section">
             <h4>${t("Os mais graves")}</h4>
             ${worst.map((i) => this.cardHtml(i, { compact: true })).join("")}
             ${s.errors > worst.length ? `<p class="cn-hint">${t("Mais {count} erro(s) nas categorias ao lado.", { count: s.errors - worst.length })}</p>` : ""}
           </section>`
        : "";

    const analysis = this.ctx.services.analysis;
    const running = analysis.running;
    const analysisHtml = `
      <section class="cn-section">
        <h4>${t("Análise da IA")}</h4>
        <p class="cn-hint">${t("A IA lê cada arquivo atualizado <strong>uma vez</strong> e guarda um resumo de metadados (fatos, personagens, eventos). Contradições são procuradas nesses resumos e só os casos duvidosos são conferidos pela IA: assim o livro todo é verificado sem gastar tokens à toa. Arquivos novos só entram depois de sincronizados.")}</p>
        <p class="cn-hint" id="analysis-progress">${
          running
            ? t("Análise em andamento...")
            : pending.files.length === 0
              ? t("Tudo em dia: {count}.", { count: plural(pending.analyzed, "arquivo analisado", "arquivos analisados") })
              : t("{files} análise (~{tokens} tokens estimados). {analyzed} já analisado(s).", { files: plural(pending.files.length, "arquivo aguarda", "arquivos aguardam"), tokens: pending.tokens.toLocaleString(getLanguage()), analyzed: pending.analyzed })
        }</p>
        <div class="cn-row">
          ${
            running
              ? `<button class="cn-btn" data-act="cancel-analysis"><i class="fa-solid fa-stop"></i> ${t("Parar")}</button>`
              : `<button class="cn-btn primary" data-act="analyze" ${pending.files.length === 0 ? "disabled" : ""}><i class="fa-solid fa-microscope"></i> ${t("Analisar agora")}</button>`
          }
        </div>
      </section>`;

    const aiHtml = `
      <section class="cn-section">
        <h4>${t("Correção pela IA")}</h4>
        <p class="cn-hint">${t("A IA avalia cada pendência (seguindo as sugestões do sistema) e escolhe a solução de cada uma: aplica a correção segura, resolve contradições pelas fichas e pela Sinopse e deixa para você o que depende de decisão. Só altera arquivos em que a escrita da IA está liberada; as mudanças passam pela sua revisão e ficam no changelog.")}</p>
        <div class="cn-row">
          <button class="cn-btn primary" data-act="ai-fix" ${s.total === 0 ? "disabled" : ""}><i class="fa-solid fa-wand-magic-sparkles"></i> ${t("Corrigir tudo com a IA")}</button>
          <button class="cn-btn ghost" data-act="rescan"><i class="fa-solid fa-rotate"></i> ${t("Reanalisar o livro")}</button>
        </div>
      </section>`;

    const typesHtml = `
      <section class="cn-section">
        <h4>${t("Tipos dispensados")}</h4>
        ${
          dismissed.length === 0
            ? `<p class="cn-hint">${t("Nenhum. Quando você dispensa um tipo inteiro de pendência, ele aparece aqui e pode ser reativado.")}</p>`
            : `<p class="cn-hint">${t("Estes tipos não são mais procurados nem mostrados. Reativar um tipo faz uma varredura do livro só por ele.")}</p>
               <table class="cn-table"><tbody>
               ${dismissed
                 .map(
                   (d) => `<tr>
                     <td><span class="cn-pill ${typeInfo(d.type).severity}">${esc(d.label)}</span></td>
                     <td>${esc(categoryInfo(d.category)?.label || "")}</td>
                     <td>${shortDate(d.at)}</td>
                     <td style="text-align:right"><button class="cn-btn small" data-act="restore-type" data-type="${esc(d.type)}"><i class="fa-solid fa-rotate-left"></i> ${t("Reativar")}</button></td>
                   </tr>`,
                 )
                 .join("")}
               </tbody></table>`
        }
      </section>`;

    const dictHtml = `
      <section class="cn-section">
        <h4>${t("Dicionário do livro")}</h4>
        ${
          words.length === 0
            ? `<p class="cn-hint">${t("Nenhuma palavra. Use \"Adicionar ao dicionário\" nos erros de digitação para aceitar nomes e termos do seu universo.")}</p>`
            : `<p class="cn-hint">${t("Palavras aceitas neste livro ({count}).", { count: words.length })}</p>
               <div class="cn-row">${words
                 .map(
                   (w) =>
                     `<span class="cn-pill">${esc(w)} <button class="cn-btn small ghost" style="padding:0 4px;border:none" title="${t("Remover do dicionário")}" data-act="remove-word" data-word="${esc(w)}"><i class="fa-solid fa-xmark"></i></button></span>`,
                 )
                 .join("")}</div>`
        }
      </section>`;

    const enabled = this.issues.isEnabled();
    const masterHtml = `
      <div class="cn-setting-list cn-master">
        ${switchRow({ attrs: 'data-change="reviews-toggle"', checked: enabled, title: t("Revisões do sistema neste livro"), hint: enabled ? t("O sistema procura links quebrados, ortografia, repetições e outras pendências conforme você escreve.") : t("Desligadas: as pendências já encontradas continuam aqui, mas nada novo é procurado e o contador do rodapé do editor fica oculto. O sublinhado da correção ortográfica no editor continua (ele tem opção própria na aba Ortografia).") })}
      </div>`;

    mount(el, masterHtml + stats + (s.total === 0 ? empty : worstHtml) + analysisHtml + aiHtml + typesHtml + dictHtml, {
      ...this.cardActions(),
      "reviews-toggle": async (input) => {
        await this.issues.setEnabled(input.checked);
        this.ctx.toast(input.checked ? t("Revisões ligadas. Reanalisando o livro...") : t("Revisões do sistema desligadas neste livro."), "info");
        this.ctx.refresh();
      },
      "ai-fix": () => this.fixWithAi("todas"),
      analyze: () => this.askAnalyze(pending),
      "cancel-analysis": () => analysis.cancel(),
      rescan: async () => {
        this.ctx.toast(t("Reanalisando o livro..."), "info");
        await this.issues.rescanAll();
      },
      "restore-type": async (btn) => {
        await this.issues.restoreType(btn.dataset.type);
        this.ctx.toast(t("Tipo reativado. O livro foi reanalisado."), "success");
      },
      "remove-word": async (btn) => {
        await this.issues.removeFromDictionary(btn.dataset.word);
      },
    });
  }

  /**
   * Confirmação (com a estimativa de tokens) antes de rodar a análise da IA.
   * @param {{files: Array, tokens: number}} pending - Arquivos pendentes.
   * @returns {void}
   * @private
   */
  askAnalyze(pending) {
    const budget = this.ctx.services.analysis.settings().budgetTokens;
    confirmModal(this.ctx.uiBus, {
      title: t("Analisar com a IA?"),
      html: `<p>${t("<strong>{files}</strong> serão lidos pela IA (custo estimado: <strong>~{tokens} tokens</strong>).", { files: plural(pending.files.length, "arquivo", "arquivos"), tokens: pending.tokens.toLocaleString(getLanguage()) })}</p>
             <p>${t("O orçamento por análise é de {budget} tokens (mude na Central de IA). Se o orçamento acabar, a análise para e você continua depois.", { budget: budget.toLocaleString(getLanguage()) })}</p>
             <p>${t("Você pode seguir escrevendo enquanto a análise roda.")}</p>`,
      confirmText: t("Analisar"),
      onConfirm: () => {
        this.pendingCache = null;
        this.ctx.services.analysis.runWithToasts().catch(() => {});
        setTimeout(() => this.ctx.refresh(), 300);
      },
    });
  }

  /**
   * "Corrigir tudo": pede à skill nativa que avalie cada issue (da categoria, ou de todas) e escolha a solução de cada um.
   * A execução mostra a janela de permissão com a estimativa de tokens.
   * @param {string} category - Categoria (`links`, `spelling`...) ou `todas`.
   * @returns {void}
   * @private
   */
  fixWithAi(category) {
    const skill = this.ctx.services.skills.get("corrigir-pendencias");
    if (!skill) {
      this.ctx.toast(t("A skill \"Corrigir pendências\" não está disponível."), "error");
      return;
    }
    const label = category === "todas" ? "todas as categorias" : categoryInfo(category).label;
    this.ctx.services.skillRunner.request(skill, {
      manual: true,
      extra: `Categoria a corrigir: ${category === "todas" ? "todas" : category} (${label}).`,
    });
  }

  /**
   * Janela de aviso antes de pedir à IA que corrija os pendentes.
   * @returns {void}
   * @private
   */
  askAiFix() {
    const total = this.issues.summary().total;
    confirmModal(this.ctx.uiBus, {
      title: t("Pedir à IA para corrigir?"),
      html: `<p>${t("A IA vai tentar corrigir <strong>{count}</strong> sozinha.", { count: plural(total, "pendência", "pendências") })}</p>
             <p>${t("<strong>Atenção:</strong> a IA pode cometer erros. Ela só altera arquivos em que a escrita da IA está liberada, e todas as alterações vão para rascunho (<code>.temp</code>) e para a tela de revisão, onde você aprova ou descarta.")}</p>
             <p>${t("A Central será fechada e a conversa abrirá no chat. Se algo não puder ser corrigido, a IA avisa por lá.")}</p>`,
      confirmText: t("Pedir à IA"),
      onConfirm: async () => {
        await this.ctx.services.changelog?.recordReview({ kind: "ai-fix", count: total }, this.ctx.services.changelog.userActor());
        this.ctx.close();
        this.ctx.uiBus.emit("chat:open");
        this.ctx.uiBus.emit("chat:send-message", { promptText: AI_FIX_MESSAGE });
      },
    });
  }

  // ========== Páginas das categorias ========== //

  /**
   * Lista de cards de uma categoria, com filtro por tipo.
   * @param {string} tab - Categoria.
   * @param {HTMLElement} el - Contêiner.
   * @returns {void}
   * @private
   */
  renderCategory(tab, el) {
    const all = this.issues.list({ category: tab }).sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
      return a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0);
    });
    const typeFilter = this.filters[tab] || null;
    const shown = typeFilter ? all.filter((i) => i.type === typeFilter) : all;
    const limit = this.limits[`${tab}|${typeFilter}`] || PAGE_SIZE;
    // A linha do tempo mostra, antes dos issues, a sugestão de ordem calculada pelo sistema; a ortografia, as opções de correção
    const extra = tab === "timeline" ? this.timelineHtml() : tab === "spelling" ? this.spellingHtml() : "";

    const handlers = {
      "fix-all": () => this.fixWithAi(tab),
      ...this.cardActions(),
      filter: (btn) => {
        this.filters[tab] = btn.dataset.type || null;
        this.ctx.refresh();
      },
      more: () => {
        this.limits[`${tab}|${typeFilter}`] = limit + PAGE_SIZE;
        this.ctx.refresh();
      },
      "new-event": () => {
        this.ctx.close();
        this.ctx.uiBus.emit("entity:create", { data: { folder: "assets/events" } });
      },
      "open-timeline": () => {
        this.ctx.close();
        this.ctx.uiBus.emit("editor:open-file", { path: `${this.issues.bookPath}/assets/events/timeline.md` });
      },
      "apply-timeline": () => this.askApplyTimeline(),
      // Mesmas opções das Configurações (as duas telas ficam sincronizadas pelo evento spellcheck:changed)
      "spell-toggle": (input) => this.ctx.uiBus.emit("spellcheck:toggle", { value: input.checked }),
      "spell-lang": (select) => this.ctx.uiBus.emit("language:changed", { value: select.value }),
    };

    if (all.length === 0) {
      mount(
        el,
        `${extra}<div class="cn-empty"><i class="fa-solid fa-circle-check"></i><strong>${t("Nenhuma pendência nesta categoria.")}</strong>
         <p class="cn-hint">${esc(categoryInfo(tab)?.description || "")}</p></div>`,
        handlers,
      );
      return;
    }

    const counts = {};
    for (const i of all) counts[i.type] = (counts[i.type] || 0) + 1;
    const chips = [
      `<button class="rv-chip ${typeFilter ? "" : "active"}" data-act="filter" data-type="">${t("Todos")} <b>${all.length}</b></button>`,
      ...Object.entries(counts).map(
        ([type, n]) =>
          `<button class="rv-chip ${typeFilter === type ? "active" : ""} ${typeInfo(type).severity}" data-act="filter" data-type="${esc(type)}">${esc(typeInfo(type).label)} <b>${n}</b></button>`,
      ),
    ].join("");

    const more =
      shown.length > limit
        ? `<button class="cn-btn" data-act="more">${t("Mostrar mais ({count} restantes)", { count: shown.length - limit })}</button>`
        : "";

    mount(
      el,
      `${extra}${all.length ? `<div class="cn-row" style="margin:6px 0"><button class="cn-btn small primary" data-act="fix-all"><i class="fa-solid fa-wand-magic-sparkles"></i> ${t("Corrigir tudo com a IA ({count})", { count: all.length })}</button><small class="cn-hint">${t("A IA avalia cada pendência desta aba e escolhe a solução.")}</small></div>` : ""}<div class="rv-chips">${chips}</div>
       <div class="rv-list">${shown.slice(0, limit).map((i) => this.cardHtml(i)).join("")}</div>
       ${more}`,
      handlers,
    );
    this.fillSuggestions(el);
  }

  /**
   * Opções da correção ortográfica (ligar/desligar e idioma), as mesmas das Configurações.
   * @returns {string}
   * @private
   */
  spellingHtml() {
    const on = localStorage.getItem("app_spellcheck_enabled") !== "false";
    const lang = localStorage.getItem("app_spell_language") || "pt-BR";
    const langs = [["pt-BR", "Português (Brasil)"], ["en-US", "English (US)"], ["es-ES", "Español"], ["fr-FR", "Français"]];
    return `
      <section class="cn-section">
        <h4>${t("Correção ortográfica")}</h4>
        <p class="cn-hint">${t("Sublinha palavras desconhecidas, aponta palavras repetidas e mostra os avisos no rodapé do editor. Nomes e apelidos das fichas do livro e as palavras do dicionário do livro nunca são marcados. Estas opções são as mesmas das Configurações.")}</p>
        <div class="cn-setting-list">
          ${switchRow({ attrs: 'data-change="spell-toggle"', checked: on, title: t("Correção ortográfica e gramatical"), hint: t("Liga ou desliga todas as verificações de escrita.") })}
          <label class="cn-setting-row">
            <span class="cn-switch-text"><strong>${t("Idioma")}</strong><small>${t("Dicionário usado na correção.")}</small></span>
            <select class="cn-select" data-change="spell-lang">${langs.map(([v, l]) => `<option value="${v}" ${v === lang ? "selected" : ""}>${l}</option>`).join("")}</select>
          </label>
        </div>
      </section>`;
  }

  /**
   * Bloco da linha do tempo: ordem sugerida pelo sistema (sem IA) a partir das fichas de eventos, com o botão que a
   * aprova e escreve no arquivo da linha do tempo (o autor nunca edita esse arquivo diretamente).
   * @returns {string}
   * @private
   */
  timelineHtml() {
    const { ordered, events } = this.issues.timelineSuggestion();
    const list =
      ordered.length === 0
        ? `<p class="cn-hint">${t("Ainda não há eventos. Crie fichas de eventos (com o momento em que ocorreram e a ordem entre eles) e o sistema sugere a linha do tempo, sem gastar IA.")}</p>`
        : `<ol class="rv-timeline">${ordered
            .map(
              (e) =>
                `<li class="${e.inCycle ? "cycle" : ""}"><strong>${esc(e.title)}</strong>${e.when ? ` <span class="cn-pill">${esc(e.when)}</span>` : ""}${e.inCycle ? ' <span class="cn-pill error">${t("ordem circular")}</span>' : ""}</li>`,
            )
            .join("")}</ol>`;
    return `
      <section class="cn-section">
        <h4>${t("Sugestão de linha do tempo ({count})", { count: plural(events, "evento", "eventos") })}</h4>
        <p class="cn-hint">${t("Calculada pelo sistema a partir do momento e da ordem (antes de / depois de) informados em cada ficha de evento. A linha do tempo oficial só é escrita quando você aprova aqui ou quando a IA a atualiza: ninguém a edita à mão.")}</p>
        ${list}
        <div class="cn-row">
          <button class="cn-btn" data-act="new-event"><i class="fa-solid fa-plus"></i> ${t("Novo evento")}</button>
          <button class="cn-btn primary" data-act="apply-timeline" ${ordered.length === 0 ? "disabled" : ""}><i class="fa-solid fa-check"></i> ${t("Aprovar e escrever na linha do tempo")}</button>
          <button class="cn-btn ghost" data-act="open-timeline"><i class="fa-regular fa-file-lines"></i> ${t("Ver linha do tempo")}</button>
        </div>
      </section>`;
  }

  /**
   * Confirmação antes de escrever a sugestão na linha do tempo.
   * @returns {void}
   * @private
   */
  askApplyTimeline() {
    const { ordered } = this.issues.timelineSuggestion();
    confirmModal(this.ctx.uiBus, {
      title: t("Escrever na linha do tempo?"),
      html: `<p>${t("O arquivo da linha do tempo será reescrito com a ordem sugerida (<strong>{count}</strong>).", { count: plural(ordered.length, "evento", "eventos") })}</p>
             <p>${t("A alteração vai para rascunho (<code>.temp</code>) e só é salva quando você sincronizar. Eventos presos em ordem circular aparecem no fim da lista; corrija-os para uma ordem confiável.")}</p>`,
      confirmText: t("Escrever"),
      onConfirm: async () => {
        try {
          await this.issues.writeTimeline(ordered, this.ctx.services.changelog.systemActor());
          this.ctx.toast(t("Linha do tempo atualizada no rascunho. Sincronize para salvar."), "success");
        } catch (error) {
          this.ctx.toast(error.message, "error");
        }
      },
    });
  }

  /**
   * Card de um issue.
   * @param {Object} issue - Issue.
   * @param {Object} [options]
   * @param {boolean} [options.compact=false] - Versão resumida (página inicial).
   * @returns {string}
   * @private
   */
  cardHtml(issue, { compact = false } = {}) {
    const info = typeInfo(issue.type);
    const sev = issue.severity === "error" ? "error" : "warning";
    const where = `${esc(this.issues.fileTitle(issue.file))}${issue.line ? ` · ${t("linha {line}", { line: issue.line })}` : ""}`;
    const excerpt = issue.excerpt
      ? `<blockquote class="rv-excerpt">${esc(String(issue.excerpt).slice(0, 220))}</blockquote>`
      : "";
    const fix =
      typeof issue.suggestion?.replace === "string"
        ? `<div class="rv-suggestion"><i class="fa-solid fa-lightbulb"></i> <span>${t("Solução: <strong>{solution}</strong>", { solution: esc(issue.suggestion.label || t("trocar por \"{text}\"", { text: issue.suggestion.replace })) })}</span></div>`
        : issue.type === "typo"
          ? `<div class="rv-suggestion" data-suggest="${esc(issue.word)}"><i class="fa-solid fa-lightbulb"></i> <span class="rv-suggest-text">${t("Procurando sugestão...")}</span></div>`
          : "";
    const related = (issue.related || [])
      .map(
        (r) =>
          `<div class="rv-related"><i class="fa-solid fa-link"></i> ${t("Também em")} <a href="#" data-act="goto-related" data-file="${esc(r.file)}" data-excerpt="${esc(r.excerpt)}">${esc(this.issues.fileTitle(r.file))}</a>${r.excerpt ? `: <em>${esc(r.excerpt)}</em>` : ""}</div>`,
      )
      .join("");

    const canFix = typeof issue.suggestion?.replace === "string";
    const buttons = `
      <button class="cn-btn small" data-act="goto" data-id="${esc(issue.id)}"><i class="fa-solid fa-location-arrow"></i> ${t("Ir para o trecho")}</button>
      ${canFix ? `<button class="cn-btn small primary" data-act="fix" data-id="${esc(issue.id)}"><i class="fa-solid fa-check"></i> ${t("Corrigir")}</button>` : ""}
      ${issue.type === "typo" ? `<button class="cn-btn small" data-act="dict" data-id="${esc(issue.id)}"><i class="fa-solid fa-book-medical"></i> ${t("Adicionar ao dicionário")}</button>` : ""}
      <button class="cn-btn small ghost" data-act="dismiss" data-id="${esc(issue.id)}"><i class="fa-regular fa-eye-slash"></i> ${t("Dispensar")}</button>
      ${compact ? "" : `<button class="cn-btn small ghost" data-act="dismiss-type" data-id="${esc(issue.id)}" title="${t("Dispensar todos os issues deste tipo")}"><i class="fa-solid fa-ban"></i> ${t("Dispensar todos desse tipo")}</button>`}`;

    return `
      <article class="rv-card ${sev}" data-id="${esc(issue.id)}">
        <header class="rv-card-head">
          <span class="rv-dot ${sev}" title="${sev === "error" ? t("Erro confirmado") : t("Possível erro ou sugestão")}"></span>
          <span class="rv-type ${sev}" title="${esc(info.description)}">${esc(info.label)}</span>
          <span class="rv-source">${issue.source === "ai" ? '<i class="fa-solid fa-wand-magic-sparkles"></i> ' + t("IA") : '<i class="fa-solid fa-gear"></i> ' + t("Sistema")}</span>
          <span class="rv-file" title="${esc(issue.file)}"><i class="fa-regular fa-file-lines"></i> ${where}</span>
        </header>
        <p class="rv-message">${esc(issue.message)}</p>
        ${excerpt}${fix}${related}
        <footer class="rv-actions">${buttons}</footer>
      </article>`;
  }

  /**
   * Ações dos cards (usadas na página inicial e nas categorias).
   * @returns {Object<string, Function>}
   * @private
   */
  cardActions() {
    return {
      goto: (btn) => this.goTo(btn.dataset.id),
      "goto-related": (a, e) => {
        e.preventDefault();
        this.goToFile(a.dataset.file, a.dataset.excerpt);
      },
      fix: async (btn) => {
        btn.disabled = true;
        try {
          await this.issues.fix(btn.dataset.id);
          this.ctx.toast(t("Correção aplicada no rascunho. Sincronize para salvar."), "success");
        } catch (error) {
          btn.disabled = false;
          this.ctx.toast(error.message, "error");
        }
      },
      dismiss: async (btn) => {
        await this.issues.dismiss([btn.dataset.id]);
      },
      dict: async (btn) => {
        const issue = this.issues.find(btn.dataset.id);
        if (issue?.word) await this.issues.addToDictionary(issue.word);
      },
      "dismiss-type": (btn) => this.askDismissType(this.issues.find(btn.dataset.id)),
    };
  }

  /**
   * Confirmação de "dispensar todos desse tipo".
   * @param {Object|undefined} issue - Issue de referência.
   * @returns {void}
   * @private
   */
  askDismissType(issue) {
    if (!issue) return;
    const info = typeInfo(issue.type);
    const n = this.issues.list({ type: issue.type }).length;
    confirmModal(this.ctx.uiBus, {
      title: t("Dispensar todos desse tipo?"),
      danger: true,
      confirmText: t("Dispensar o tipo inteiro"),
      html: `<p>${t("Você vai dispensar <strong>todos</strong> os issues do tipo <strong>{type}</strong> ({count} no momento).", { type: esc(info.label), count: n })}</p>
             <p>${t("Eles somem da central, o sistema deixa de procurá-los e a IA deixa de registrá-los. Isso vale para o livro todo, inclusive para o que ainda for escrito.")}</p>
             <p>${t("Você pode reverter a qualquer momento na <strong>página inicial</strong> da Central de Revisões, em \"Tipos dispensados\".")}</p>`,
      onConfirm: () => this.issues.dismissType(issue.type),
    });
  }

  /**
   * Abre o arquivo do issue no editor com o cursor no trecho.
   * @param {string} id - Id do issue.
   * @returns {Promise<void>}
   * @private
   */
  async goTo(id) {
    const issue = this.issues.find(id);
    if (!issue) return;
    const { path, reveal } = await this.issues.revealTarget(issue);
    this.ctx.close();
    this.ctx.uiBus.emit("editor:open-file", { path, reveal });
  }

  /**
   * Abre outro arquivo citado no issue (contradições entre arquivos).
   * @param {string} file - Arquivo relativo ao livro.
   * @param {string} excerpt - Trecho a destacar.
   * @returns {void}
   * @private
   */
  goToFile(file, excerpt) {
    this.ctx.close();
    this.ctx.uiBus.emit("editor:open-file", {
      path: `${this.issues.bookPath}/${file}`,
      reveal: excerpt ? { term: excerpt.split("\n")[0].trim(), occurrence: 0 } : null,
    });
  }

  /**
   * Preenche as sugestões de ortografia dos cards de erro de digitação (pedidas ao dicionário sob demanda).
   * @param {HTMLElement} el - Contêiner.
   * @returns {void}
   * @private
   */
  fillSuggestions(el) {
    const language = localStorage.getItem("app_spell_language") || "pt-BR";
    el.querySelectorAll("[data-suggest]").forEach(async (box) => {
      try {
        const list = (await window.electronAPI.suggestSpelling?.(language, box.dataset.suggest)) || [];
        box.querySelector(".rv-suggest-text").innerHTML = list.length
          ? t("Sugestões: {words}", { words: list.slice(0, 4).map((w) => `<strong>${esc(w)}</strong>`).join(", ") })
          : t("Sem sugestões do dicionário.");
      } catch {
        box.querySelector(".rv-suggest-text").textContent = t("Sem sugestões do dicionário.");
      }
    });
  }
}

// Mantém o catálogo acessível para outros módulos que importam daqui
export { ISSUE_TYPES };
