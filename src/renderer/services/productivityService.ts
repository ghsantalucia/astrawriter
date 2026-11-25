/**
 * @file Cronômetro de produtividade (entre as abas e a busca do explorer): conta o tempo em que o autor está de fato no
 * app. Manual (play/pause) ou automático (liga ao haver atividade; para sozinho com a janela sem foco ou depois de alguns
 * minutos sem mexer o mouse nem o teclado, e volta quando o autor volta). Cada registro vai do início da contagem até
 * fechar o app ou apertar "zerar"; os registros ficam no armazenamento local, com o total por dia na Central do Sistema.
 */

import { uiBus } from "../events/uiBus.js";
import { appSettings } from "../utils/appSettings.js";
import { t } from "../../shared/i18n.js";

const KEY = "astra.productivity.v1";

/**
 * Data local `YYYY-MM-DD`.
 * @param {Date|string|number} d - Data.
 * @returns {string}
 */
export function dayOf(d) {
  const date = new Date(d);
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/**
 * Tempo `HH:MM:SS`.
 * @param {number} ms - Milissegundos.
 * @returns {string}
 */
export function formatClock(ms) {
  const s = Math.floor(ms / 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/**
 * Serviço do cronômetro.
 * @class
 */
export class ProductivityService {
  declare current: any;
  declare focused: any;
  declare goalDone: any;
  declare last: any;
  declare lastActivity: any;
  declare manualPaused: any;
  declare records: any;
  declare timer: any;

  constructor() {
    this.records = this.load();
    // Um registro que ficou aberto (o app foi fechado) termina onde parou
    for (const r of this.records) {
      if (r.open) {
        r.open = false;
        r.end = r.end || r.start;
      }
    }
    this.current = null;
    /** Pausa pedida pelo autor (vale também no modo automático, até ele apertar play). */
    this.manualPaused = true;
    this.focused = typeof document !== "undefined" ? document.hasFocus() : true;
    this.lastActivity = Date.now();
    this.last = Date.now();
    this.timer = null;
    /** Meta cumprida na contagem atual (o relógio fica parado até o autor zerar ou dar play de novo). */
    this.goalDone = false;
    this.save();
  }

  /** @returns {Array<Object>} Registros salvos. @private */
  load() {
    try {
      const list = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  /** Grava os registros. @private */
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.records.slice(-1000)));
    } catch {
      // sem armazenamento: vale só nesta sessão
    }
  }

  /**
   * Começa a contar e a acompanhar a atividade do autor.
   * @returns {void}
   */
  start() {
    // Modo automático: começa a contar sozinho
    this.manualPaused = !appSettings.get("productivity.auto") || !appSettings.get("productivity.enabled");
    const bump = () => {
      this.lastActivity = Date.now();
    };
    for (const ev of ["mousemove", "mousedown", "keydown", "wheel", "touchstart"]) {
      document.addEventListener(ev, bump, { capture: true, passive: true });
    }
    window.addEventListener("focus", () => {
      this.focused = true;
      this.lastActivity = Date.now();
    });
    window.addEventListener("blur", () => {
      this.focused = false;
    });
    window.addEventListener("beforeunload", () => this.closeRecord());
    uiBus.on("productivity:toggle", () => this.toggle());
    uiBus.on("productivity:reset", () => this.reset());
    uiBus.on("productivity:auto", () => this.setAuto(!appSettings.get("productivity.auto")));
    uiBus.on("app-settings:changed", ({ id }) => {
      if (id === "productivity.auto") this.manualPaused = !appSettings.get("productivity.auto");
      if (id === "productivity.enabled" && appSettings.get("productivity.enabled")) this.manualPaused = !appSettings.get("productivity.auto");
      if (id === "productivity.enabled" && !appSettings.get("productivity.enabled")) this.reset();
      this.render();
    });
    this.last = Date.now();
    this.timer = setInterval(() => this.tick(), 1000);
    this.render();
  }

  /** @returns {boolean} O autor está presente (com foco e sem passar do tempo de inatividade)? */
  present() {
    const idle = appSettings.get("productivity.idleMinutes") * 60_000;
    return this.focused && Date.now() - this.lastActivity < idle;
  }

  /**
   * Estado do cronômetro: `running`, `paused` (pelo autor), `away` (ausente) ou `idle` (nada contado ainda).
   * @returns {"running"|"paused"|"away"}
   */
  status() {
    if (this.manualPaused) return "paused";
    // Sempre exige a janela com foco; no automático, também a atividade recente
    if (!this.focused) return "away";
    if (appSettings.get("productivity.auto") && !this.present()) return "away";
    return "running";
  }

  /** Passa um segundo. @private */
  tick() {
    const now = Date.now();
    const delta = Math.min(now - this.last, 5000);
    this.last = now;
    if (this.status() === "running") {
      if (!this.current) {
        this.current = { id: `${now.toString(36)}`, start: new Date(now).toISOString(), end: new Date(now).toISOString(), activeMs: 0, day: dayOf(now), open: true };
        this.records.push(this.current);
      }
      this.current.activeMs += delta;
      this.current.end = new Date(now).toISOString();
      // Meta de tempo: ao chegar no fim, encerra a contagem com um som suave e um aviso positivo
      const goalMs = this.goalMs();
      if (goalMs > 0 && this.current.activeMs >= goalMs) {
        this.current.activeMs = goalMs;
        this.closeRecord();
        this.manualPaused = true;
        this.goalDone = true;
        this.chime();
        uiBus.emit("toast:show", { message: t("Meta de tempo concluída! Bom trabalho."), type: "success" });
        uiBus.emit("productivity:changed");
      }
      // Grava de tempos em tempos (um fechamento brusco não perde o registro)
      if (this.current && Math.floor(this.current.activeMs / 1000) % 10 === 0) this.save();
    }
    this.render();
    uiBus.emit("productivity:tick", { ms: this.current?.activeMs || 0, status: this.status() });
  }

  /** Fecha o registro atual. @private */
  closeRecord() {
    if (this.current) {
      this.current.open = false;
      this.current.end = new Date().toISOString();
      this.current = null;
    }
    this.save();
  }

  /** @returns {number} Meta em milissegundos (0 = sem meta, o relógio conta para a frente). */
  goalMs() {
    return Math.max(0, Number(appSettings.get("productivity.goalMinutes")) || 0) * 60_000;
  }

  /**
   * Som suave de conclusão (duas notas, sintetizado: não depende de arquivo de áudio).
   * @returns {void}
   * @private
   */
  chime() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const start = ctx.currentTime + 0.02;
      [[523.25, 0], [783.99, 0.28], [1046.5, 0.56]].forEach(([freq, at]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start + at);
        gain.gain.exponentialRampToValueAtTime(0.18, start + at + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.9);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start + at);
        osc.stop(start + at + 1);
      });
      setTimeout(() => ctx.close?.(), 2500);
    } catch {
      // sem áudio: só o aviso visual
    }
  }

  /** Play/pause do autor. @returns {void} */
  toggle() {
    // Depois de cumprir a meta, o play começa uma nova contagem
    if (this.goalDone) this.goalDone = false;
    this.manualPaused = !this.manualPaused;
    this.last = Date.now();
    if (!this.manualPaused) this.lastActivity = Date.now();
    this.render();
  }

  /** Zera o cronômetro (funciona como "stop"): o registro atual termina e a contagem espera o autor apertar play. @returns {void} */
  reset() {
    this.closeRecord();
    this.goalDone = false;
    this.manualPaused = true;
    this.render();
    uiBus.emit("productivity:changed");
  }

  /**
   * Liga ou desliga o modo automático.
   * @param {boolean} on - Automático?
   * @returns {void}
   */
  setAuto(on) {
    appSettings.set("productivity.auto", on);
  }

  /**
   * Apaga um registro (se for o atual, o cronômetro recomeça do zero).
   * @param {string} id - Id do registro.
   * @returns {void}
   */
  deleteRecord(id) {
    if (this.current?.id === id) this.current = null;
    this.records = this.records.filter((r) => r.id !== id);
    this.save();
    uiBus.emit("productivity:changed");
  }

  /** Apaga todos os registros. @returns {void} */
  clearRecords() {
    this.current = null;
    this.records = [];
    this.save();
    uiBus.emit("productivity:changed");
  }

  /**
   * Total por dia, só dos dias de uso (soma dos registros do mesmo dia).
   * @returns {Array<{day: string, ms: number}>}
   */
  dailyTotals() {
    const byDay = new Map();
    for (const r of this.records) {
      if (!r.activeMs) continue;
      byDay.set(r.day, (byDay.get(r.day) || 0) + r.activeMs);
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, ms]) => ({ day, ms }));
  }

  /** Atualiza a faixa do explorer. @private */
  render() {
    const bar = document.getElementById("productivity-bar");
    if (!bar) return;
    // O cronômetro só aparece na interface quando o autor o ativa (Central do Sistema → Produtividade)
    bar.hidden = !appSettings.get("productivity.enabled");
    const status = this.status();
    bar.dataset.status = status;
    const goalMs = this.goalMs();
    const spent = this.current?.activeMs || 0;
    bar.dataset.goal = goalMs > 0 ? (this.goalDone ? "done" : "on") : "off";
    bar.style.setProperty("--goal-progress", goalMs > 0 ? `${Math.min(100, ((this.goalDone ? goalMs : spent) / goalMs) * 100).toFixed(1)}%` : "0%");
    const time = document.getElementById("prod-time");
    // Com meta, o relógio mostra o tempo que falta; sem meta, o tempo contado
    if (time) time.textContent = formatClock(goalMs > 0 ? (this.goalDone ? 0 : Math.max(0, goalMs - spent)) : spent);
    const toggle = document.getElementById("prod-toggle");
    if (toggle) {
      toggle.innerHTML = `<i class="fa-solid ${this.manualPaused ? "fa-play" : "fa-pause"}"></i>`;
      toggle.title = this.manualPaused ? t("Iniciar o cronômetro") : t("Pausar o cronômetro");
    }
    const auto = document.getElementById("prod-auto");
    if (auto) {
      auto.classList.toggle("on", Boolean(appSettings.get("productivity.auto")));
      auto.title = t("Automático: o cronômetro para quando você se ausenta (janela sem foco ou parado) e volta quando você volta");
    }
    const label = document.getElementById("prod-status");
    if (label) {
      label.textContent = this.goalDone ? t("meta cumprida ✓") : status === "running" ? (goalMs > 0 ? t("faltam") : t("contando")) : status === "away" ? t("ausente") : goalMs > 0 ? t("meta {minutes} min", { minutes: Math.round(goalMs / 60000) }) : t("pausado");
    }
  }
}
