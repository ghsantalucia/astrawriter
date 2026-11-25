/**
 * @file Configurações do app (não do livro): tamanho da fonte, tema, modo noturno, fontes do editor, narrador,
 * atualizações, backup, cronômetro, skills... Ficam no armazenamento local do app.
 *
 * Este arquivo é o **registro único** das configurações: cada uma tem id, nome, ajuda, onde fica na Central do Sistema,
 * tipo, limites e a classe de risco para a IA (a: liberada; b: só com permissão do autor; c: a IA apenas orienta e abre a
 * tela). A Central do Sistema e as tools da IA leem as mesmas definições.
 */

import { uiBus } from "../events/uiBus.js";
import { LANGUAGES, getLanguage, t } from "../../shared/i18n.js";

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
  { value: "default", label: t("Padrão do app") },
  { value: "Georgia, serif", label: t("Georgia (serifada)") },
  { value: "'Times New Roman', Times, serif", label: "Times New Roman" },
  { value: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif", label: "Palatino" },
  { value: "Garamond, 'EB Garamond', serif", label: "Garamond" },
  { value: "Cambria, serif", label: "Cambria" },
  { value: "'Segoe UI', system-ui, sans-serif", label: t("Segoe UI (sem serifa)") },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "Verdana, Geneva, sans-serif", label: t("Verdana (legível)") },
  { value: "Calibri, sans-serif", label: "Calibri" },
  { value: "'Comic Sans MS', 'Comic Neue', cursive", label: t("Comic Sans (dislexia)") },
  { value: "Consolas, 'Courier New', monospace", label: t("Consolas (monoespaçada)") },
  { value: "'Courier New', Courier, monospace", label: t("Courier New (máquina de escrever)") },
];

/** Definições das configurações do app. @type {SettingDef[]} */
export const SETTING_DEFS = [
  // Idioma: a IA só orienta (classe c); trocar recarrega a tela, e a escolha fica gravada pelo processo principal
  { id: "ui.language", label: t("Idioma do aplicativo"), help: t("O idioma da interface do Astra Writer. Ao trocar, o app recarrega a tela."), where: t("Central do Sistema → Geral"), tab: "general", type: "select", options: LANGUAGES, default: "pt-BR", risk: "c", get: () => getLanguage(), set: (value) => { void (window as any).electronAPI?.setLanguage?.(value); } },
  { id: "ui.theme", label: t("Tema claro ou escuro"), help: t("Alterna a aparência do app entre claro e escuro."), where: t("Central do Sistema → Aparência"), tab: "appearance", type: "select", options: [{ value: "light", label: t("Claro") }, { value: "dark", label: t("Escuro") }], default: "dark", risk: "a" },
  { id: "ui.themePreset", label: t("Tema de cores"), help: t("Conjunto de cores do app (predefinido ou criado por você)."), where: t("Central do Sistema → Aparência"), tab: "appearance", type: "text", default: "astra", risk: "a" },
  { id: "ui.zoom", label: t("Tamanho da fonte do app"), help: t("Aumenta ou diminui todo o app (em porcentagem)."), where: t("Central do Sistema → Acessibilidade"), tab: "accessibility", type: "number", min: 70, max: 200, default: 100, risk: "a" },
  { id: "ui.night.enabled", label: t("Modo noturno"), help: t("Filtro amarelado que cobre todo o app no horário escolhido."), where: t("Central do Sistema → Acessibilidade"), tab: "accessibility", type: "bool", default: false, risk: "a" },
  { id: "ui.night.from", label: t("Modo noturno: começa às"), help: t("Horário em que o filtro liga."), where: t("Central do Sistema → Acessibilidade"), tab: "accessibility", type: "time", default: "20:00", risk: "a" },
  { id: "ui.night.to", label: t("Modo noturno: termina às"), help: t("Horário em que o filtro desliga."), where: t("Central do Sistema → Acessibilidade"), tab: "accessibility", type: "time", default: "06:00", risk: "a" },
  { id: "ui.night.intensity", label: t("Modo noturno: intensidade"), help: t("Quão amarelado fica o filtro (10 a 80%)."), where: t("Central do Sistema → Acessibilidade"), tab: "accessibility", type: "number", min: 10, max: 80, default: 35, risk: "a" },
  { id: "speech.voice", label: t("Narrador: voz"), help: t("Voz usada para ler os arquivos em voz alta."), where: t("Central do Sistema → Acessibilidade"), tab: "accessibility", type: "text", default: "", risk: "a" },
  { id: "speech.rate", label: t("Narrador: velocidade"), help: t("Velocidade da leitura (0,5 a 2)."), where: t("Central do Sistema → Acessibilidade"), tab: "accessibility", type: "number", min: 0.5, max: 2, default: 1, risk: "a" },
  { id: "editor.fontSize", label: t("Tamanho da fonte do editor"), help: t("Tamanho do texto no editor (em pixels)."), where: t("Central do Sistema → Editor"), tab: "editor", type: "number", min: 11, max: 40, default: 16, risk: "a" },
  { id: "editor.fontBody", label: t("Fonte do texto do editor"), help: t("Tipo de letra do texto normal."), where: t("Central do Sistema → Editor"), tab: "editor", type: "select", options: EDITOR_FONTS, default: "default", risk: "a" },
  { id: "editor.fontHeading", label: t("Fonte dos títulos do editor"), help: t("Tipo de letra dos títulos (pode ser diferente do texto)."), where: t("Central do Sistema → Editor"), tab: "editor", type: "select", options: EDITOR_FONTS, default: "default", risk: "a" },
  { id: "chat.notify", label: t("Avisar quando a IA responder com o chat fechado"), help: t("Com a gaveta do chat recolhida, uma bolinha aparece no cabeçalho e toca um som suave quando a IA termina de responder."), where: t("Central do Sistema → Geral"), tab: "general", type: "bool", default: true, risk: "a" },
  { id: "productivity.enabled", label: t("Mostrar o cronômetro"), help: t("Mostra o cronômetro de escrita entre as abas e a busca do explorer. Desligado, ele não aparece nem conta."), where: t("Central do Sistema → Produtividade"), tab: "productivity", type: "bool", default: false, risk: "a" },
  { id: "productivity.auto", label: t("Cronômetro automático"), help: t("O cronômetro para sozinho quando você se ausenta (sem foco ou parado) e volta quando você volta."), where: t("Central do Sistema → Produtividade"), tab: "productivity", type: "bool", default: true, risk: "a" },
  { id: "productivity.goalMinutes", label: t("Meta de tempo (minutos)"), help: t("Com uma meta, o cronômetro conta de forma regressiva (ex.: 60 min para escrever por 1 hora). Quando o tempo acaba, toca um som suave e aparece um aviso positivo. 0 = sem meta (conta para a frente)."), where: t("Central do Sistema → Produtividade"), tab: "productivity", type: "number", min: 0, max: 480, default: 0, risk: "a" },
  { id: "productivity.idleMinutes", label: t("Minutos sem atividade para ausência"), help: t("Sem mexer o mouse nem o teclado por este tempo, o cronômetro automático para."), where: t("Central do Sistema → Produtividade"), tab: "productivity", type: "number", min: 1, max: 30, default: 2, risk: "a" },
  { id: "updates.auto", label: t("Atualização automática"), help: t("Procura e baixa novas versões do app ao abrir (só no app instalado)."), where: t("Central do Sistema → Atualização"), tab: "update", type: "bool", default: true, risk: "b" },
  { id: "backup.auto", label: t("Backup automático"), help: t("Ao abrir o app, copia os livros para a pasta de backup se já passou o intervalo."), where: t("Central do Sistema → Backup"), tab: "backup", type: "bool", default: false, risk: "b" },
  { id: "backup.folder", label: t("Pasta de backup"), help: t("Pasta onde ficam as cópias dos livros (pode ser uma pasta do Google Drive, OneDrive ou Dropbox)."), where: t("Central do Sistema → Backup"), tab: "backup", type: "text", default: "", risk: "c" },
  { id: "backup.keep", label: t("Cópias mantidas por livro"), help: t("Quantas cópias de cada livro ficam na pasta de backup (as mais antigas são apagadas)."), where: t("Central do Sistema → Backup"), tab: "backup", type: "number", min: 1, max: 50, default: 2, risk: "b" },
  { id: "backup.everyHours", label: t("Intervalo do backup (horas)"), help: t("De quantas em quantas horas o backup automático roda ao abrir o app."), where: t("Central do Sistema → Backup"), tab: "backup", type: "number", min: 1, max: 720, default: 24, risk: "b" },
  { id: "skills.askAlways", label: t("Todas as skills pedem permissão"), help: t("Qualquer skill pede sua permissão (com a estimativa de tokens) antes de rodar."), where: t("Central de IA → Skills"), central: "ai", tab: "skills", type: "bool", default: false, risk: "c" },
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
      if (!Number.isFinite(n)) throw new Error(t("\"{label}\" precisa de um número.", { label: def.label }));
      return Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, n));
    }
    case "time": {
      const text = String(value).trim();
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new Error(t("\"{label}\" precisa de um horário no formato HH:MM.", { label: def.label }));
      return text;
    }
    case "select": {
      const text = String(value);
      // Fontes aceitam também um nome digitado
      if (def.options.some((o) => o.value === text) || def.id.startsWith("editor.font")) return text;
      throw new Error(t("\"{label}\": valor inválido. Opções: {options}.", { label: def.label, options: def.options.map((o) => o.value).join(", ") }));
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
