// @ts-nocheck
/**
 * @file Temas de cores do app: temas predefinidos e temas criados pelo usuário. Um tema é só um conjunto de **variáveis de
 * cor** (para o modo claro e para o escuro): nunca há CSS livre, então um tema não pode alterar o comportamento nem o
 * layout do app. O tema "Astra" (padrão) não muda nada.
 */

import { appSettings } from "./appSettings.js";

/**
 * Variáveis de cor que um tema pode alterar, com o nome mostrado na tela.
 * `derive`: as variáveis de linhas, realces e barra de rolagem são calculadas a partir destas cores.
 */
export const THEME_VARS = [
  { id: "--bg-app", label: "Fundo do app" },
  { id: "--bg-sidebar", label: "Fundo da barra lateral" },
  { id: "--bg-header", label: "Barra de título" },
  { id: "--bg-editor", label: "Fundo do editor" },
  { id: "--editor-toolbar", label: "Barra de ferramentas do editor" },
  { id: "--surface", label: "Cartões e campos" },
  { id: "--surface-raised", label: "Janelas e painéis" },
  { id: "--surface-sunken", label: "Áreas rebaixadas" },
  { id: "--text", label: "Texto" },
  { id: "--text-dim", label: "Texto secundário" },
  { id: "--text-subtle", label: "Texto discreto" },
  { id: "--accent", label: "Cor de destaque" },
  { id: "--accent-alt", label: "Destaque alternativo" },
  { id: "--text-folder", label: "Pastas do explorer" },
  { id: "--btn-primary-bg", label: "Botão principal" },
  { id: "--danger", label: "Erro" },
  { id: "--warning", label: "Aviso" },
  { id: "--success", label: "Sucesso" },
];

/** Valores do tema Astra (o padrão do app), para servir de base ao criar um tema. */
export const BASE_COLORS = {
  light: {
    "--bg-app": "#f4f2fa", "--bg-sidebar": "#ece9f6", "--bg-header": "#ece9f6", "--bg-editor": "#fbfaff", "--editor-toolbar": "#ece9f6",
    "--surface": "#ffffff", "--surface-raised": "#ffffff", "--surface-sunken": "#e6e2f3",
    "--text": "#2b2542", "--text-dim": "#5a5475", "--text-subtle": "#6f698f",
    "--accent": "#6d4fd8", "--accent-alt": "#6442b8", "--text-folder": "#6d4fd8", "--btn-primary-bg": "#6d4fd8",
    "--danger": "#cf3358", "--warning": "#dab577", "--success": "#2a8f5c",
  },
  dark: {
    "--bg-app": "#1a1217", "--bg-sidebar": "#0e0f17", "--bg-header": "#0e0f17", "--bg-editor": "#171820", "--editor-toolbar": "#0e0f17",
    "--surface": "#1e1f2c", "--surface-raised": "#181926", "--surface-sunken": "#11111b",
    "--text": "#cdd6f4", "--text-dim": "#a6adc8", "--text-subtle": "#6c7086",
    "--accent": "#89b4fa", "--accent-alt": "#cba6f7", "--text-folder": "#8ea4ee", "--btn-primary-bg": "#394d84",
    "--danger": "#f38ba8", "--warning": "#f9e2af", "--success": "#a6e3a1",
  },
};

/** Cria um tema a partir de poucas cores-chave (o resto herda do Astra). */
function theme(id, name, description, light, dark) {
  return { id, name, description, builtin: true, light: { ...BASE_COLORS.light, ...light }, dark: { ...BASE_COLORS.dark, ...dark } };
}

/** Temas predefinidos. O primeiro (Astra) não altera nada. */
export const PRESET_THEMES = [
  { id: "astra", name: "Astra", description: "O visual padrão do app: roxo no claro e azul no escuro.", builtin: true, light: BASE_COLORS.light, dark: BASE_COLORS.dark, isDefault: true },
  theme("netuno", "Netuno", "Azuis profundos e verdes-água, frio e limpo.",
    { "--bg-app": "#eef6fa", "--bg-sidebar": "#e0eef5", "--bg-header": "#e0eef5", "--bg-editor": "#f7fbfd", "--editor-toolbar": "#e0eef5", "--surface-sunken": "#d4e7f0", "--text": "#12303f", "--text-dim": "#3c5f70", "--text-subtle": "#5a7d8e", "--accent": "#0a7ea4", "--accent-alt": "#0b6a8a", "--text-folder": "#0a7ea4", "--btn-primary-bg": "#0a7ea4" },
    { "--bg-app": "#0c1820", "--bg-sidebar": "#08111a", "--bg-header": "#08111a", "--bg-editor": "#0e1c26", "--editor-toolbar": "#08111a", "--surface": "#142633", "--surface-raised": "#10202c", "--surface-sunken": "#091219", "--text": "#d3e8f2", "--text-dim": "#9bbccc", "--text-subtle": "#6a8b9c", "--accent": "#4cc9f0", "--accent-alt": "#7ae0d0", "--text-folder": "#6fd3ee", "--btn-primary-bg": "#1f6c8a" }),
  theme("terra", "Terra", "Verdes de floresta, bom para leitura longa.",
    { "--bg-app": "#f1f6ef", "--bg-sidebar": "#e5eee2", "--bg-header": "#e5eee2", "--bg-editor": "#f8fbf6", "--editor-toolbar": "#e5eee2", "--surface-sunken": "#d9e6d5", "--text": "#1f3326", "--text-dim": "#476052", "--text-subtle": "#668170", "--accent": "#2e7d4f", "--accent-alt": "#1f6b42", "--text-folder": "#2e7d4f", "--btn-primary-bg": "#2e7d4f" },
    { "--bg-app": "#0f1a14", "--bg-sidebar": "#0a120d", "--bg-header": "#0a120d", "--bg-editor": "#111e17", "--editor-toolbar": "#0a120d", "--surface": "#18281f", "--surface-raised": "#13221a", "--surface-sunken": "#0b140f", "--text": "#d6eadb", "--text-dim": "#a3c2ac", "--text-subtle": "#6f8f79", "--accent": "#7bd88f", "--accent-alt": "#b7e07a", "--text-folder": "#8fdc9f", "--btn-primary-bg": "#2f6a43" }),
  theme("saturno", "Saturno", "Papel envelhecido e dourado, descansa os olhos.",
    { "--bg-app": "#f4ecd8", "--bg-sidebar": "#ebe0c6", "--bg-header": "#ebe0c6", "--bg-editor": "#f9f2e1", "--editor-toolbar": "#ebe0c6", "--surface": "#fbf6e8", "--surface-raised": "#fbf6e8", "--surface-sunken": "#e2d5b6", "--text": "#3b2f1e", "--text-dim": "#6a5a42", "--text-subtle": "#8a7a60", "--accent": "#8a5a2b", "--accent-alt": "#6e4620", "--text-folder": "#8a5a2b", "--btn-primary-bg": "#8a5a2b" },
    { "--bg-app": "#1c1812", "--bg-sidebar": "#13100b", "--bg-header": "#13100b", "--bg-editor": "#201b14", "--editor-toolbar": "#13100b", "--surface": "#2a241a", "--surface-raised": "#231e16", "--surface-sunken": "#14110c", "--text": "#e8dcc2", "--text-dim": "#bcab8a", "--text-subtle": "#8a7b5e", "--accent": "#d9a15b", "--accent-alt": "#c98f4a", "--text-folder": "#dfae6e", "--btn-primary-bg": "#7a5426" }),
  theme("venus", "Vênus", "Rosas e lilases pastel, suave e delicado.",
    { "--bg-app": "#fdf3f7", "--bg-sidebar": "#f9e4ee", "--bg-header": "#f9e4ee", "--bg-editor": "#fffafc", "--editor-toolbar": "#f9e4ee", "--surface-sunken": "#f3d6e3", "--text": "#4a2f42", "--text-dim": "#7a5a6e", "--text-subtle": "#94788a", "--accent": "#d4609a", "--accent-alt": "#a678d8", "--text-folder": "#c2588c", "--btn-primary-bg": "#d4609a" },
    { "--bg-app": "#1f161c", "--bg-sidebar": "#160f14", "--bg-header": "#160f14", "--bg-editor": "#231a20", "--editor-toolbar": "#160f14", "--surface": "#2d2029", "--surface-raised": "#261b22", "--surface-sunken": "#170f14", "--text": "#f5dfe9", "--text-dim": "#cfb0c1", "--text-subtle": "#967b8b", "--accent": "#f4a6c8", "--accent-alt": "#c9b1ff", "--text-folder": "#f7b8d3", "--btn-primary-bg": "#8a3f66" }),
  theme("pulsar", "Pulsar", "Synthwave dos anos 80: rosa neon e azul elétrico.",
    { "--bg-app": "#f6f0ff", "--bg-sidebar": "#ebe0ff", "--bg-header": "#ebe0ff", "--bg-editor": "#fbf8ff", "--editor-toolbar": "#ebe0ff", "--surface-sunken": "#ddd0f7", "--text": "#2a1450", "--text-dim": "#5a3f8a", "--text-subtle": "#7a62a8", "--accent": "#d81b88", "--accent-alt": "#2b6cf0", "--text-folder": "#c01a7c", "--btn-primary-bg": "#d81b88" },
    { "--bg-app": "#120a24", "--bg-sidebar": "#0b0618", "--bg-header": "#0b0618", "--bg-editor": "#160c2c", "--editor-toolbar": "#0b0618", "--surface": "#1f1240", "--surface-raised": "#190f36", "--surface-sunken": "#0a0516", "--text": "#f1e6ff", "--text-dim": "#bfa8e8", "--text-subtle": "#8a72b8", "--accent": "#ff4fb0", "--accent-alt": "#38d0ff", "--text-folder": "#ff7cc6", "--btn-primary-bg": "#a0207a" }),
];

/** Ids antigos de temas que mudaram de nome. */
const LEGACY_IDS = { oceano: "netuno", floresta: "terra", sepia: "saturno" };

/** @returns {Object[]} Temas criados pelo usuário. */
export function customThemes() {
  const list = appSettings.get("themes.custom");
  return Array.isArray(list) ? list : [];
}

/** @returns {Object[]} Todos os temas (predefinidos e do usuário). */
export function allThemes() {
  return [...PRESET_THEMES, ...customThemes()];
}

/**
 * Tema por id.
 * @param {string} id - Id.
 * @returns {Object|undefined}
 */
export function findTheme(id) {
  id = LEGACY_IDS[id] || id;
  return allThemes().find((t) => t.id === id);
}

/**
 * Cor `#rrggbb` válida?
 * @param {string} value - Texto.
 * @returns {boolean}
 */
export function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ""));
}

/**
 * Salva (cria ou atualiza) um tema do usuário. Só cores `#rrggbb` das variáveis conhecidas são guardadas.
 * @param {{id?: string, name: string, light: Object, dark: Object}} input - Tema.
 * @returns {string} Id do tema.
 */
export function saveCustomTheme({ id, name, light, dark }) {
  const clean = (colors) =>
    Object.fromEntries(THEME_VARS.map((v) => [v.id, isHexColor(colors?.[v.id]) ? colors[v.id] : BASE_COLORS.light[v.id]]));
  const themeId = id || `custom-${Date.now().toString(36)}`;
  const entry = { id: themeId, name: String(name || "Meu tema").trim().slice(0, 40) || "Meu tema", builtin: false, light: clean(light), dark: clean(dark) };
  const list = customThemes().filter((t) => t.id !== themeId);
  appSettings.set("themes.custom", [...list, entry]);
  return themeId;
}

/**
 * Apaga um tema do usuário (se estava em uso, volta ao Astra).
 * @param {string} id - Id do tema.
 * @returns {void}
 */
export function deleteCustomTheme(id) {
  appSettings.set("themes.custom", customThemes().filter((t) => t.id !== id));
  if (appSettings.get("ui.themePreset") === id) appSettings.set("ui.themePreset", "astra");
}

/**
 * Declarações CSS de um modo do tema: as cores escolhidas e as variáveis derivadas (linhas, realces e rolagem).
 * @param {Object} colors - Cores do modo.
 * @returns {string}
 */
function declarations(colors) {
  const own = THEME_VARS.map((v) => `${v.id}: ${colors[v.id]};`);
  return [
    ...own,
    "--text-sidebar: var(--text);",
    "--text-editor: var(--text);",
    "--text-file: var(--text);",
    "--text-file-active: var(--text);",
    "--line: color-mix(in srgb, var(--text) 14%, transparent);",
    "--line-soft: color-mix(in srgb, var(--text) 8%, transparent);",
    "--line-strong: color-mix(in srgb, var(--text) 30%, transparent);",
    "--border-app: color-mix(in srgb, var(--text) 13%, transparent);",
    "--border-app-strong: color-mix(in srgb, var(--text) 22%, transparent);",
    "--hover: color-mix(in srgb, var(--text) 6%, transparent);",
    "--file-hover-bg: color-mix(in srgb, var(--text) 8%, transparent);",
    "--file-active-bg: color-mix(in srgb, var(--accent) 22%, transparent);",
    "--card-overlay-bg: var(--surface-raised);",
    "--scrollbar-thumb: color-mix(in srgb, var(--accent) 35%, transparent);",
    "--scrollbar-thumb-hover: color-mix(in srgb, var(--accent) 65%, transparent);",
  ].join("\n  ");
}

/**
 * CSS de um tema (só variáveis).
 * @param {Object} t - Tema.
 * @returns {string}
 */
export function themeCss(t) {
  if (!t || t.isDefault) return "";
  return `:root {\n  ${declarations(t.light)}\n}\nbody.dark-theme {\n  ${declarations(t.dark)}\n}`;
}

/**
 * Aplica um tema ao app (ou o prévia temporária de um tema em edição).
 * @param {Object|null} t - Tema (null: o padrão).
 * @returns {void}
 */
export function applyThemeCss(t) {
  let style = document.getElementById("astra-theme");
  if (!style) {
    style = document.createElement("style");
    style.id = "astra-theme";
    document.head.appendChild(style);
  }
  style.textContent = themeCss(t);
}
