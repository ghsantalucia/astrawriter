/**
 * @file Provedor Ollama (modelos locais). Usa a API nativa (`/api/chat`), que permite definir o tamanho do contexto —
 * o padrão do Ollama (4096 tokens) é pequeno demais para o prompt do app e cortaria o texto em silêncio. Modelos sem
 * suporte a tools usam o modo simulado.
 */

import { t } from "../../../../shared/i18n.js";
import { normalizeHistory, runToolLoop } from "../../toolLoop.js";
import { requestJson, safeJson } from "../openaiCompat.js";
import {
  buildSimulatedToolsPrompt,
  formatSimulatedResults,
  looksLikeNoToolSupport,
  needsSimulation,
  parseSimulatedCalls,
} from "../../simulatedTools.js";

export const OLLAMA_URL = "http://localhost:11434";
export const OLLAMA_DEFAULT_CONTEXT = 16384;

const host = (config) => String(config.baseUrl || OLLAMA_URL).replace(/\/+$/, "").replace(/\/v1$/, "");

/** Uma passada completa no modo nativo ou simulado. */
async function run({ simulated, prompt, history, config, systemPrompt, tools, toolContext }) {
  const system = simulated ? systemPrompt + buildSimulatedToolsPrompt(tools.getDefinitions()) : systemPrompt;

  return runToolLoop({
    conversation: [{ role: "system", content: system }, ...normalizeHistory(prompt, history)],
    toolContext,

    async callModel(messages) {
      const body: any = {
        model: config.model,
        messages,
        stream: false,
        options: { num_ctx: Number(config.numCtx) || OLLAMA_DEFAULT_CONTEXT },
      };
      // Lidas a cada rodada: tools liberadas durante a conversa entram na rodada seguinte
      const definitions = tools.getDefinitions();
      if (!simulated && definitions.length) {
        body.tools = definitions.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
      }
      const data = await requestJson({
        provider: "ollama",
        label: "Ollama",
        url: `${host(config)}/api/chat`,
        body,
        model: config.model,
      });
      const message = data?.message || {};
      const usage = { input: data?.prompt_eval_count || 0, output: data?.eval_count || 0 };

      if (simulated) {
        const parsed = parseSimulatedCalls(message.content);
        return { usage, raw: message.content || "", text: parsed.text, toolCalls: parsed.toolCalls };
      }
      return {
        usage,
        raw: message,
        text: String(message.content || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim(),
        toolCalls: (message.tool_calls || []).map((c, i) => ({
          id: `ollama-${Date.now().toString(36)}-${i}`,
          name: c.function?.name,
          args: safeJson(c.function?.arguments),
        })),
      };
    },

    appendToolResults(messages, turn, results) {
      if (simulated) {
        messages.push({ role: "assistant", content: turn.raw });
        messages.push({ role: "user", content: formatSimulatedResults(results) });
        return;
      }
      messages.push(turn.raw);
      for (const r of results) messages.push({ role: "tool", tool_name: r.call.name, content: r.output });
    },
  });
}

/**
 * Envia o prompt ao modelo local, com tool calling nativo ou simulado.
 * @param {Object} args - Argumentos do gateway (`prompt`, `history`, `config`, `systemPrompt`, `tools`, `toolContext`).
 * @returns {Promise<{text: string, usage: Object}>}
 */
export async function sendRequest(args) {
  const { config } = args;
  if (!config.model) throw new Error(t("Escolha um modelo do Ollama na Central de IA (use “Atualizar modelos”)."));
  const key = `${host(config)}|${config.model}`;
  const mode = config.toolMode || "auto";
  if (mode === "simulated" || (mode === "auto" && needsSimulation(key))) return run({ ...args, simulated: true });
  try {
    return await run({ ...args, simulated: false });
  } catch (error) {
    if (mode === "auto" && args.tools.getDefinitions().length && looksLikeNoToolSupport(error)) {
      needsSimulation(key, true);
      return run({ ...args, simulated: true });
    }
    throw error;
  }
}

/**
 * Lista os modelos instalados no Ollama.
 * @param {Object} config - Configuração da conta (`baseUrl`).
 * @returns {Promise<Array<{id: string, label: string}>>}
 */
export async function listModels(config) {
  const data = await requestJson({ provider: "ollama", label: "Ollama", url: `${host(config)}/api/tags` });
  return (data?.models || []).map((m) => ({ id: m.name || m.model, label: m.name || m.model }));
}
