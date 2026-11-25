/**
 * @file Aba "Aparência" da Central do Sistema: tema claro/escuro, temas de cores (predefinidos e do usuário, com editor
 * gráfico de cores) e o tema do chat de IA (4 fundos, cada um com cores personalizáveis).
 */

import { appSettings } from "../../../../utils/appSettings.js";
import {
  BASE_COLORS,
  THEME_VARS,
  allThemes,
  deleteCustomTheme,
  findTheme,
  saveCustomTheme,
} from "../../../../utils/themes.js";
import {
  CHAT_BG_MODES,
  CHAT_COLOR_FIELDS,
  getChatBackground,
  getColor,
  getExtraColors,
  setChatBackgroundColor,
  setChatBackgroundMode,
  setExtraColor,
} from "../../../../utils/chatBackground.js";
import { confirmModal, esc, mount, switchRow } from "../panelKit.js";
import { settingHandlers } from "./controls.js";
import { t } from "../../../../../shared/i18n.js";

/** Cores mostradas na miniatura de cada tema. */
const SWATCH = ["--bg-sidebar", "--bg-editor", "--surface", "--accent", "--text"];

/**
 * Aba Aparência.
 * @class
 */
export class AppearanceTab {
  declare ctx: any;
  declare editing: any;

  /** @param {Object} ctx - Contexto da central. */
  constructor(ctx) {
    this.ctx = ctx;
    /** Tema em edição (`{id?, name, light, dark}`) ou null. */
    this.editing = null;
  }

  /** @returns {Object} Serviço de aparência. */
  get appearance() {
    return this.ctx.services.appearance;
  }

  /**
   * Desenha a aba.
   * @param {HTMLElement} el - Contêiner.
   * @returns {void}
   */
  render(el) {
    if (this.editing) return this.renderEditor(el);
    const dark = document.body.classList.contains("dark-theme");
    const active = appSettings.get("ui.themePreset");
    const mode = dark ? "dark" : "light";

    const card = (theme) => `
      <div class="cn-theme ${theme.id === active ? "active" : ""}">
        <div class="cn-theme-swatch">${SWATCH.map((v) => `<span style="background:${esc(theme[mode][v])}"></span>`).join("")}</div>
        <strong>${esc(theme.name)}${theme.id === active ? ` <small class="cn-pill success">${t("em uso")}</small>` : ""}</strong>
        <small>${esc(theme.description || t("Tema criado por você."))}</small>
        <div class="cn-row" style="gap:6px;margin-top:6px">
          <button class="cn-btn small ${theme.id === active ? "" : "primary"}" data-act="use" data-id="${esc(theme.id)}" ${theme.id === active ? "disabled" : ""}>${t("Usar")}</button>
          <button class="cn-btn small ghost" data-act="copy" data-id="${esc(theme.id)}" title="${t("Criar um tema novo a partir deste")}">${t("Duplicar")}</button>
          ${theme.builtin ? "" : `<button class="cn-btn small ghost" data-act="edit" data-id="${esc(theme.id)}">${t("Editar")}</button><button class="cn-btn small ghost" data-act="delete" data-id="${esc(theme.id)}" title="${t("Excluir")}"><i class="fa-regular fa-trash-can"></i></button>`}
        </div>
      </div>`;

    const root = mount(
      el,
      `<section class="cn-section">
         <h4>${t("Claro ou escuro")}</h4>
         <div class="cn-setting-list">
           ${switchRow({ attrs: 'data-change="dark"', checked: dark, title: t("Modo escuro"), hint: t("Alterna entre o tema claro e o escuro (vale para qualquer tema de cores).") })}
         </div>
       </section>
       <section class="cn-section">
         <h4>${t("Temas de cores")}</h4>
         <p class="cn-hint">${t("Escolha um tema pronto ou crie o seu a partir de uma cópia. Um tema é só um conjunto de cores (para o modo claro e para o escuro): ele nunca muda o funcionamento do app.")}</p>
         <div class="cn-theme-grid">${allThemes().map(card).join("")}</div>
         <div class="cn-row"><button class="cn-btn" data-act="new"><i class="fa-solid fa-plus"></i> ${t("Criar tema")}</button></div>
       </section>
       <section class="cn-section">
         <h4>${t("Tema do chat de IA")}</h4>
         <p class="cn-hint">${t("O fundo do chat tem 4 opções, e cada uma tem as próprias cores. Escolha um fundo para o tema escuro e outro para o claro.")}</p>
         ${["dark", "light"].map((theme) => this.chatThemeHtml(theme)).join("")}
       </section>`,
      {
        ...settingHandlers(this.ctx),
        dark: (input) => this.ctx.uiBus.emit("theme:toggle", { value: input.checked }),
        use: (btn) => {
          appSettings.set("ui.themePreset", btn.dataset.id);
          this.ctx.refresh();
        },
        new: () => this.startEditing(findTheme("astra"), true),
        copy: (btn) => this.startEditing(findTheme(btn.dataset.id), true),
        edit: (btn) => this.startEditing(findTheme(btn.dataset.id), false),
        delete: (btn) => {
          const theme = findTheme(btn.dataset.id);
          confirmModal(this.ctx.uiBus, {
            title: t("Excluir tema?"),
            danger: true,
            confirmText: t("Excluir"),
            html: `<p>${t("O tema <strong>{name}</strong> será excluído. Se estiver em uso, o app volta ao tema Astra.", { name: esc(theme?.name) })}</p>`,
            onConfirm: () => {
              deleteCustomTheme(btn.dataset.id);
              this.ctx.refresh();
            },
          });
        },
        "chat-mode": (select) => {
          setChatBackgroundMode(select.dataset.theme, select.value);
          this.ctx.uiBus.emit("chat-bg:apply");
          this.ctx.refresh();
        },
        "chat-color": (input) => this.setChatColor(input),
        "chat-reset": (btn) => {
          const { theme, mode } = btn.dataset;
          for (const f of CHAT_COLOR_FIELDS[mode] || []) {
            if (f.id === "bg") setChatBackgroundColor(theme, mode, "");
            else setExtraColor(theme, mode, f.id, null);
          }
          this.ctx.uiBus.emit("chat-bg:rebuild");
          this.ctx.refresh();
        },
      },
    );
    return root;
  }

  /**
   * Controles do fundo do chat para um tema (claro ou escuro).
   * @param {"dark"|"light"} theme - Tema.
   * @returns {string}
   * @private
   */
  chatThemeHtml(theme) {
    const { mode } = getChatBackground(theme);
    const extras = getExtraColors(theme, mode);
    const fields = (CHAT_COLOR_FIELDS[mode] || []).map((f) => {
      const value = f.id === "bg" ? getColor(theme, mode) : extras[f.id] || f.default?.[theme] || "#ffffff";
      const unsupported = f.id !== "bg" && f.default && f.default[theme] === null && !extras[f.id];
      return `<label class="cn-color"><span>${esc(f.label)}</span>
        <input type="color" value="${esc(unsupported ? "#999999" : value)}" data-change="chat-color" data-theme="${theme}" data-mode="${mode}" data-field="${f.id}" /></label>`;
    });
    return `<div class="cn-chat-theme">
      <div class="cn-row" style="align-items:center">
        <strong style="min-width:110px">${theme === "dark" ? t("Tema escuro") : t("Tema claro")}</strong>
        <select class="cn-select" data-change="chat-mode" data-theme="${theme}">${CHAT_BG_MODES.map((m) => `<option value="${m.id}" ${m.id === mode ? "selected" : ""}>${m.label}</option>`).join("")}</select>
        <button class="cn-btn small ghost" data-act="chat-reset" data-theme="${theme}" data-mode="${mode}" title="${t("Voltar às cores padrão deste fundo")}">${t("Cores padrão")}</button>
      </div>
      <div class="cn-colors">${fields.join("")}</div>
    </div>`;
  }

  /**
   * Salva uma cor do fundo do chat e reaplica.
   * @param {HTMLInputElement} input - Seletor de cor.
   * @returns {void}
   * @private
   */
  setChatColor(input) {
    const { theme, mode, field } = input.dataset;
    if (field === "bg") setChatBackgroundColor(theme, mode, input.value);
    else setExtraColor(theme, mode, field, input.value);
    this.ctx.uiBus.emit("chat-bg:rebuild");
  }

  // ========== Editor de temas ========== //

  /**
   * Abre o editor com uma cópia de um tema.
   * @param {Object} base - Tema de partida.
   * @param {boolean} asCopy - Criar um tema novo (senão edita o próprio).
   * @returns {void}
   * @private
   */
  startEditing(base, asCopy) {
    this.editing = {
      id: asCopy ? undefined : base.id,
      name: asCopy ? (base.isDefault ? t("Meu tema") : t("{name} (cópia)", { name: base.name })) : base.name,
      light: { ...base.light },
      dark: { ...base.dark },
    };
    this.appearance.previewTheme(this.previewTheme());
    this.ctx.refresh();
  }

  /** @returns {Object} O tema em edição no formato aplicável. @private */
  previewTheme() {
    return { id: "__preview", name: this.editing.name, builtin: false, light: this.editing.light, dark: this.editing.dark };
  }

  /**
   * Desenha o editor de tema: cada variável de cor, com um seletor para o modo claro e outro para o escuro.
   * @param {HTMLElement} el - Contêiner.
   * @returns {void}
   * @private
   */
  renderEditor(el) {
    const e = this.editing;
    const rows = THEME_VARS.map(
      (v) => `<div class="cn-theme-row"><span>${esc(v.label)}</span>
        <label><small>${t("Claro")}</small><input type="color" value="${esc(e.light[v.id])}" data-input="theme-color" data-mode="light" data-var="${v.id}" /></label>
        <label><small>${t("Escuro")}</small><input type="color" value="${esc(e.dark[v.id])}" data-input="theme-color" data-mode="dark" data-var="${v.id}" /></label>
      </div>`,
    ).join("");

    mount(
      el,
      `<section class="cn-section">
         <h4>${e.id ? t("Editar tema") : t("Criar tema")}</h4>
         <p class="cn-hint">${t("Mexa nas cores e veja o resultado na hora, atrás desta janela e no app. Cada variável tem uma cor para o modo claro e outra para o escuro. Para ver o modo que não está em uso, alterne o modo escuro nesta aba depois de salvar.")}</p>
         <label class="cn-field"><span>${t("Nome do tema")}</span><input class="cn-input" id="theme-name" maxlength="40" value="${esc(e.name)}" data-input="theme-name" /></label>
         <div class="cn-theme-rows">${rows}</div>
         <div class="cn-row">
           <button class="cn-btn primary" data-act="save"><i class="fa-solid fa-check"></i> ${t("Salvar tema")}</button>
           <button class="cn-btn" data-act="cancel">${t("Cancelar")}</button>
           <button class="cn-btn ghost" data-act="restore" title="${t("Voltar às cores do Astra")}">${t("Restaurar cores do Astra")}</button>
         </div>
       </section>`,
      {
        "theme-name": (input) => {
          this.editing.name = input.value;
        },
        "theme-color": (input) => {
          this.editing[input.dataset.mode][input.dataset.var] = input.value;
          this.appearance.previewTheme(this.previewTheme());
        },
        save: () => {
          const id = saveCustomTheme({ id: this.editing.id, name: this.editing.name, light: this.editing.light, dark: this.editing.dark });
          this.editing = null;
          appSettings.set("ui.themePreset", id);
          this.ctx.toast(t("Tema salvo e aplicado."), "success");
          this.ctx.refresh();
        },
        cancel: () => this.stopEditing(),
        restore: () => {
          this.editing.light = { ...BASE_COLORS.light };
          this.editing.dark = { ...BASE_COLORS.dark };
          this.appearance.previewTheme(this.previewTheme());
          this.ctx.refresh();
        },
      },
    );
  }

  /** Sai do editor sem salvar (a prévia volta ao tema escolhido). @returns {void} */
  stopEditing() {
    this.editing = null;
    this.appearance.previewTheme(null);
    this.ctx.refresh();
  }

  /** A central foi fechada: descarta uma edição em andamento. @returns {void} */
  dispose() {
    if (this.editing) {
      this.editing = null;
      this.appearance.previewTheme(null);
    }
  }
}

