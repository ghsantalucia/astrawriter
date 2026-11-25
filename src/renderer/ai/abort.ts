/**
 * @file Interrupção da IA: o sinal de cancelamento da resposta em andamento, compartilhado pelos provedores (que o passam ao
 * `fetch` das chamadas do chat) e pelo laço de tools. O autor interrompe pelo botão de parar do chat.
 */

import { t } from "../../shared/i18n.js";

/** Sinal da resposta em andamento (só uma por vez). */
let active = null;

/**
 * Define (ou limpa) o sinal da resposta em andamento.
 * @param {AbortSignal|null} signal - Sinal.
 * @returns {void}
 */
export function setActiveSignal(signal) {
  active = signal;
}

/** @returns {AbortSignal|undefined} Sinal da resposta em andamento. */
export function activeSignal() {
  return active || undefined;
}

/**
 * Erro de interrupção pelo autor.
 * @returns {Error}
 */
export function abortError() {
  const error = new Error(t("Interrompido pelo autor."));
  error.name = "AbortError";
  return error;
}

/**
 * Espera uma promessa, mas rejeita na hora se o sinal for acionado (mesmo que o provedor não consiga cancelar a conexão).
 * @param {Promise<any>} promise - Promessa.
 * @param {AbortSignal} [signal] - Sinal.
 * @returns {Promise<any>}
 */
export function raceAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
