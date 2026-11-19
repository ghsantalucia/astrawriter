// @ts-nocheck
/**
 * @file Registro de depuração das chamadas à IA (Central de IA > Depuração): o texto completo enviado (instruções do
 * sistema, histórico e mensagem), o que voltou, as tools usadas (com argumentos e resultado), o consumo de tokens e quantas
 * rodadas a interação levou. Só os 10 últimos turnos do chat (e 10 chamadas em segundo plano) são mantidos, e eles são
 * gravados em `.system/debug/recent.json` do livro para não se perderem ao reiniciar o app; o autor pode fixar um turno
 * (`.system/debug/pinned.json`), que fica salvo mesmo depois de sair dos 10 mais recentes. A chave de API nunca é registrada.
 */

import { readSystemJson, writeSystemJson } from "../review/reviewStore.js";

/** Quantos turnos recentes são mantidos (por grupo: chat e segundo plano). */
export const MAX_RECENT = 10;
const MAX_TEXT = 200000;
const MAX_TOOL_OUTPUT = 4000;
const PINNED_FILE = ".system/debug/pinned.json";
const RECENT_FILE = ".system/debug/recent.json";
/** Espera para gravar os recentes (agrupa mudanças seguidas, como as tools de um mesmo turno). */
const SAVE_DELAY_MS = 800;

/** @type {Array<Object>} */
const exchanges = [];
/** Turnos fixados do livro atual (cópias completas, gravadas em disco). @type {Array<Object>} */
let pinned = [];
const listeners = new Set();
let seq = 0;

/** Chamada em andamento (as tools executadas no meio dela são anexadas a ela). */
let current = null;

/** Livro cujos recentes estão carregados (e para onde são gravados). */
let recentBook = null;
let loading = null;
let saveTimer = null;

/**
 * Grava os recentes no livro (com a espera de agrupamento).
 * @returns {void}
 */
function scheduleSave() {
  if (!recentBook) return;
  clearTimeout(saveTimer);
  const book = recentBook;
  saveTimer = setTimeout(() => {
    if (book === recentBook) writeSystemJson(book, RECENT_FILE, exchanges).catch((e) => console.error("[DEBUG] Falha ao gravar os recentes:", e));
  }, SAVE_DELAY_MS);
}

/**
 * Garante que os recentes do livro estão carregados do disco (chamar antes de registrar turnos). Ao trocar de livro,
 * o registro passa a ser o daquele livro.
 * @param {string|null} bookPath - Pasta do livro aberto.
 * @returns {Promise<void>}
 */
export async function ensureDebugLoaded(bookPath) {
  const book = bookPath || null;
  if (book === recentBook && !loading) return;
  if (book === recentBook) return loading;
  recentBook = book;
  exchanges.length = 0;
  if (!book) {
    notify();
    return;
  }
  loading = (async () => {
    const saved = await readSystemJson(book, RECENT_FILE, []);
    if (book !== recentBook) return;
    const list = Array.isArray(saved) ? saved : [];
    for (const e of list) {
      // Um turno que estava em andamento quando o app fechou não terminou
      if (e.status === "running") {
        e.status = "error";
        e.error = "Interrompido: o app foi fechado antes da resposta.";
      }
      e.tools ||= [];
    }
    // Turnos registrados enquanto carregava ficam na frente
    exchanges.push(...list.filter((e) => !exchanges.some((x) => x.uid === e.uid)));
    notify();
  })().finally(() => {
    loading = null;
  });
  return loading;
}

/**
 * Corta um texto muito longo para o registro.
 * @param {any} value - Valor (vira texto).
 * @param {number} max - Tamanho máximo.
 * @returns {string}
 */
function clip(value, max) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 1) ?? "";
  return text.length > max ? `${text.slice(0, max)}\n[... +${text.length - max} caracteres]` : text;
}

/**
 * Avisa quem acompanha o registro.
 * @returns {void}
 */
function notify() {
  listeners.forEach((fn) => fn());
  scheduleSave();
}

/**
 * Registra o início de uma chamada.
 * @param {Object} info
 * @param {string} info.kind - Origem: `chat`, `digest`, `verify`...
 * @param {string} info.provider - Provedor.
 * @param {string} info.model - Modelo.
 * @param {string} info.prompt - Texto enviado.
 * @param {number} [info.systemChars] - Tamanho do prompt de sistema.
 * @param {number} [info.historyMessages] - Mensagens de histórico enviadas.
 * @returns {Object} A chamada (use com {@link finishExchange}).
 */
export function startExchange({ kind, provider, model, prompt, system = "", history = [], toolsOffered = 0 }) {
  const exchange = {
    id: ++seq,
    uid: `${Date.now().toString(36)}-${seq}`,
    system: clip(system, MAX_TEXT),
    history: history
      .filter((m) => m?.content)
      .slice(-50)
      .map((m) => ({ role: m.role, content: clip(m.content, 20000) })),
    toolsOffered,
    kind,
    provider,
    model,
    startedAt: new Date().toISOString(),
    prompt: clip(prompt, MAX_TEXT),
    promptChars: String(prompt || "").length,
    systemChars: String(system || "").length,
    historyMessages: history.length,
    tools: [],
    response: "",
    usage: null,
    error: null,
    fallbackFrom: null,
    status: "running",
  };
  exchanges.unshift(exchange);
  // Cada grupo (chat / segundo plano) mantém só os 10 mais recentes
  const group = kind === "chat" ? (e) => e.kind === "chat" : (e) => e.kind !== "chat";
  const members = exchanges.filter(group);
  for (const old of members.slice(MAX_RECENT)) exchanges.splice(exchanges.indexOf(old), 1);
  current = exchange;
  notify();
  return exchange;
}

/**
 * Registra uma tool executada durante a chamada atual.
 * @param {string} name - Nome da tool.
 * @param {Object} args - Argumentos.
 * @param {string} output - Resultado.
 * @param {boolean} isError - Se falhou.
 * @returns {void}
 */
export function recordTool(name, args, output, isError) {
  if (!current) return;
  current.tools.push({
    name,
    args: clip(args, 800),
    output: clip(output, MAX_TOOL_OUTPUT),
    isError: Boolean(isError),
    at: new Date().toISOString(),
  });
  notify();
}

/**
 * Quantas tools já foram executadas na chamada atual.
 * @returns {number}
 */
export function currentToolCount() {
  return current?.tools.length || 0;
}

/**
 * Encerra uma chamada.
 * @param {Object} exchange - Chamada devolvida por {@link startExchange}.
 * @param {Object} result
 * @param {string} [result.text] - Resposta.
 * @param {Object} [result.usage] - Consumo de tokens.
 * @param {Error} [result.error] - Erro, se houve.
 * @returns {void}
 */
export function finishExchange(exchange, { text, usage, error } = {}) {
  exchange.response = clip(text || "", MAX_TEXT);
  exchange.usage = usage
    ? { input: usage.inputTokens ?? 0, output: usage.outputTokens ?? 0, requests: usage.requests ?? 1 }
    : null;
  exchange.error = error ? String(error.message || error) : null;
  exchange.status = error ? "error" : "ok";
  exchange.endedAt = new Date().toISOString();
  exchange.durationMs = Date.parse(exchange.endedAt) - Date.parse(exchange.startedAt);
  if (current === exchange) current = null;
  notify();
}

/**
 * Chamadas registradas (as mais recentes primeiro).
 * @returns {Object[]}
 */
export function listExchanges() {
  return exchanges;
}

/**
 * Apaga o registro.
 * @returns {void}
 */
export function clearExchanges() {
  exchanges.length = 0;
  notify();
}

/**
 * Acompanha mudanças no registro.
 * @param {() => void} fn - Chamada a cada mudança.
 * @returns {() => void} Função que cancela.
 */
export function subscribeExchanges(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Turnos fixados do livro atual (mais recentes primeiro).
 * @returns {Object[]}
 */
export function listPinned() {
  return pinned;
}

/**
 * Indica se um turno está fixado.
 * @param {string} uid - Identificador do turno.
 * @returns {boolean}
 */
export function isPinned(uid) {
  return pinned.some((p) => p.uid === uid);
}

/**
 * Carrega do disco os turnos fixados do livro.
 * @param {string} bookPath - Pasta do livro.
 * @returns {Promise<Object[]>}
 */
export async function loadPinned(bookPath) {
  pinned = bookPath ? await readSystemJson(bookPath, PINNED_FILE, []) : [];
  if (!Array.isArray(pinned)) pinned = [];
  notify();
  return pinned;
}

/**
 * Grava os turnos fixados no livro.
 * @param {string} bookPath - Pasta do livro.
 * @returns {Promise<void>}
 */
async function savePinned(bookPath) {
  if (bookPath) await writeSystemJson(bookPath, PINNED_FILE, pinned);
  notify();
}

/**
 * Fixa (salva) um turno, para que não se perca quando passarem os 10 mais recentes.
 * @param {string} uid - Identificador do turno.
 * @param {string} bookPath - Pasta do livro.
 * @returns {Promise<boolean>} Se o turno foi fixado.
 */
export async function pinExchange(uid, bookPath) {
  const found = exchanges.find((e) => e.uid === uid);
  if (!found || isPinned(uid) || !bookPath) return false;
  pinned.unshift({ ...JSON.parse(JSON.stringify(found)), pinnedAt: new Date().toISOString() });
  await savePinned(bookPath);
  return true;
}

/**
 * Desafixa um turno (o registro salvo é apagado).
 * @param {string} uid - Identificador do turno.
 * @param {string} bookPath - Pasta do livro.
 * @returns {Promise<void>}
 */
export async function unpinExchange(uid, bookPath) {
  pinned = pinned.filter((p) => p.uid !== uid);
  await savePinned(bookPath);
}

// Ao fechar o app, grava na hora o que ainda estava esperando o agrupamento
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (recentBook && saveTimer) {
      clearTimeout(saveTimer);
      writeSystemJson(recentBook, RECENT_FILE, exchanges).catch(() => {});
    }
  });
}
