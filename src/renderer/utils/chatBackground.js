/**
 * @file Preferência do plano de fundo do chat (uma para o tema escuro e outra para o claro): tipo de fundo e cor.
 * Fica no armazenamento local do navegador (preferência de aparência, não do livro).
 */

/** Tipos de fundo disponíveis. */
export const CHAT_BG_MODES = [
  { id: "stars", label: "Estrelas" },
  { id: "nebula", label: "Nebulosa" },
  { id: "orbits", label: "Órbitas" },
  { id: "solid", label: "Cor sólida" },
];

/** Fundo padrão de cada tema (o que o app sempre usou). */
const DEFAULT_MODE = { dark: "stars", light: "nebula" };

/** Cor padrão por tipo e tema (`stars`, `solid` e `orbits` usam cor). */
const DEFAULT_COLOR = {
  stars: { dark: "#080910", light: "#f3e3f1" },
  solid: { dark: "#14141f", light: "#f4eefb" },
  orbits: { dark: "#1b1530", light: "#c0c8e6" },
};

/**
 * Tipos que aceitam escolher a cor de fundo.
 * @param {string} mode - Tipo de fundo.
 * @returns {boolean}
 */
export function modeUsesColor(mode) {
  return mode === "stars" || mode === "solid" || mode === "orbits";
}

/**
 * Preferência salva (ou o padrão) para um tema.
 * @param {"dark"|"light"} theme - Tema.
 * @returns {{mode: string, color: string|null}} `color` é null nos tipos que não usam cor.
 */
export function getChatBackground(theme) {
  let mode = DEFAULT_MODE[theme];
  try {
    const saved = localStorage.getItem(`chat_bg_${theme}`);
    if (CHAT_BG_MODES.some((m) => m.id === saved)) mode = saved;
  } catch {
    /* sem armazenamento: usa o padrão */
  }
  return { mode, color: modeUsesColor(mode) ? getColor(theme, mode) : null };
}

/**
 * Se o usuário já escolheu uma cor para o tipo de fundo (nas estrelas, sem escolha vale o degradê padrão do tema).
 * @param {"dark"|"light"} theme - Tema.
 * @param {string} mode - Tipo.
 * @returns {boolean}
 */
export function hasSavedColor(theme, mode) {
  try {
    return /^#[0-9a-f]{6}$/i.test(
      localStorage.getItem(`chat_bg_color_${theme}_${mode}`) || "",
    );
  } catch {
    return false;
  }
}

/**
 * Cor salva (ou a padrão) de um tipo de fundo em um tema.
 * @param {"dark"|"light"} theme - Tema.
 * @param {string} mode - Tipo (`stars`, `solid` ou `orbits`).
 * @returns {string}
 */
export function getColor(theme, mode) {
  try {
    const saved = localStorage.getItem(`chat_bg_color_${theme}_${mode}`);
    if (/^#[0-9a-f]{6}$/i.test(saved || "")) return saved;
  } catch {
    /* usa o padrão */
  }
  return DEFAULT_COLOR[mode]?.[theme] || "#000000";
}

/**
 * Salva o tipo de fundo de um tema.
 * @param {"dark"|"light"} theme - Tema.
 * @param {string} mode - Tipo.
 * @returns {void}
 */
export function setChatBackgroundMode(theme, mode) {
  try {
    localStorage.setItem(`chat_bg_${theme}`, mode);
  } catch {
    /* ignora */
  }
}

/**
 * Salva a cor de um tipo de fundo em um tema.
 * @param {"dark"|"light"} theme - Tema.
 * @param {string} mode - Tipo.
 * @param {string} color - Cor `#rrggbb`.
 * @returns {void}
 */
export function setChatBackgroundColor(theme, mode, color) {
  try {
    localStorage.setItem(`chat_bg_color_${theme}_${mode}`, color);
  } catch {
    /* ignora */
  }
}
