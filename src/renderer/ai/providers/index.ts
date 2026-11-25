/**
 * @file Catálogo dos provedores de IA disponíveis (usado para montar os selects das configurações).
 * Cada `id` corresponde a uma pasta em /ai/providers que exporta `sendRequest`
 * e, opcionalmente, `listModels`.
 */

import { CLAUDE_MODELS, CLAUDE_DEFAULT_MODEL } from "./claude/models.js";
import { MOCK_MODELS, MOCK_DEFAULT_MODEL } from "./mock/models.js";
import { GEMINI_MODELS, GEMINI_DEFAULT_MODEL } from "./gemini/models.js";
import { OPENAI_URL } from "./openai/index.js";
import { GROQ_URL } from "./groq/index.js";
import { PUTER_URL } from "./puter/index.js";
import { OLLAMA_URL, OLLAMA_DEFAULT_CONTEXT } from "./ollama/index.js";

/**
 * @typedef {Object} AiProviderInfo
 * @property {string} id - Nome da pasta do provedor.
 * @property {string} label - Nome exibido na interface.
 * @property {Array<{id: string, label: string}>} models - Modelos padrão do select.
 * @property {string} defaultModel
 * @property {boolean} requiresKey - Se o provedor exige chave de API.
 * @property {string} [defaultUrl] - Endereço padrão (provedores que permitem trocá-lo ou rodam localmente).
 * @property {boolean} [editableUrl] - Se a conta pode informar o endereço do servidor.
 * @property {boolean} [toolModes] - Se aceita escolher entre tool calling nativo, simulado ou automático.
 * @property {string} [hint] - Dica exibida ao cadastrar a conta.
 */

/** @type {AiProviderInfo[]} */
export const AI_PROVIDERS = [
  {
    id: "claude",
    label: "Claude (Anthropic)",
    models: CLAUDE_MODELS,
    defaultModel: CLAUDE_DEFAULT_MODEL,
    requiresKey: true,
  },
  {
    id: "gemini",
    label: "Gemini (Google)",
    models: GEMINI_MODELS,
    defaultModel: GEMINI_DEFAULT_MODEL,
    requiresKey: true,
  },
  {
    id: "openai",
    label: "ChatGPT (OpenAI)",
    models: [
      { id: "gpt-5-mini", label: "GPT-5 mini" },
      { id: "gpt-5", label: "GPT-5" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4o-mini", label: "GPT-4o mini" },
    ],
    defaultModel: "gpt-5-mini",
    requiresKey: true,
    defaultUrl: OPENAI_URL,
    toolModes: true,
    hint: "Chave em platform.openai.com (a API é paga, separada da assinatura do ChatGPT).",
  },
  {
    id: "groq",
    label: "Groq",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B (rápido)" },
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
      { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B" },
      { id: "qwen/qwen3-32b", label: "Qwen3 32B" },
    ],
    defaultModel: "llama-3.3-70b-versatile",
    requiresKey: true,
    defaultUrl: GROQ_URL,
    toolModes: true,
    hint: "Chave gratuita em console.groq.com. O plano grátis tem limites por minuto e por dia.",
  },
  {
    id: "puter",
    label: "Puter",
    models: [
      { id: "auto", label: "Automático (o Puter escolhe o modelo)" },
      { id: "gpt-5-nano", label: "GPT-5 nano" },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
      { id: "grok-4-1-fast", label: "Grok 4.1 fast" },
    ],
    defaultModel: "auto",
    requiresKey: true,
    defaultUrl: PUTER_URL,
    toolModes: true,
    hint: "Usa a biblioteca oficial do Puter. Cole o token de puter.com/dashboard (“Create token”) e use “Atualizar modelos” para ver os modelos da sua conta. O uso é cobrado da sua conta Puter; sem assinatura, alguns modelos respondem com erro 402.",
  },
  {
    id: "ollama",
    label: "Ollama (modelo local)",
    models: [],
    defaultModel: "",
    requiresKey: false,
    local: true,
    defaultUrl: OLLAMA_URL,
    editableUrl: true,
    toolModes: true,
    defaultContext: OLLAMA_DEFAULT_CONTEXT,
    hint: "Roda no seu computador, sem chave. Instale o Ollama e baixe um modelo (ex.: ollama pull qwen3:4b-instruct); depois use “Atualizar modelos”.",
  },
  {
    id: "compat",
    label: "Servidor compatível com OpenAI",
    models: [],
    defaultModel: "",
    requiresKey: false,
    local: true,
    defaultUrl: "http://localhost:1234/v1",
    editableUrl: true,
    toolModes: true,
    hint: "Qualquer servidor com a API da OpenAI: LM Studio, llama.cpp, vLLM, Jan, OpenRouter... Informe o endereço (termina em /v1) e, se houver, a chave.",
  },
  {
    id: "mock",
    label: "Assistente Astra (embutido, sem IA)",
    models: MOCK_MODELS,
    defaultModel: MOCK_DEFAULT_MODEL,
    requiresKey: false,
  },
];

export const DEFAULT_AI_PROVIDER = "claude";

/**
 * @param {string} id
 * @returns {AiProviderInfo|undefined}
 */
export function getProviderInfo(id) {
  return AI_PROVIDERS.find((p) => p.id === id);
}
