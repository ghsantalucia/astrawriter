// @ts-nocheck
/**
 * @file Quantas tools vão para o modelo a cada pedido, definido pelo perfil de uso da IA (`toolsMode`). As definições das
 * tools são a maior parte do custo de um pedido (e contam no limite de tokens por minuto dos provedores), então:
 *
 * - `minimal`: só as tools internas do chat (botões de resposta pronta) e a leitura de arquivos (com a permissão do autor);
 * - `summary`: nenhuma definição completa; o prompt traz um sumário de 1 linha por tool e a IA pede as especificações das
 *   que precisar com `get_tool_specs`;
 * - `popular`: as tools mais usadas completas + o sumário das demais;
 * - `all`: todas as tools, completas.
 *
 * As tools pedidas com `get_tool_specs` ficam liberadas pelo resto da sessão (do livro aberto). Como as APIs não guardam
 * estado entre pedidos, o sumário (e as definições liberadas) vão em todo pedido; o que muda é o tamanho deles.
 */

import { compactDescription } from "./compact.js";
import { toolRegistry } from "./aiTools.js";

/** Modos de envio de tools. */
export const TOOLS_MODES = ["minimal", "summary", "popular", "all"];

/** Tools internas do chat: sempre disponíveis, em qualquer modo. */
const CHAT_TOOLS = ["show_buttons"];

/** Tools do modo mínimo (além das do chat): ler arquivos quando o autor pedir. */
const MINIMAL_TOOLS = ["read_file"];

/** Tools mais usadas, enviadas completas no modo equilibrado. */
const POPULAR_TOOLS = [
  "list_files",
  "read_file",
  "write_file",
  "append_to_file",
  "replace_in_file",
  "load_skill",
  "list_issues",
  "get_file_digest",
  "search_facts",
  "get_file_variables",
  "open_file_in_editor",
  "open_central",
  "search_book",
];

/** Nome da tool que entrega as especificações completas das demais. */
export const SPECS_TOOL = "get_tool_specs";

/** Tools liberadas (especificação pedida) na sessão atual. */
const unlocked = new Set();
let unlockedBook = null;

/**
 * Resumo de uma linha da tool (a primeira frase da descrição).
 * @param {{name: string, description: string}} def - Definição.
 * @returns {string}
 */
function oneLine(def) {
  const first = String(def.description || "").split(/(?<=[.!?])\s/)[0].replace(/\s+/g, " ").trim();
  return first.length > 130 ? `${first.slice(0, 127)}...` : first;
}

/**
 * Conjunto de tools oferecido ao modelo (mesma interface do registro de tools que os provedores usam).
 * @class
 */
export class ToolView {
  /**
   * @param {"minimal"|"summary"|"popular"|"all"} mode - Modo do perfil de uso.
   * @param {string|null} bookPath - Livro aberto (as tools liberadas valem para ele).
   */
  constructor(mode, bookPath, allow = null, compact = false) {
    /** "Otimizar instruções": descrições das tools mais curtas. */
    this.compact = Boolean(compact);
    this.mode = TOOLS_MODES.includes(mode) ? mode : "all";
    /** Execução de skill: só as tools que a skill declara (mais as do chat). */
    this.allow = allow ? new Set(allow) : null;
    if (bookPath !== unlockedBook) {
      unlocked.clear();
      unlockedBook = bookPath;
    }
  }

  /** @returns {Set<string>} Tools cuja especificação completa já pode ir ao modelo. */
  fullNames() {
    const names = new Set(CHAT_TOOLS);
    if (this.allow) {
      this.allow.forEach((n) => toolRegistry.tools.has(n) && names.add(n));
      return names;
    }
    if (this.mode === "all") toolRegistry.tools.forEach((_, n) => names.add(n));
    else if (this.mode === "minimal") MINIMAL_TOOLS.forEach((n) => names.add(n));
    else {
      if (this.mode === "popular") POPULAR_TOOLS.forEach((n) => names.add(n));
      unlocked.forEach((n) => names.add(n));
    }
    return names;
  }

  /** @returns {boolean} O modo usa sumário + `get_tool_specs`? */
  get usesSummary() {
    return !this.allow && (this.mode === "summary" || this.mode === "popular");
  }

  /**
   * Definições completas enviadas ao modelo neste momento.
   * @returns {Array<{name: string, description: string, parameters: Object}>}
   */
  getDefinitions() {
    const full = this.fullNames();
    let defs = toolRegistry.getDefinitions().filter((d) => full.has(d.name));
    if (this.compact) defs = defs.map((d) => ({ ...d, description: compactDescription(d.description) }));
    if (this.usesSummary) defs.push(this.specsToolDefinition());
    return defs;
  }

  /** @returns {{name: string, description: string, parameters: Object}} Definição da tool de especificações. */
  specsToolDefinition() {
    return {
      name: SPECS_TOOL,
      description:
        "Devolve a especificação completa (descrição e parâmetros) de tools do sumário e as libera para uso. Chame antes de usar uma tool que só aparece no sumário.",
      parameters: {
        type: "object",
        properties: {
          names: { type: "array", items: { type: "string" }, description: "Nomes das tools do sumário." },
        },
        required: ["names"],
      },
    };
  }

  /**
   * Texto acrescentado ao prompt de sistema: o sumário das tools que não vão completas.
   * @returns {string}
   */
  promptNote() {
    if (!this.usesSummary) return "";
    const full = this.fullNames();
    const rest = toolRegistry.getDefinitions().filter((d) => !full.has(d.name));
    if (rest.length === 0) return "";
    return `\n\n# Outras tools (sumário)\nAlém das tools declaradas, existem as abaixo. Para usar uma delas, chame antes \`${SPECS_TOOL}\` com os nomes (recebe a especificação e a tool fica liberada).\n${rest.map((d) => `- ${d.name}: ${oneLine(d)}`).join("\n")}`;
  }

  /**
   * Executa uma tool, recusando as que não foram oferecidas neste modo.
   * @param {string} name - Tool.
   * @param {Object} args - Argumentos.
   * @param {Object} ctx - Contexto das tools.
   * @returns {Promise<{output: string, isError: boolean}>}
   */
  async execute(name, args, ctx) {
    if (name === SPECS_TOOL && this.usesSummary) return this.specs(args);
    if (!this.fullNames().has(name)) {
      return {
        output: this.usesSummary
          ? `A tool "${name}" ainda não está liberada: chame ${SPECS_TOOL} com o nome dela.`
          : `A tool "${name}" não está disponível neste modo de uso da IA.`,
        isError: true,
      };
    }
    return toolRegistry.execute(name, args, ctx);
  }

  /**
   * Especificações pedidas (e liberação das tools).
   * @param {{names?: string[]}} args - Nomes pedidos.
   * @returns {{output: string, isError: boolean}}
   */
  specs(args) {
    const wanted = Array.isArray(args?.names) ? args.names.map(String) : [];
    if (wanted.length === 0) return { output: "Informe 'names' com os nomes das tools do sumário.", isError: true };
    const all = new Map(toolRegistry.getDefinitions().map((d) => [d.name, d]));
    const found = [];
    const missing = [];
    for (const name of wanted) {
      if (all.has(name)) {
        unlocked.add(name);
        found.push(all.get(name));
      } else missing.push(name);
    }
    const output = JSON.stringify({ liberadas: found, desconhecidas: missing }, null, 1);
    return { output, isError: found.length === 0 };
  }
}
