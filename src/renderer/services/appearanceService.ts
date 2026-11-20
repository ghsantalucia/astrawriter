// @ts-nocheck
/**
 * @file Aplica as configurações de aparência e acessibilidade do app: zoom (tamanho da fonte do app), tema de cores,
 * modo noturno (filtro amarelado agendado), fontes do editor e cor da barra de título. Tudo é lido de `appSettings` e
 * reaplicado quando uma configuração muda.
 */

import { uiBus } from "../events/uiBus.js";
import { appSettings } from "../utils/appSettings.js";
import { applyThemeCss, findTheme } from "../utils/themes.js";

/**
 * Minutos desde a meia-noite de um horário `HH:MM`.
 * @param {string} hhmm - Horário.
 * @returns {number}
 */
function minutesOf(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * O horário atual está dentro do intervalo (que pode atravessar a meia-noite)?
 * @param {string} from - Início `HH:MM`.
 * @param {string} to - Fim `HH:MM`.
 * @param {Date} [now] - Agora.
 * @returns {boolean}
 */
export function inNightWindow(from, to, now = new Date()) {
  const a = minutesOf(from);
  const b = minutesOf(to);
  const n = now.getHours() * 60 + now.getMinutes();
  if (a === b) return false;
  return a < b ? n >= a && n < b : n >= a || n < b;
}

/**
 * Serviço de aparência.
 * @class
 */
export class AppearanceService {
  constructor() {
    this.nightTimer = null;
    this.nightPreview = false;
  }

  /**
   * Aplica tudo e passa a acompanhar as mudanças.
   * @returns {void}
   */
  init() {
    // O tema claro/escuro e o tema de cores têm donos próprios (ThemeManager e este serviço): as configurações apontam para eles
    const theme = appSettings.def("ui.theme");
    theme.get = () => (document.body.classList.contains("dark-theme") ? "dark" : "light");
    theme.set = (value) => uiBus.emit("theme:toggle", { value: value === "dark" });
    const preset = appSettings.def("ui.themePreset");
    preset.get = () => findTheme(appSettings.values["ui.themePreset"])?.id || preset.default;
    preset.set = (value) => {
      if (!findTheme(value)) throw new Error(`Tema "${value}" não encontrado.`);
      appSettings.values["ui.themePreset"] = value;
      appSettings.save();
    };

    this.applyZoom();
    this.applyColorTheme();
    this.applyEditorFonts();
    this.refreshNight();
    this.nightTimer = setInterval(() => this.refreshNight(), 30_000);

    uiBus.on("app-settings:changed", ({ id }) => {
      if (id === "ui.zoom") this.applyZoom();
      else if (id === "ui.themePreset" || id === "themes.custom") this.applyColorTheme();
      else if (id.startsWith("editor.font")) this.applyEditorFonts();
      else if (id.startsWith("ui.night")) this.refreshNight();
    });
    // Trocou entre claro e escuro: a barra de título acompanha as cores do tema
    uiBus.on("theme:changed", () => this.syncTitleBar());
  }

  /** Zoom de toda a interface. @returns {void} */
  applyZoom() {
    window.electronAPI?.setZoomFactor?.(appSettings.get("ui.zoom") / 100);
  }

  /** Aplica o tema de cores escolhido (ou o padrão). @returns {void} */
  applyColorTheme() {
    applyThemeCss(findTheme(appSettings.get("ui.themePreset")) || null);
    // O navegador calcula as variáveis depois de aplicar o estilo
    requestAnimationFrame(() => this.syncTitleBar());
  }

  /**
   * Prévia de um tema ainda não salvo (editor de temas). `null` volta ao tema escolhido.
   * @param {Object|null} theme - Tema em edição.
   * @returns {void}
   */
  previewTheme(theme) {
    if (theme) applyThemeCss(theme);
    else this.applyColorTheme();
  }

  /**
   * Barra de título nativa (Windows) com as cores do tema atual.
   * @returns {void}
   */
  syncTitleBar() {
    const style = getComputedStyle(document.body);
    const color = style.getPropertyValue("--bg-header").trim();
    const symbolColor = style.getPropertyValue("--text").trim();
    window.electronAPI?.setNativeTheme?.(document.body.classList.contains("dark-theme"), { color, symbolColor });
  }

  /** Fontes e tamanho do texto do editor (variáveis aplicadas por uma folha de estilo própria). @returns {void} */
  applyEditorFonts() {
    let style = document.getElementById("astra-editor-fonts");
    if (!style) {
      style = document.createElement("style");
      style.id = "astra-editor-fonts";
      document.head.appendChild(style);
    }
    const size = appSettings.get("editor.fontSize");
    const body = appSettings.get("editor.fontBody");
    const heading = appSettings.get("editor.fontHeading");
    // Só letras, números, espaços, vírgulas, aspas e hífens: o nome digitado nunca vira CSS
    const safe = (font) => (font && font !== "default" && /^[\p{L}\p{N}\s,'"\-.]+$/u.test(font) ? font : null);
    const rules = [];
    rules.push(`.toastui-editor-contents { font-size: ${size}px !important; ${safe(body) ? `font-family: ${safe(body)} !important;` : ""} }`);
    rules.push(`.toastui-editor-contents p, .toastui-editor-contents li { font-size: ${size}px !important; }`);
    if (safe(body)) rules.push(`.toastui-editor-contents p, .toastui-editor-contents li, .toastui-editor-contents td { font-family: ${safe(body)} !important; }`);
    if (safe(heading)) rules.push(`.toastui-editor-contents h1, .toastui-editor-contents h2, .toastui-editor-contents h3, .toastui-editor-contents h4, .toastui-editor-contents h5, .toastui-editor-contents h6 { font-family: ${safe(heading)} !important; }`);
    style.textContent = rules.join("\n");
  }

  /**
   * Liga ou desliga o filtro do modo noturno conforme o horário (ou a prévia).
   * @returns {void}
   */
  refreshNight() {
    let overlay = document.getElementById("night-filter");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "night-filter";
      overlay.setAttribute("aria-hidden", "true");
      document.body.appendChild(overlay);
    }
    const enabled = appSettings.get("ui.night.enabled");
    const active = this.nightPreview || (enabled && inNightWindow(appSettings.get("ui.night.from"), appSettings.get("ui.night.to")));
    const intensity = appSettings.get("ui.night.intensity") / 100;
    overlay.style.setProperty("--night-alpha", String(intensity));
    overlay.classList.toggle("active", Boolean(active));
  }

  /**
   * Mostra o filtro agora, para o usuário testar a intensidade (sem salvar nada).
   * @param {boolean} on - Prévia ligada?
   * @returns {void}
   */
  previewNight(on) {
    this.nightPreview = on;
    this.refreshNight();
  }
}
