// @ts-nocheck
/**
 * @file Puter pela biblioteca oficial (`@heyputer/puter.js`, versão Node). O token fica só aqui, no processo principal; a
 * interface pede o chat e a lista de modelos por IPC. A resposta é devolvida no formato da OpenAI (`choices[0].message`),
 * que o restante do app já entende.
 */

/** Um cliente do Puter por token (a biblioteca carrega um pacote grande ao iniciar). */
const clients = new Map();

/**
 * Cliente do Puter autenticado com o token.
 * @param {string} token - Token da conta Puter.
 * @returns {any}
 */
function client(token) {
  if (!clients.has(token)) {
    // Carregada só quando o Puter é usado (require em tempo de execução, como o jszip)
    const { init } = require("@heyputer/puter.js/src/init.cjs");
    clients.set(token, init(token));
  }
  return clients.get(token);
}

/**
 * Converte o erro (objeto simples da biblioteca ou Error) em algo serializável pelo IPC.
 * @param {any} error - Erro.
 * @returns {{status?: number, code?: string, message: string}}
 */
function serializeError(error) {
  const inner = error?.error && typeof error.error === "object" ? error.error : error;
  const code = inner?.code || error?.code;
  let status = Number(inner?.status || inner?.statusCode || error?.status) || undefined;
  if (!status && code === "subscription_required") status = 402;
  if (!status && (code === "token_auth_failed" || code === "auth_required")) status = 401;
  const message = String(inner?.message || error?.message || (typeof error === "string" ? error : "Erro desconhecido do Puter."));
  return { status, code, message };
}

/**
 * Normaliza o conteúdo de uma mensagem (texto ou blocos) para texto.
 * @param {any} content - Conteúdo.
 * @returns {string}
 */
function contentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((b) => (typeof b === "string" ? b : b?.text || "")).join("");
  return content == null ? "" : String(content);
}

/**
 * Conversa com um modelo pelo Puter.
 * @param {{token: string, model?: string, messages: Array<Object>, tools?: Array<Object>}} params - Pedido.
 * @returns {Promise<{ok: true, data: Object}|{ok: false, error: Object}>}
 */
export async function puterChat({ token, model, messages, tools }) {
  try {
    if (!token) return { ok: false, error: { status: 401, message: "Informe o token do Puter na conta." } };
    const options = { normalize: true };
    if (model) options.model = model;
    if (Array.isArray(tools) && tools.length) options.tools = tools;
    const result = await client(token).ai.chat(messages, options);
    const raw = result?.message ?? result?.choices?.[0]?.message ?? { content: result };
    const message = { role: "assistant", content: contentText(raw.content) };
    if (Array.isArray(raw.tool_calls) && raw.tool_calls.length) message.tool_calls = raw.tool_calls;
    const usage = result?.usage || {};
    return {
      ok: true,
      data: {
        choices: [{ message }],
        usage: {
          prompt_tokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
          completion_tokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
        },
      },
    };
  } catch (error) {
    return { ok: false, error: serializeError(error) };
  }
}

/**
 * Lista os modelos de chat disponíveis para a conta.
 * @param {{token: string}} params - Token.
 * @returns {Promise<{ok: true, models: Array<{id: string, label: string}>}|{ok: false, error: Object}>}
 */
export async function puterModels({ token }) {
  try {
    if (!token) return { ok: false, error: { status: 401, message: "Informe o token do Puter na conta." } };
    const list = await client(token).ai.listModels();
    const models = (Array.isArray(list) ? list : [])
      .map((m) => (typeof m === "string" ? { id: m, label: m } : { id: m.id || m.name, label: m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id }))
      .filter((m) => m.id)
      .sort((a, b) => a.id.localeCompare(b.id));
    return { ok: true, models };
  } catch (error) {
    return { ok: false, error: serializeError(error) };
  }
}
