/**
 * @file Utilitários compartilhados pelos provedores: laço de tool calling e normalização do histórico.
 */

import { toolRegistry } from "./aiTools.js";
import { recordTool } from "./debugLog.js";
import { abortError, raceAbort } from "./abort.js";

/** Quantidade máxima de mensagens anteriores enviadas como contexto (definida pelo perfil de uso da IA). */
export let MAX_HISTORY_MESSAGES = 50;

/**
 * Define quantas mensagens anteriores vão junto a cada pedido.
 * @param {number} n - Quantidade (entre 2 e 100).
 * @returns {void}
 */
export function setHistoryLimit(n) {
  const value = Math.round(Number(n));
  if (value >= 2 && value <= 100) MAX_HISTORY_MESSAGES = value;
}

/** Limite de rodadas de tool calling por mensagem do usuário. */
const MAX_TOOL_ROUNDS = 10;

/**
 * Converte o histórico do chat em turnos alternados user/assistant, garantindo que o
 * prompt atual seja o último (sem duplicá-lo caso já esteja no histórico).
 * @param {string} prompt
 * @param {Array<{role: string, content: string}>} history
 * @returns {Array<{role: "user"|"assistant", content: string}>}
 */
export function normalizeHistory(prompt, history) {
  const turns = [];

  const push = (role, content) => {
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n\n${content}`;
    else turns.push({ role, content });
  };

  history
    .filter(
      (m) => (m.role === "user" || m.role === "assistant") && !m.error && m.content?.trim(),
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .forEach((m) => push(m.role, m.content));

  const last = turns[turns.length - 1];
  if (!(last?.role === "user" && last.content.endsWith(prompt))) {
    push("user", prompt);
  }

  while (turns.length > 1 && turns[0].role !== "user") turns.shift();
  return turns;
}

/**
 * @typedef {Object} TokenUsage
 * @property {number} inputTokens - Total de tokens de entrada consumidos (soma de todas as rodadas).
 * @property {number} outputTokens - Total de tokens de saída gerados.
 * @property {number} contextTokens - Tamanho do contexto na última chamada (ocupação da janela).
 * @property {number} requests - Quantidade de chamadas feitas ao modelo.
 * @property {Object|null} [rateLimits] - Limites de uso informados pela API (quando ela informa).
 */

/**
 * Executa o laço de tool calling: chama o modelo, executa as ferramentas pedidas e
 * devolve os resultados até o modelo responder só com texto.
 * @param {Object} params
 * @param {Object} params.conversation - Conversa no formato nativo do provedor (mutável).
 * @param {(conversation: Object) => Promise<{text: string, toolCalls: Array<{id?: string, name: string, args: Object}>, raw: any, usage?: {input: number, output: number}}>} params.callModel
 * @param {(conversation: Object, turn: Object, results: Array<{call: Object, output: string, isError: boolean}>) => void} params.appendToolResults
 * @param {Object} params.toolContext - Contexto repassado às ferramentas.
 * @returns {Promise<{text: string, usage: TokenUsage}>} Texto final da IA e o consumo de tokens.
 */
export async function runToolLoop({
  conversation,
  callModel,
  appendToolResults,
  toolContext,
}) {
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    contextTokens: 0,
    requests: 0,
    rateLimits: null,
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (toolContext?.signal?.aborted) throw abortError();
    const turn = await raceAbort(callModel(conversation), toolContext?.signal);

    usage.requests += 1;
    usage.rateLimits = turn.rateLimits || usage.rateLimits;
    usage.inputTokens += turn.usage?.input || 0;
    usage.outputTokens += turn.usage?.output || 0;
    usage.contextTokens = turn.usage?.input || usage.contextTokens;

    if (turn.toolCalls.length === 0) {
      return { text: turn.text || "(A IA não retornou texto.)", usage };
    }

    const results = [];
    for (const call of turn.toolCalls) {
      if (toolContext?.signal?.aborted) throw abortError();
      const { output, isError } = await (toolContext?.toolView || toolRegistry).execute(
        call.name,
        call.args,
        toolContext,
      );
      recordTool(call.name, call.args, output, isError);
      results.push({ call, output, isError });
    }
    appendToolResults(conversation, turn, results);
  }

  throw new Error("A IA excedeu o limite de chamadas de ferramentas.");
}
