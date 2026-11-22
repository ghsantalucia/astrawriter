/**
 * @file Configurações do app (não do livro): tamanho da fonte, tema, modo noturno, fontes do editor, narrador,
 * atualizações, backup, cronômetro, skills... Ficam no armazenamento local do app.
 *
 * Este arquivo é o **registro único** das configurações: cada uma tem id, nome, ajuda, onde fica na Central do Sistema,
 * tipo, limites e a classe de risco para a IA (a: liberada; b: só com permissão do autor; c: a IA apenas orienta e abre a
 * tela). A Central do Sistema e as tools da IA leem as mesmas definições.
 */

import { uiBus } from "../events/uiBus.js";

const KEY = "astra.settings.v1";

/**
 * @typedef {Object} SettingDef
 * @property {string} id - Identificador (`grupo.nome`).
 * @property {string} label - Nome na tela.
 * @property {string} help - Explicação curta (e do que a IA informa ao usuário).
 * @property {string} where - Onde fica (aba da Central do Sistema) para orientar o usuário.
 * @property {"system"|"ai"|"book"} [central="system"] - Central onde fica.
 * @property {string} tab - Id da aba dessa central.
 * @property {"bool"|"number"|"text"|"select"|"time"} type - Tipo do valor.
 * @property {number} [min] - Mínimo (number).
 * @property {number} [max] - Máximo (number).
 * @property {Array<{value: string, label: string}>} [options] - Opções (select).
 * @property {*} default - Valor padrão.
 * @property {"a"|"b"|"c"} risk - Classe de risco para a IA.
 * @property {() => *} [get] - Leitura própria (configurações guardadas fora deste arquivo).
 * @property {(value: *) => void} [set] - Gravação própria.
 */

/** Fontes oferecidas para o editor (a lista também aceita qualquer fonte instalada, digitando o nome). */
export const EDITOR_FONTS = [
  { value: "default", label: "Padrão do app" },
  { value: "Georgia, serif", label: "Georgia (serifada)" },
  { value: "'Times New Roman', Times, serif", label: "Times New Roman" },
  { value: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif", label: "Palatino" },
  { value: "Garamond, 'EB Garamond', serif", label: "Garamond" },
  { value: "Cambria, serif", label: "Cambria" },
  { value: "'Segoe UI', system-ui, sans-serif", label: "Segoe UI (sem serifa)" },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana (legível)" },
  { value: "Calibri, sans-serif", label: "Calibri" },
  { value: "'Comic Sans MS', 'Comic Neue', cursive", label: "Comic Sans (dislexia)" },
  { value: "Consolas, 'Courier New', monospace", label: "Consolas (monoespaçada)" },
  { value: "'Courier New', Courier, monospace", label: "Courier New (máquina de escrever)" },
];

/** Definições das configurações do app. @type {SettingDef[]} */
export const SETTING_DEFS = [
  { id: "ui.theme", label: "Tema claro ou escuro", help: "Alterna a aparência do app entre claro e escuro.", where: "Central do Sistema → Aparência", tab: "appearance", type: "select", options: [{ value: "light", label: "Claro" }, { value: "dark", label: "Escuro" }], default: "dark", risk: "a" },
  { id: "ui.themePreset", label: "Tema de cores", help: "Conjunto de cores do app (predefinido ou criado por você).", where: "Central do Sistema → Aparência", tab: "appearance", type: "text", default: "astra", risk: "a" },
  { id: "ui.zoom", label: "Tamanho da fonte do app", help: "Aumenta ou diminui todo o app (em porcentagem).", where: "Central do Sistema → Acessibilidade", tab: "accessibility", type: "number", min: 70, max: 200, default: 100, risk: "a" },
  { id: "ui.night.enabled", label: "Modo noturno", help: "Filtro amarelado que cobre todo o app no horário escolhido.", where: "Central do Sistema → Acessibilidade", tab: "accessibility", type: "bool", default: false, risk: "a" },
  { id: "ui.night.from", label: "Modo noturno: começa às", help: "Horário em que o filtro liga.", where: "Central do Sistema → Acessibilidade", tab: "accessibility", type: "time", default: "20:00", risk: "a" },
  { id: "ui.night.to", label: "Modo noturno: termina às", help: "Horário em que o filtro desliga.", where: "Central do Sistema → Acessibilidade", tab: "accessibility", type: "time", default: "06:00", risk: "a" },
  { id: "ui.night.intensity", label: "Modo noturno: intensidade", help: "Quão amarelado fica o filtro (10 a 80%).", where: "Central do Sistema → Acessibilidade", tab: "accessibility", type: "number", min: 10, max: 80, default: 35, risk: "a" },
  { id: "speech.voice", label: "Narrador: voz", help: "Voz usada para ler os arquivos em voz alta.", where: "Central do Sistema → Acessibilidade", tab: "accessibility", type: "text", default: "", risk: "a" },
  { id: "speech.rate", label: "Narrador: velocidade", help: "Velocidade da leitura (0,5 a 2).", where: "Central do Sistema → Acessibilidade", tab: "accessibility", type: "number", min: 0.5, max: 2, default: 1, risk: "a" },
  { id: "editor.fontSize", label: "Tamanho da fonte do editor", help: "Tamanho do texto no editor (em pixels).", where: "Central do Sistema → Editor", tab: "editor", type: "number", min: 11, max: 40, default: 16, risk: "a" },
  { id: "editor.fontBody", label: "Fonte do texto do editor", help: "Tipo de letra do texto normal.", where: "Central do Sistema → Editor", tab: "editor", type: "select", options: EDITOR_FONTS, default: "default", risk: "a" },
  { id: "editor.fontHeading", label: "Fonte dos títulos do editor", help: "Tipo de letra dos títulos (pode ser diferente do texto).", where: "Central do Sistema → Editor", tab: "editor", type: "select", options: EDITOR_FONTS, default: "default", risk: "a" },
  { id: "chat.notify", label: "Avisar quando a IA responder com o chat fechado", help: "Com a gaveta do chat recolhida, uma bolinha aparece no cabeçalho e toca um som suave quando a IA termina de responder.", where: "Central do Sistema → Geral", tab: "general", type: "bool", default: true, risk: "a" },
  { id: "productivity.enabled", label: "Mostrar o cronômetro", help: "Mostra o cronômetro de escrita entre as abas e a busca do explorer. Desligado, ele não aparece nem conta.", where: "Central do Sistema → Produtividade", tab: "productivity", type: "bool", default: false, risk: "a" },
  { id: "productivity.auto", label: "Cronômetro automático", help: "O cronômetro para sozinho quando você se ausenta (sem foco ou parado) e volta quando você volta.", where: "Central do Sistema → Produtividade", tab: "productivity", type: "bool", default: true, risk: "a" },
  { id: "productivity.goalMinutes", label: "Meta de tempo (minutos)", help: "Com uma meta, o cronômetro conta de forma regressiva (ex.: 60 min para escrever por 1 hora). Quando o tempo acaba, toca um som suave e aparece um aviso positivo. 0 = sem meta (conta para a frente).", where: "Central do Sistema → Produtividade", tab: "productivity", type: "number", min: 0, max: 480, default: 0, risk: "a" },
  { id: "productivity.idleMinutes", label: "Minutos sem atividade para ausência", help: "Sem mexer o mouse nem o teclado por este tempo, o cronômetro automático para.", where: "Central do Sistema → Produtividade", tab: "productivity", type: "number", min: 1, max: 30, default: 2, risk: "a" },
  { id: "updates.auto", label: "Atualização automática", help: "Procura e baixa novas versões do app ao abrir (só no app instalado).", where: "Central do Sistema → Atualização", tab: "update", type: "bool", default: true, risk: "b" },
  { id: "backup.auto", label: "Backup automático", help: "Ao abrir o app, copia os livros para a pasta de backup se já passou o intervalo.", where: "Central do Sistema → Backup", tab: "backup", type: "bool", default: false, risk: "b" },
  { id: "backup.folder", label: "Pasta de backup", help: "Pasta onde ficam as cópias dos livros (pode ser uma pasta do Google Drive, OneDrive ou Dropbox).", where: "Central do Sistema → Backup", tab: "backup", type: "text", default: "", risk: "c" },
  { id: "backup.keep", label: "Cópias mantidas por livro", help: "Quantas cópias de cada livro ficam na pasta de backup (as mais antigas são apagadas).", where: "Central do Sistema → Backup", tab: "backup", type: "number", min: 1, max: 50, default: 2, risk: "b" },
  { id: "backup.everyHours", label: "Intervalo do backup (horas)", help: "De quantas em quantas horas o backup automático roda ao abrir o app.", where: "Central do Sistema → Backup", tab: "backup", type: "number", min: 1, max: 720, default: 24, risk: "b" },
  { id: "skills.askAlways", label: "Todas as skills pedem permissão", help: "Qualquer skill pede sua permissão (com a estimativa de tokens) antes de rodar.", where: "Central de IA → Skills", central: "ai", tab: "skills", type: "bool", default: false, risk: "c" },
];

/** Valores internos que não são configurações da tela (ficam no mesmo armazenamento). */
const INTERNAL_DEFAULTS = {
  "backup.lastAt": 0,
  "skills.askAlwaysSaved": null,
  "shortcuts.custom": {},
  "themes.custom": [],
  "chat.colors": {},
  "skills.prefs": {},
  "skills.stats": {},
};

const byId = new Map(SETTING_DEFS.map((d) => [d.id, d]));

/**
 * Valida e ajusta um valor ao tipo da definição.
 * @param {SettingDef} def - Definição.
 * @param {*} value - Valor recebido.
 * @returns {*} Valor válido.
 * @throws {Error} Se o valor não serve.
 */
export function coerceSetting(def, value) {
  switch (def.type) {
    case "bool":
      return value === true || value === "true";
    case "number": {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`"${def.label}" precisa de um número.`);
      return Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, n));
    }
    case "time": {
      const text = String(value).trim();
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new Error(`"${def.label}" precisa de um horário no formato HH:MM.`);
      return text;
    }
    case "select": {
      const text = String(value);
      // Fontes aceitam também um nome digitado
      if (def.options.some((o) => o.value === text) || def.id.startsWith("editor.font")) return text;
      throw new Error(`"${def.label}": valor inválido. Opções: ${def.options.map((o) => o.value).join(", ")}.`);
    }
    default:
      return String(value ?? "");
  }
}

/**
 * Armazenamento das configurações do app.
 * @class
 */
class AppSettingsStore {
  declare values: any;

  constructor() {
    this.values = {};
    try {
      this.values = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    } catch {
      this.values = {};
    }
  }

  /** @returns {SettingDef[]} Definições. */
  defs() {
    return SETTING_DEFS;
  }

  /**
   * Definição de uma configuração.
   * @param {string} id - Id.
   * @returns {SettingDef|undefined}
   */
  def(id) {
    return byId.get(id);
  }

  /**
   * Valor atual (o salvo ou o padrão).
   * @param {string} id - Id da configuração.
   * @returns {*}
   */
  get(id) {
    const def: any = byId.get(id);
    if (def?.get) return def.get();
    if (id in this.values) return this.values[id];
    if (def) return def.default;
    return INTERNAL_DEFAULTS[id];
  }

  /**
   * Grava um valor (validado) e avisa quem acompanha.
   * @param {string} id - Id da configuração.
   * @param {*} value - Novo valor.
   * @returns {*} O valor gravado.
   */
  set(id, value) {
    const def: any = byId.get(id);
    const next = def ? coerceSetting(def, value) : value;
    if (def?.set) def.set(next);
    else {
      this.values[id] = next;
      this.save();
    }
    uiBus.emit("app-settings:changed", { id, value: next });
    return next;
  }

  /** Grava tudo no armazenamento local. @private */
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.values));
    } catch {
      // sem armazenamento: vale só nesta sessão
    }
  }
}

export const appSettings = new AppSettingsStore();
