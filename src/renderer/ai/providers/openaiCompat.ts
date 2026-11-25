/**
 * @file Cliente e provedor genéricos para APIs compatíveis com a OpenAI (`/chat/completions`): ChatGPT, Groq, Puter, LM
 * Studio, llama.cpp, vLLM e qualquer outro servidor desse padrão. Cada provedor concreto (pastas `openai`, `groq`...) só
 * informa o endereço padrão. Suporta tool calling nativo e, quando o modelo não o tem, o modo simulado.
 */

import { t } from "../../../shared/i18n.js";
import { AiApiError, formatDuration } from "../apiError.js";
import { activeSignal } from "../abort.js";
import { normalizeHistory, runToolLoop } from "../toolLoop.js";
import {
  buildSimulatedToolsPrompt,
  formatSimulatedResults,
  looksLikeNoToolSupport,
  needsSimulation,
  parseSimulatedCalls,
} from "../simulatedTools.js";

/**
 * Endereço base sem barra final.
 * @param {string} baseUrl - Endereço informado.
 * @returns {string}
 */
const trimUrl = (baseUrl) => String(baseUrl || "").replace(/\/+$/, "");

/**
 * Faz uma chamada HTTP e converte falhas (rede, status) em {@link AiApiError} legíveis.
 * @param {Object} params
 * @param {string} params.provider - Id do provedor (para o log de erros).
 * @param {string} params.label - Nome exibido nas mensagens.
 * @param {string} params.url - Endereço completo.
 * @param {Object} [params.body] - Corpo JSON (omitido: GET).
 * @param {string} [params.apiKey] - Chave (cabeçalho Bearer).
 * @param {string} [params.model] - Modelo (aparece nas mensagens).
 * @returns {Promise<Object>} JSON da resposta.
 */
export async function requestJson({ provider, label, url, body, apiKey, model = "" }: { provider: any; label: any; url: string; body?: any; apiKey?: any; model?: string }) {
  let response;
  try {
    response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      // Só as chamadas do chat (com corpo) podem ser interrompidas pelo autor
      signal: body ? activeSignal() : undefined,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new AiApiError(
      t("{label}: não foi possível conectar a {origin}. Confira se o serviço está em execução e o endereço está correto.", { label, origin: new URL(url).origin }),
      { provider, model, details: String(error?.message || error) },
    );
  }
  const data = await response.json().catch(() => null);
  if (response.ok) return data;

  const status = response.status;
  const detail = data?.error?.message || data?.error || data?.message || response.statusText;
  const text = typeof detail === "string" ? detail : JSON.stringify(detail);
  const info = { provider, model, status, details: data || text };
  if (status === 429) {
    const seconds = parseFloat(response.headers.get("retry-after")) || 0;
    const retryAfterMs = seconds * 1000 || undefined;
    return Promise.reject(
      new AiApiError(
        `${t("Limite de uso de {label} atingido para o modelo {model}.", { label, model })}${retryAfterMs ? ` ${t("Tente novamente em cerca de {time}.", { time: formatDuration(retryAfterMs) })}` : ""} ${text}`,
        { ...info, retryAfterMs, quotaPeriod: "other" },
      ),
    );
  }
  const reason =
    status === 401 || status === 403
      ? t("chave de API inválida ou sem permissão ({status}).", { status })
      : status === 404
        ? t("modelo ou endereço não encontrado (404). {text}", { text })
        : status >= 500
          ? t("serviço indisponível ({status}). Tente novamente em instantes.", { status })
          : t("erro {status}. {text}", { status, text });
  return Promise.reject(new AiApiError(`${label}: ${reason}`, info));
}

/**
 * Cria o provedor (`sendRequest` e `listModels`) para um serviço compatível com a OpenAI.
 * @param {Object} options
 * @param {string} options.id - Id do provedor.
 * @param {string} options.label - Nome exibido.
 * @param {string} options.baseUrl - Endereço base padrão (a conta pode trocá-lo).
 * @returns {{sendRequest: Function, listModels: Function}}
 */
export function createCompatProvider({ id, label, baseUrl: defaultUrl, request = requestJson, models: modelsFn = null }) {
  const baseOf = (config) => trimUrl(config.baseUrl || defaultUrl);

  /** Uma passada completa (laço de tools) no modo nativo ou simulado. */
  async function run({ simulated, prompt, history, config, systemPrompt, tools, toolContext }) {
    const system = simulated ? systemPrompt + buildSimulatedToolsPrompt(tools.getDefinitions()) : systemPrompt;
    const url = `${baseOf(config)}/chat/completions`;

    return runToolLoop({
      conversation: [{ role: "system", content: system }, ...normalizeHistory(prompt, history)],
      toolContext,

      async callModel(messages) {
        const body: any = { model: config.model, messages };
        // Lidas a cada rodada: tools liberadas durante a conversa entram na rodada seguinte
        const definitions = tools.getDefinitions();
        if (!simulated && definitions.length) {
          body.tools = definitions.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.parameters },
          }));
        }
        const data = await request({ provider: id, label, url, body, apiKey: config.apiKey, model: config.model });
        const message = data?.choices?.[0]?.message || {};
        const usage = { input: data?.usage?.prompt_tokens || 0, output: data?.usage?.completion_tokens || 0 };

        if (simulated) {
          const parsed = parseSimulatedCalls(message.content);
          return { usage, raw: message.content || "", text: parsed.text, toolCalls: parsed.toolCalls };
        }
        return {
          usage,
          raw: message,
          text: String(message.content || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim(),
          toolCalls: (message.tool_calls || []).map((c) => ({
            id: c.id,
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
        for (const r of results) messages.push({ role: "tool", tool_call_id: r.call.id, content: r.output });
      },
    });
  }

  async function sendRequest(args) {
    const { config } = args;
    if (!config.model) throw new Error(t("Escolha um modelo para {label} na Central de IA.", { label }));
    const key = `${baseOf(config)}|${config.model}`;
    const mode = config.toolMode || "auto";
    if (mode === "simulated" || (mode === "auto" && needsSimulation(key))) return run({ ...args, simulated: true });
    try {
      return await run({ ...args, simulated: false });
    } catch (error) {
      // No modo automático, um modelo que recusa `tools` passa a usar o modo simulado (lembrado até fechar o app)
      if (mode === "auto" && args.tools.getDefinitions().length && looksLikeNoToolSupport(error)) {
        needsSimulation(key, true);
        return run({ ...args, simulated: true });
      }
      throw error;
    }
  }

  async function listModels(config) {
    if (modelsFn) return modelsFn(config);
    const data = await requestJson({ provider: id, label, url: `${baseOf(config)}/models`, apiKey: config.apiKey });
    return (data?.data || [])
      .map((m) => ({ id: m.id, label: m.id, contextWindow: m.context_window || m.context_length || undefined }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  return { sendRequest, listModels };
}

/**
 * Lê JSON de forma tolerante (argumentos de tool vindos como texto).
 * @param {string|Object} value - Texto ou objeto.
 * @returns {Object}
 */
export function safeJson(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}
