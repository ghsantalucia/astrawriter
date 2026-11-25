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

    const card = (t) => `
      <div class="cn-theme ${t.id === active ? "active" : ""}">
        <div class="cn-theme-swatch">${SWATCH.map((v) => `<span style="background:${esc(t[mode][v])}"></span>`).join("")}</div>
        <strong>${esc(t.name)}${t.id === active ? ' <small class="cn-pill success">em uso</small>' : ""}</strong>
        <small>${esc(t.description || "Tema criado por você.")}</small>
        <div class="cn-row" style="gap:6px;margin-top:6px">
          <button class="cn-btn small ${t.id === active ? "" : "primary"}" data-act="use" data-id="${esc(t.id)}" ${t.id === active ? "disabled" : ""}>Usar</button>
          <button class="cn-btn small ghost" data-act="copy" data-id="${esc(t.id)}" title="Criar um tema novo a partir deste">Duplicar</button>
          ${t.builtin ? "" : `<button class="cn-btn small ghost" data-act="edit" data-id="${esc(t.id)}">Editar</button><button class="cn-btn small ghost" data-act="delete" data-id="${esc(t.id)}" title="Excluir"><i class="fa-regular fa-trash-can"></i></button>`}
        </div>
      </div>`;

    const root = mount(
      el,
      `<section class="cn-section">
         <h4>Claro ou escuro</h4>
         <div class="cn-setting-list">
           ${switchRow({ attrs: 'data-change="dark"', checked: dark, title: "Modo escuro", hint: "Alterna entre o tema claro e o escuro (vale para qualquer tema de cores)." })}
         </div>
       </section>
       <section class="cn-section">
         <h4>Temas de cores</h4>
         <p class="cn-hint">Escolha um tema pronto ou crie o seu a partir de uma cópia. Um tema é só um conjunto de cores (para o modo claro e para o escuro): ele nunca muda o funcionamento do app.</p>
         <div class="cn-theme-grid">${allThemes().map(card).join("")}</div>
         <div class="cn-row"><button class="cn-btn" data-act="new"><i class="fa-solid fa-plus"></i> Criar tema</button></div>
       </section>
       <section class="cn-section">
         <h4>Tema do chat de IA</h4>
         <p class="cn-hint">O fundo do chat tem 4 opções, e cada uma tem as próprias cores. Escolha um fundo para o tema escuro e outro para o claro.</p>
         ${["dark", "light"].map((t) => this.chatThemeHtml(t)).join("")}
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
          const t = findTheme(btn.dataset.id);
          confirmModal(this.ctx.uiBus, {
            title: "Excluir tema?",
            danger: true,
            confirmText: "Excluir",
            html: `<p>O tema <strong>${esc(t?.name)}</strong> será excluído. Se estiver em uso, o app volta ao tema Astra.</p>`,
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
        <strong style="min-width:110px">${theme === "dark" ? "Tema escuro" : "Tema claro"}</strong>
        <select class="cn-select" data-change="chat-mode" data-theme="${theme}">${CHAT_BG_MODES.map((m) => `<option value="${m.id}" ${m.id === mode ? "selected" : ""}>${m.label}</option>`).join("")}</select>
        <button class="cn-btn small ghost" data-act="chat-reset" data-theme="${theme}" data-mode="${mode}" title="Voltar às cores padrão deste fundo">Cores padrão</button>
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
      name: asCopy ? (base.isDefault ? "Meu tema" : `${base.name} (cópia)`) : base.name,
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
        <label><small>Claro</small><input type="color" value="${esc(e.light[v.id])}" data-input="theme-color" data-mode="light" data-var="${v.id}" /></label>
        <label><small>Escuro</small><input type="color" value="${esc(e.dark[v.id])}" data-input="theme-color" data-mode="dark" data-var="${v.id}" /></label>
      </div>`,
    ).join("");

    mount(
      el,
      `<section class="cn-section">
         <h4>${e.id ? "Editar tema" : "Criar tema"}</h4>
         <p class="cn-hint">Mexa nas cores e veja o resultado na hora, atrás desta janela e no app. Cada variável tem uma cor para o modo claro e outra para o escuro. Para ver o modo que não está em uso, alterne o modo escuro nesta aba depois de salvar.</p>
         <label class="cn-field"><span>Nome do tema</span><input class="cn-input" id="theme-name" maxlength="40" value="${esc(e.name)}" data-input="theme-name" /></label>
         <div class="cn-theme-rows">${rows}</div>
         <div class="cn-row">
           <button class="cn-btn primary" data-act="save"><i class="fa-solid fa-check"></i> Salvar tema</button>
           <button class="cn-btn" data-act="cancel">Cancelar</button>
           <button class="cn-btn ghost" data-act="restore" title="Voltar às cores do Astra">Restaurar cores do Astra</button>
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
          this.ctx.toast("Tema salvo e aplicado.", "success");
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

