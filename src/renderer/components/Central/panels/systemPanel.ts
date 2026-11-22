/**
 * @file Central do Sistema: configurações do app (não do livro): geral, atualização, aparência, acessibilidade, editor,
 * produtividade, atalhos de teclado, backup e templates. As configurações simples vêm do registro único
 * (`utils/appSettings.ts`), o mesmo que a IA consulta para orientar o usuário.
 */

import { appSettings } from "../../../utils/appSettings.js";
import { dayOf, formatClock } from "../../../services/productivityService.js";
import { confirmModal, esc, formatBytes, mount, plural } from "./panelKit.js";
import { customRow, settingHandlers, settingRow } from "./system/controls.js";
import { AppearanceTab } from "./system/appearance.js";
import { renderAccessibility, renderEditorTab } from "./system/accessibility.js";
import { renderShortcuts } from "./system/shortcuts.js";
import { TemplatesTab } from "./system/templates.js";

/** Abas da central (a ordem é a da lista lateral). */
const TABS = [
  { id: "general", label: "Geral", icon: "fa-sliders" },
  { id: "update", label: "Atualização", icon: "fa-cloud-arrow-down" },
  { separator: true },
  { id: "appearance", label: "Aparência", icon: "fa-palette" },
  { id: "accessibility", label: "Acessibilidade", icon: "fa-universal-access" },
  { id: "editor", label: "Editor", icon: "fa-pen-nib" },
  { separator: true },
  { id: "productivity", label: "Produtividade", icon: "fa-stopwatch" },
  { id: "shortcuts", label: "Atalhos", icon: "fa-keyboard" },
  { id: "templates", label: "Templates", icon: "fa-clone" },
  { id: "backup", label: "Backup", icon: "fa-box-archive" },
];

const HEADERS = {
  general: ["Geral", "Informações do app e a pasta onde ficam os seus livros."],
  update: ["Atualização", "Versão instalada, atualização automática, espaço ocupado e desinstalação."],
  appearance: ["Aparência", "Claro ou escuro, temas de cores e o fundo do chat de IA."],
  accessibility: ["Acessibilidade", "Tamanho da fonte do app, modo noturno e narrador de voz."],
  editor: ["Editor", "Tamanho e tipo de letra do texto e dos títulos no editor."],
  productivity: ["Produtividade", "O cronômetro de escrita, o gráfico por dia e os registros."],
  shortcuts: ["Atalhos de teclado", "Todos os atalhos do app. Alguns podem ser personalizados."],
  templates: ["Templates", "Os modelos de cada tipo de arquivo (personagem, evento, capítulo...), em três perfis de IA, que você pode editar."],
  backup: ["Backup", "Cópias automáticas dos livros em uma pasta (que pode ser a de um serviço de nuvem)."],
};

/**
 * Página "Central do Sistema".
 * @class
 */
export class SystemPanel {
  declare appearance: any;
  declare ctx: any;
  declare lastCheck: any;
  declare openDays: any;
  declare templates: any;
  declare title: any;
  declare updateState: any;
  declare usageCache: any;

  /**
   * @param {Object} ctx - Contexto da central.
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.title = "Central do Sistema";
    this.appearance = new AppearanceTab(ctx);
    this.templates = new TemplatesTab(ctx);
    /** Resultado da última verificação de atualização e estado da atualização automática. */
    this.lastCheck = null;
    this.updateState = { state: "idle" };
    window.electronAPI?.onUpdateStatus?.((status) => {
      this.updateState = status;
      if (ctx.isOpen?.("system")) ctx.refresh();
    });
    // Cronômetro: os registros mudaram (zerar, apagar)
    ctx.uiBus.on("productivity:changed", () => {
      if (ctx.isOpen?.("system")) ctx.refresh();
    });
  }

  /** @returns {Array<Object>} Abas laterais. */
  getTabs() {
    return TABS;
  }

  /**
   * @param {string} tab - Aba.
   * @returns {{subtitle: string, lead: string}}
   */
  getHeader(tab) {
    const [subtitle, lead] = HEADERS[tab] || ["", ""];
    return { subtitle, lead };
  }

  /**
   * Desenha a aba.
   * @param {string} tab - Aba.
   * @param {HTMLElement} el - Contêiner.
   * @returns {Promise<void>}
   */
  async render(tab, el) {
    const ctx = this.ctx;
    switch (tab) {
      case "general":
        return this.renderGeneral(el);
      case "update":
        return this.renderUpdate(el);
      case "appearance":
        return this.appearance.render(el);
      case "accessibility":
        return renderAccessibility(ctx, el);
      case "editor":
        return renderEditorTab(ctx, el);
      case "productivity":
        return this.renderProductivity(el);
      case "shortcuts":
        return renderShortcuts(ctx, el);
      case "templates":
        return this.templates.render(el);
      case "backup":
        return this.renderBackup(el);
    }
  }

  /** Fechou a central: descarta edições em andamento. @returns {void} */
  dispose() {
    this.appearance.dispose();
    this.templates.dispose?.();
  }

  // ========== Geral ========== //

  /**
   * @param {HTMLElement} el - Contêiner.
   * @returns {Promise<void>}
   * @private
   */
  async renderGeneral(el) {
    const version = await window.electronAPI.getAppVersion();
    const paths = await window.electronAPI.getPaths();
    if (this.ctx.currentTab() !== "general") return;
    mount(
      el,
      `<section class="cn-section">
         <h4>Idioma do app</h4>
         <div class="cn-setting-list">
           ${customRow("Idioma da interface", "O app está disponível só em português por enquanto. Outros idiomas virão. (O idioma da correção ortográfica é outra opção: fica em Central de Revisões → Ortografia.)", `<select class="cn-select" disabled><option>Português (Brasil)</option></select>`)}
         </div>
       </section>
       <section class="cn-section">
         <h4>Avisos</h4>
         <div class="cn-setting-list">
           ${settingRow("chat.notify")}
         </div>
       </section>
       <section class="cn-section">
         <h4>Sobre</h4>
         <div class="cn-stats">
           <div class="cn-stat"><strong>${esc(version)}</strong><span>versão instalada</span></div>
         </div>
         <p class="cn-hint">Seus livros ficam em: <strong>${esc(paths?.booksDir || "")}</strong>. ${paths?.packaged ? "É a pasta <strong>Documentos/Astra Writer</strong>, separada da instalação do app: atualizar ou reinstalar o app não apaga os livros." : "Você está no modo de desenvolvimento: aqui os livros ficam dentro da pasta do projeto. No app instalado eles ficam em Documentos/Astra Writer, fora da instalação."}</p>
       </section>`,
      settingHandlers(this.ctx, () => this.ctx.refresh()),
    );
  }

  // ========== Atualização ========== //

  /**
   * @param {HTMLElement} el - Contêiner.
   * @returns {Promise<void>}
   * @private
   */
  async renderUpdate(el) {
    const ctx = this.ctx;
    // O cálculo do espaço em disco é lento: a aba aparece logo e os tamanhos chegam depois
    const [version, live] = await Promise.all([window.electronAPI.getAppVersion(), window.electronAPI.getUpdateState()]);
    const usage = this.usageCache || null;
    if (this.ctx.currentTab() !== "update") return;
    const state = this.updateState.state !== "idle" ? this.updateState : live;
    const check = this.lastCheck;

    const verdict = (() => {
      if (state?.state === "ready") return { cls: "success", text: `Atualização ${esc(state.version || "")} baixada e pronta para instalar.`, action: `<button class="cn-btn primary" data-act="install"><i class="fa-solid fa-rotate"></i> Reiniciar e atualizar</button>` };
      if (state?.state === "downloading") return { cls: "warning", text: "Baixando uma nova versão…" };
      if (!check) return { cls: "", text: "Clique em “Verificar agora” para saber se há uma versão mais recente." };
      if (check.status === "latest") return { cls: "success", text: `Você está na versão mais recente (${esc(check.current)}).` };
      if (check.status === "available") return { cls: "warning", text: `Há uma versão mais nova: ${esc(check.latest)} (a sua é a ${esc(check.current)}).`, action: `<button class="cn-btn" data-act="open-release">Ver novidades e baixar</button>` };
      if (check.status === "none") return { cls: "", text: "Ainda não há versões publicadas no repositório (esta é a versão de desenvolvimento)." };
      return { cls: "error", text: esc(check.error || "Não foi possível verificar.") };
    })();

    const sizesHtml = (u) => `<div class="cn-stats">
      <div class="cn-stat"><strong>${u ? formatBytes(u.total) : "…"}</strong><span>total ocupado pelo app</span></div>
      <div class="cn-stat"><strong>${u ? formatBytes(u.books) : "…"}</strong><span>livros</span></div>
      <div class="cn-stat"><strong>${u ? formatBytes(u.history) : "…"}</strong><span>histórico e registros dos livros</span></div>
      <div class="cn-stat"><strong>${u ? formatBytes(u.userData) : "…"}</strong><span>dados e configurações do app</span></div>
      <div class="cn-stat"><strong>${u ? (u.install === null ? "—" : formatBytes(u.install)) : "…"}</strong><span>${u?.packaged === false ? "o app (só no instalado)" : "o app em si"}</span></div>
    </div>${u ? "" : '<p class="cn-hint">Calculando o espaço ocupado…</p>'}`;

    mount(
      el,
      `<section class="cn-section">
         <h4>Versão</h4>
         <div class="cn-stats"><div class="cn-stat ${verdict.cls}"><strong>${esc(version)}</strong><span>versão instalada</span></div></div>
         <p class="cn-hint">${verdict.text}</p>
         <div class="cn-row">
           <button class="cn-btn" data-act="check"><i class="fa-solid fa-magnifying-glass"></i> Verificar agora</button>
           ${verdict.action || ""}
         </div>
         <div class="cn-setting-list" style="margin-top:10px">
           ${settingRow("updates.auto", { hint: "Procura e baixa novas versões ao abrir o app e avisa quando uma estiver pronta. Só funciona no app instalado." })}
         </div>
       </section>
       <section class="cn-section">
         <h4>Espaço em disco</h4>
         <div id="usage-box">${sizesHtml(usage)}</div>
       </section>
       <section class="cn-section">
         <h4>Desinstalar</h4>
         <p class="cn-hint">Remove o app deste computador. Seus livros ficam guardados na pasta de livros e continuam lá; ao reinstalar, o app os encontra. Antes de desinstalar você pode exportar uma cópia de todos os livros.</p>
         <div class="cn-row"><button class="cn-btn danger" data-act="uninstall" id="uninstall-btn" ${usage?.packaged ? "" : "disabled"}><i class="fa-solid fa-trash-can"></i> Desinstalar o app…</button>
           <span class="cn-hint" id="uninstall-hint">${usage?.packaged ? "" : "Disponível só no app instalado (Windows)."}</span></div>
       </section>`,
      {
        ...settingHandlers(ctx, () => ctx.refresh()),
        check: async (btn) => {
          btn.disabled = true;
          this.lastCheck = await window.electronAPI.checkUpdate();
          ctx.refresh();
        },
        install: () => window.electronAPI.installUpdate(),
        "open-release": () => window.electronAPI.openExternal(this.lastCheck?.url),
        uninstall: () => this.askUninstall(),
      },
    );
    window.electronAPI.appDiskUsage().then((u) => {
      this.usageCache = u;
      if (ctx.currentTab() !== "update") return;
      const box = el.querySelector("#usage-box");
      if (box) box.innerHTML = sizesHtml(u);
      const btn = el.querySelector("#uninstall-btn");
      if (btn) btn.disabled = !u.packaged;
      const hint = el.querySelector("#uninstall-hint");
      if (hint) hint.textContent = u.packaged ? "" : "Disponível só no app instalado (Windows).";
    });
    // A verificação automática liga/desliga junto com o switch
    el.querySelector('[data-id="updates.auto"]')?.addEventListener("change", (e) => window.electronAPI.configureAutoUpdate(e.target.checked));
  }

  /**
   * Janela de confirmação da desinstalação (com a opção de exportar os livros antes).
   * @returns {void}
   * @private
   */
  askUninstall() {
    this.ctx.uiBus.emit("modal:open", {
      id: "uninstall-modal",
      title: "Desinstalar o Astra Writer?",
      content: `<div class="cn-confirm">
        <p>O app será removido deste computador e fechado agora.</p>
        <p><strong>Seus livros não são apagados:</strong> eles ficam na pasta de livros e o app reinstalado os encontra. Se preferir ter uma cópia em outro lugar, exporte antes.</p>
      </div>`,
      buttons: [
        { text: "Cancelar", class: "btn-secondary" },
        {
          text: "Exportar meus livros primeiro",
          class: "btn-secondary",
          onClick: async () => {
            const result = await window.electronAPI.exportAllBooks();
            if (result?.canceled) return;
            this.ctx.toast(result?.success ? `${plural(result.count, "livro exportado", "livros exportados")} em ${result.folder}.` : result?.error || "Falha ao exportar.", result?.success ? "success" : "error");
          },
        },
        {
          text: "Desinstalar",
          class: "btn-danger",
          onClick: async (modal) => {
            modal.close();
            const result = await window.electronAPI.uninstallApp();
            if (!result?.success) this.ctx.toast(result?.error || "Não foi possível desinstalar.", "error");
          },
        },
      ],
    });
  }

  // ========== Produtividade ========== //

  /**
   * @param {HTMLElement} el - Contêiner.
   * @returns {void}
   * @private
   */
  renderProductivity(el) {
    const ctx = this.ctx;
    const service = ctx.services.productivity;
    const days = service.dailyTotals();
    const today = days.find((d) => d.day === dayOf(Date.now()))?.ms || 0;
    const week = days.filter((d) => Date.now() - new Date(`${d.day}T12:00:00`).getTime() < 7 * 86_400_000).reduce((s, d) => s + d.ms, 0);
    const total = days.reduce((s, d) => s + d.ms, 0);
    const hours = (ms) => `${(ms / 3_600_000).toFixed(ms >= 3_600_000 ? 1 : 2)} h`;

    const shown = days.slice(-30);
    const maxMs = Math.max(1, ...shown.map((d) => d.ms));
    // Gráfico de linha: x por dia de uso, y em horas
    const W = 640, H = 200, L = 38, R = 14, T = 14, B = 28;
    const x = (i) => (shown.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (shown.length - 1));
    const y = (ms) => T + (1 - ms / maxMs) * (H - T - B);
    const pts = shown.map((d, i) => `${x(i).toFixed(1)},${y(d.ms).toFixed(1)}`);
    const grid = [0, 0.5, 1]
      .map((f) => {
        const ms = maxMs * f;
        return `<line x1="${L}" x2="${W - R}" y1="${y(ms).toFixed(1)}" y2="${y(ms).toFixed(1)}" class="cn-line-grid" /><text x="${L - 6}" y="${(y(ms) + 3).toFixed(1)}" text-anchor="end" class="cn-bar-label">${hours(ms)}</text>`;
      })
      .join("");
    const step = Math.max(1, Math.ceil(shown.length / 8));
    const labels = shown
      .map((d, i) => (i % step === 0 || i === shown.length - 1 ? `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="cn-bar-label">${d.day.slice(8)}/${d.day.slice(5, 7)}</text>` : ""))
      .join("");
    const dots = shown.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.ms).toFixed(1)}" r="4" class="cn-line-dot" data-i="${i}"></circle>`).join("");
    const area = shown.length > 1 ? `<polygon points="${x(0).toFixed(1)},${H - B} ${pts.join(" ")} ${x(shown.length - 1).toFixed(1)},${H - B}" class="cn-line-area" />` : "";
    const chart = shown.length
      ? `<div class="cn-chart-wrap"><svg class="cn-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tempo de escrita por dia">${grid}${area}<polyline points="${pts.join(" ")}" class="cn-line-path" />${dots}${labels}</svg><div class="cn-chart-tip" hidden></div></div>`
      : '<div class="cn-empty">Ainda não há tempo registrado. Ative o cronômetro acima e use-o: os dias de uso aparecem aqui.</div>';

    // Registros agrupados por dia (vários no mesmo dia: média e seta para expandir)
    const byDay = new Map();
    for (const r of [...service.records].filter((r) => r.activeMs > 0).sort((x, y) => String(y.start).localeCompare(String(x.start)))) {
      if (!byDay.has(r.day)) byDay.set(r.day, []);
      byDay.get(r.day).push(r);
    }
    const recRow = (r, sub = false) => {
      const start = new Date(r.start);
      return `<tr class="${sub ? "cn-sub" : ""}"><td>${sub ? "" : start.toLocaleDateString("pt-BR")}</td><td>${start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td><td>${formatClock(r.activeMs)}${service.current?.id === r.id ? ' <span class="cn-pill success">em andamento</span>' : ""}</td><td style="text-align:right"><button class="cn-btn small ghost" data-act="del" data-id="${esc(r.id)}" title="Apagar este registro"><i class="fa-regular fa-trash-can"></i></button></td></tr>`;
    };
    const groups = [...byDay.entries()].slice(0, 60).map(([day, list]) => {
      if (list.length === 1) return recRow(list[0]);
      const total = list.reduce((s, r) => s + r.activeMs, 0);
      const open = this.openDays?.has(day);
      const [yy, mm, dd] = day.split("-");
      return `<tr class="cn-day-row"><td><button class="cn-btn small ghost cn-day-toggle" data-act="toggle-day" data-day="${day}" aria-expanded="${open ? "true" : "false"}" title="${open ? "Recolher" : "Ver os registros do dia"}"><i class="fa-solid fa-chevron-${open ? "down" : "right"}"></i> ${dd}/${mm}/${yy}</button></td><td>${list.length} registros</td><td>média ${formatClock(total / list.length)} · total ${formatClock(total)}</td><td></td></tr>${open ? list.map((r) => recRow(r, true)).join("") : ""}`;
    });
    const list = groups.length
      ? `<table class="cn-table"><thead><tr><th>Dia</th><th>Início</th><th>Duração</th><th></th></tr></thead><tbody>${groups.join("")}</tbody></table>`
      : '<p class="cn-hint">Nenhum registro.</p>';
    const records = byDay.size ? [1] : [];

    const root = mount(
      el,
      `<section class="cn-section">
         <h4>Cronômetro</h4>
         <div class="cn-setting-list">
           ${settingRow("productivity.enabled")}
           ${settingRow("productivity.auto")}
           ${settingRow("productivity.goalMinutes")}
           ${settingRow("productivity.idleMinutes")}
         </div>
         <p class="cn-hint">O cronômetro fica desligado até você ativá-lo: então ele aparece entre as abas e a busca do explorer. Manual: você inicia e pausa. Automático: conta sozinho enquanto você está no app e para quando a janela perde o foco ou você fica parado. Cada registro dura até fechar o app ou apertar “zerar” (que para o relógio e espera você dar play de novo). Com uma **meta de tempo**, o relógio conta de forma regressiva e, ao zerar, toca um som suave e mostra um aviso positivo; o modo Auto continua pausando quando você se ausenta.</p>
       </section>
       <section class="cn-section">
         <h4>Tempo de escrita</h4>
         <div class="cn-stats">
           <div class="cn-stat"><strong>${hours(today)}</strong><span>hoje</span></div>
           <div class="cn-stat"><strong>${hours(week)}</strong><span>últimos 7 dias</span></div>
           <div class="cn-stat"><strong>${hours(total)}</strong><span>no total (${plural(days.length, "dia", "dias")} de uso)</span></div>
         </div>
         ${chart}
       </section>
       <section class="cn-section">
         <h4>Registros</h4>
         ${list}
         <div class="cn-row"><button class="cn-btn small danger" data-act="del-all" ${records.length ? "" : "disabled"}>Apagar todos os registros</button></div>
       </section>`,
      {
        ...settingHandlers(ctx, () => ctx.refresh()),
        "toggle-day": (btn) => {
          this.openDays = this.openDays || new Set();
          const d = btn.dataset.day;
          this.openDays.has(d) ? this.openDays.delete(d) : this.openDays.add(d);
          ctx.refresh();
        },
        del: (btn) => {
          service.deleteRecord(btn.dataset.id);
          ctx.refresh();
        },
        "del-all": () =>
          confirmModal(ctx.uiBus, {
            title: "Apagar todos os registros?",
            danger: true,
            confirmText: "Apagar",
            html: "<p>Todo o histórico de tempo de escrita será apagado. Isso não pode ser desfeito.</p>",
            onConfirm: () => {
              service.clearRecords();
              ctx.refresh();
            },
          }),
      },
    );
    this.attachChartTip(root, shown, x, y);
  }

  /**
   * Tooltip do gráfico: segue o cursor e mostra o valor do dia mais próximo.
   * @param {HTMLElement} root - Raiz da aba.
   * @param {Array<{day: string, ms: number}>} shown - Dias do gráfico.
   * @param {(i: number) => number} x - Posição x (no sistema do SVG) do dia.
   * @param {(ms: number) => number} y - Posição y (no sistema do SVG) do valor.
   * @returns {void}
   * @private
   */
  attachChartTip(root, shown, x, y) {
    const wrap = root.querySelector(".cn-chart-wrap");
    if (!wrap) return;
    const svg = wrap.querySelector("svg");
    const tip = wrap.querySelector(".cn-chart-tip");
    const dots = [...svg.querySelectorAll(".cn-line-dot")];
    const hide = () => {
      tip.hidden = true;
      dots.forEach((d) => d.classList.remove("hover"));
    };
    wrap.addEventListener("mouseleave", hide);
    wrap.addEventListener("mousemove", (e) => {
      const box = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      // Posição do mouse no sistema de coordenadas do SVG (o desenho é escalado, sem distorção)
      const px = ((e.clientX - box.left) / box.width) * vb.width;
      let best = 0;
      shown.forEach((_, i) => {
        if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
      });
      const d = shown[best];
      dots.forEach((dot, i) => dot.classList.toggle("hover", i === best));
      const [, mm, dd] = d.day.split("-");
      const h = Math.floor(d.ms / 3_600_000);
      const min = Math.round((d.ms % 3_600_000) / 60_000);
      tip.innerHTML = `<strong>${dd}/${mm}</strong><span>${h ? `${h} h ` : ""}${min} min</span><small>${formatClock(d.ms)}</small>`;
      tip.hidden = false;
      const wb = wrap.getBoundingClientRect();
      let left = e.clientX - wb.left + 14;
      if (left + tip.offsetWidth > wb.width) left = e.clientX - wb.left - tip.offsetWidth - 14;
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(0, e.clientY - wb.top - tip.offsetHeight - 10)}px`;
    });
  }

  // ========== Backup ========== //

  /**
   * @param {HTMLElement} el - Contêiner.
   * @returns {void}
   * @private
   */
  renderBackup(el) {
    const ctx = this.ctx;
    const folder = appSettings.get("backup.folder");
    const last = appSettings.get("backup.lastAt");
    mount(
      el,
      `<section class="cn-section">
         <h4>Pasta de backup</h4>
         <p class="cn-hint">Escolha uma pasta. Dentro dela o app guarda um zip de cada livro (com os rascunhos ainda não sincronizados). Se a pasta estiver dentro do <strong>Google Drive</strong>, do <strong>OneDrive</strong> ou do <strong>Dropbox</strong> instalados no computador, as cópias também sobem para a nuvem, sem nenhum login no app.</p>
         <div class="cn-row">
           <input class="cn-input" readonly value="${esc(folder)}" placeholder="Nenhuma pasta escolhida" style="flex:1;min-width:280px" />
           <button class="cn-btn" data-act="choose"><i class="fa-regular fa-folder-open"></i> Escolher pasta…</button>
           <button class="cn-btn ghost" data-act="default-folder" title="Voltar para Documentos/Astra Writer/backups">Usar a pasta padrão</button>
         </div>
         <p class="cn-hint">A pasta padrão é <strong>Documentos/Astra Writer/backups</strong>, ao lado dos seus livros (no app instalado). Você pode trocá-la por qualquer outra.</p>
       </section>
       <section class="cn-section">
         <h4>Backup automático</h4>
         <div class="cn-setting-list">
           ${settingRow("backup.auto", { disabled: !folder, hint: folder ? undefined : "Escolha uma pasta de backup primeiro." })}
           ${settingRow("backup.everyHours")}
           ${settingRow("backup.keep")}
         </div>
         <p class="cn-hint">${last ? `Último backup: ${new Date(last).toLocaleString("pt-BR")}.` : "Nenhum backup feito ainda."}</p>
         <div class="cn-row"><button class="cn-btn primary" data-act="run" ${folder ? "" : "disabled"}><i class="fa-solid fa-box-archive"></i> Fazer backup agora</button></div>
       </section>`,
      {
        ...settingHandlers(ctx, () => ctx.refresh()),
        "default-folder": async () => {
          const paths = await window.electronAPI.getPaths();
          if (paths?.backupsDir) appSettings.set("backup.folder", paths.backupsDir);
          ctx.refresh();
        },
        choose: async () => {
          const picked = await window.electronAPI.selectFolder();
          if (!picked) return;
          appSettings.set("backup.folder", picked);
          ctx.refresh();
        },
        run: async (btn) => {
          btn.disabled = true;
          const result = await ctx.services.backup.runNow();
          ctx.toast(result.success ? `Backup concluído: ${plural(result.count, "livro", "livros")}.` : result.error || "Falha no backup.", result.success ? "success" : "error");
          ctx.refresh();
        },
      },
    );
  }
}
