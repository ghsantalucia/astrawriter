// @ts-nocheck
/**
 * @file Roteador dinâmico de provedores de IA, com fallback automático de modelos e registro de depuração.
 */

import { CONCISE_NOTE, compactInstructions } from "./compact.js";
import { getProviderInfo } from "./providers/index.js";
import { buildSystemPrompt } from "./prompts/index.js";
import { chatOnlyRegistry } from "./aiTools.js";
import { ToolView } from "./toolTiers.js";
import { addDailyUsage } from "./usageTracker.js";
import { setHistoryLimit } from "./toolLoop.js";
import { resolveAnalysis } from "./profiles.js";
import {
  currentToolCount,
  ensureDebugLoaded,
  finishExchange,
  startExchange,
} from "./debugLog.js";

const CHAT_ONLY_NOTE =
  "\n\n# Modo apenas conversa\nO autor desativou as ferramentas: você NÃO pode ler nem alterar arquivos do livro. Converse e oriente com base no que ele escrever na conversa; se precisar de um trecho do livro, peça que ele cole aqui.";

/** Códigos HTTP em que vale tentar o próximo modelo da lista de fallback (limite de uso e instabilidade do serviço). */
const FALLBACK_STATUS = new Set([429, 500, 502, 503, 504, 529]);

/**
 * Indica se o erro justifica tentar outro modelo.
 * @param {Error & {status?: number, isRateLimit?: boolean}} error - Erro do provedor.
 * @returns {boolean}
 */
function worthFallback(error) {
  return Boolean(error?.isRateLimit || FALLBACK_STATUS.has(error?.status));
}

/**
 * Campos extras da conta repassados ao provedor (endereço do servidor, modo de tools, contexto).
 * @param {Object} account - Conta de IA.
 * @returns {Object}
 */
export function accountExtras(account) {
  const out = {};
  if (account.baseUrl) out.baseUrl = account.baseUrl;
  if (account.toolMode) out.toolMode = account.toolMode;
  if (account.numCtx) out.numCtx = account.numCtx;
  return out;
}

/**
 * Cadeia de modelos a tentar: a conta ativa primeiro e, com o fallback ligado, as contas configuradas na lista (só as que têm
 * chave, ou que não precisam dela).
 * @param {Object} state - Estado global.
 * @returns {Array<{provider: string, label: string, config: Object}>}
 */
export function buildModelChain(state) {
  const settings = state.aiSettings || {};
  const accounts = settings.accounts || [];
  const active = accounts.find((a) => a.id === settings.activeAccount);
  const chain = [];
  const pinfo = getProviderInfo(state.aiProvider);
  if (pinfo) {
    const saved = settings.providers?.[state.aiProvider] || {};
    chain.push({
      provider: state.aiProvider,
      label: active?.nickname || pinfo.label,
      config: { ...saved, model: saved.model || pinfo.defaultModel },
    });
  }
  if (settings.fallback?.enabled) {
    for (const item of settings.fallback.chain || []) {
      const account = item.accountId
        ? accounts.find((a) => a.id === item.accountId)
        : accounts.find((a) => a.provider === item.provider && a.apiKey);
      const info = getProviderInfo(account?.provider);
      if (!account || !info || (info.requiresKey && !account.apiKey)) continue;
      const model = item.model || account.model || info.defaultModel;
      if (account.id === settings.activeAccount && model === chain[0]?.config.model) continue;
      chain.push({ provider: account.provider, label: account.nickname, config: { ...accountExtras(account), apiKey: account.apiKey, model } });
    }
  }
  return chain;
}

/**
 * Executa uma chamada a um provedor/modelo.
 * @param {Object} target - `{ provider, config }`.
 * @param {Object} args - Argumentos do `sendRequest`.
 * @returns {Promise<{text: string, usage: Object}>}
 */
async function callProvider(target, args) {
  const providerModule = await import(`./providers/${target.provider}/index.ts`);
  if (typeof providerModule.sendRequest !== "function") {
    throw new Error(`O provedor "${target.provider}" não exporta o método "sendRequest".`);
  }
  return providerModule.sendRequest({ ...args, config: target.config });
}

/**
 * Processa a instrução enviada direcionando para o provedor ativo (e, se ele falhar por limite ou instabilidade, para o
 * próximo da lista de fallback). O prompt de sistema e as ferramentas são os mesmos para todos os provedores.
 * @param {Object} params
 * @param {string} params.prompt - Texto/instrução simples enviada.
 * @param {Array} [params.history=[]] - Histórico bruto de conversas.
 * @param {Object} state - Estado global da aplicação.
 * @param {Object} toolContext - Contexto repassado às ferramentas (state, fileService).
 * @returns {Promise<{text: string, usage: Object}>} Texto final e consumo de tokens.
 */
export async function processPrompt({ prompt, history = [] }, state, toolContext) {
  const info = getProviderInfo(state.aiProvider);
  if (!info) {
    throw new Error(`Provedor de IA "${state.aiProvider}" inválido. Selecione um em Configurações.`);
  }

  await ensureDebugLoaded(state.currentBookPath || null);
  const chain = buildModelChain(state);
  // Perfil de uso: histórico enviado e modo "apenas conversa" (sem tools)
  const profile = resolveAnalysis(state.aiSettings?.analysis);
  setHistoryLimit(profile.historyLimit);
  // Tools enviadas: nenhuma além das do chat (apenas conversa) ou as do modo do perfil (mínimo, sumário, mais usadas, todas)
  const tools = profile.chatOnly ? chatOnlyRegistry : new ToolView(profile.toolsMode, state.currentBookPath || null, toolContext?.allowedTools || null, profile.compact);
  toolContext = { ...toolContext, toolView: tools };
  const baseSystem = buildSystemPrompt(state, profile.compact);
  const systemPrompt =
    (profile.compact ? compactInstructions(baseSystem) + CONCISE_NOTE : baseSystem) +
    (profile.chatOnly ? CHAT_ONLY_NOTE : tools.promptNote());
  let lastError = null;

  for (let i = 0; i < chain.length; i++) {
    const target = chain[i];
    const exchange = startExchange({
      kind: "chat",
      provider: target.provider,
      model: target.config.model,
      prompt,
      system: systemPrompt,
      history,
      toolsOffered: tools.getDefinitions().length,
    });
    if (i > 0) exchange.fallbackFrom = `${chain[0].provider} · ${chain[0].config.model}`;

    try {
      const result = await callProvider(target, {
        prompt,
        history,
        systemPrompt,
        tools,
        toolContext,
      });
      finishExchange(exchange, result);
      if (i > 0) await announceFallback(chain[0], target, toolContext);
      return result;
    } catch (error) {
      const toolsRan = currentToolCount() > 0 || exchange.tools.length > 0;
      finishExchange(exchange, { error });
      lastError = error;
      console.error(`[AI GATEWAY] Erro no provedor "${target.provider}":`, error);
      // Só tenta o próximo modelo se nada foi alterado ainda (evita repetir edições já feitas)
      if (!worthFallback(error) || toolsRan || i === chain.length - 1) throw error;
    }
  }
  throw lastError;
}

/**
 * Avisa que o modelo de fallback respondeu no lugar do principal (aviso na tela e registro no changelog como "Sistema").
 * @param {{provider: string, config: Object}} from - Modelo principal.
 * @param {{provider: string, config: Object}} to - Modelo que respondeu.
 * @param {Object} toolContext - Contexto (traz o serviço do changelog).
 * @returns {Promise<void>}
 */
async function announceFallback(from, to, toolContext) {
  const a = `${from.label || from.provider} · ${from.config.model}`;
  const b = `${to.label || to.provider} · ${to.config.model}`;
  toolContext?.notice?.(`Fallback automático: o modelo ${a} estava indisponível; a resposta veio de ${b}.`);
  try {
    await toolContext?.changelog?.recordSetting(
      { setting: "ai.fallback", from: a, to: b },
      toolContext.changelog.systemActor(),
    );
  } catch {
    // o aviso na tela já foi dado
  }
}

/**
 * Chamada única à IA, sem ferramentas nem histórico (usada pelas análises em segundo plano: digests e verificação de
 * contradições). Usa o mesmo modelo ativo e o mesmo fallback do chat, entra no registro de depuração e no contador de uso.
 * @param {Object} params
 * @param {string} params.system - Instruções de sistema.
 * @param {string} params.prompt - Conteúdo a processar.
 * @param {string} [params.kind="task"] - Rótulo da chamada no registro de depuração.
 * @param {Object} state - Estado global.
 * @returns {Promise<{text: string, usage: Object, provider: string, model: string}>}
 */
export async function askModel({ system, prompt, kind = "task" }, state) {
  await ensureDebugLoaded(state.currentBookPath || null);
  const chain = buildModelChain(state);
  if (chain.length === 0) throw new Error("Nenhum provedor de IA configurado.");
  const noTools = { getDefinitions: () => [], execute: async () => ({ output: "", isError: true }) };
  let lastError = null;

  for (let i = 0; i < chain.length; i++) {
    const target = chain[i];
    const exchange = startExchange({
      kind,
      provider: target.provider,
      model: target.config.model,
      prompt,
      system,
    });
    try {
      const result = await callProvider(target, {
        prompt,
        history: [],
        systemPrompt: system,
        tools: noTools,
        toolContext: {},
      });
      finishExchange(exchange, result);
      addDailyUsage(target.provider, target.config.model, {
        requests: result.usage?.requests || 1,
        input: result.usage?.inputTokens || 0,
        output: result.usage?.outputTokens || 0,
      });
      return { ...result, provider: target.provider, model: target.config.model };
    } catch (error) {
      finishExchange(exchange, { error });
      lastError = error;
      if (!worthFallback(error) || i === chain.length - 1) throw error;
    }
  }
  throw lastError;
}
