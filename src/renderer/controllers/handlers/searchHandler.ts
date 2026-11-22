/**
 * @file Handler da pesquisa de arquivos do explorer: aplica debounce, consulta o serviço e publica os resultados.
 */

import { uiBus } from "../../events/uiBus.js";

/** Tempo (ms) de espera após a última digitação antes de pesquisar. */
const SEARCH_DEBOUNCE_MS = 250;

/** Temporizador da pesquisa pendente. */
let pendingTimer = null;

/** Número da pesquisa mais recente (descarta respostas atrasadas). */
let latestSearch = 0;

/**
 * Cancela qualquer pesquisa pendente ou em andamento.
 * @returns {void}
 */
function cancelPending() {
  clearTimeout(pendingTimer);
  pendingTimer = null;
  latestSearch++;
}

/**
 * Trata a alteração do texto da pesquisa. Com texto, pesquisa após o debounce e publica `search:results`;
 * vazio, cancela o modo de pesquisa publicando `search:cleared`.
 * @param {{value: string}} payload - Contexto do evento (`value` é o texto digitado).
 * @param {Object} state - Estado global da aplicação.
 * @param {import('../../services/searchService.js').SearchService} searchService - Serviço de pesquisa.
 * @returns {void}
 */
export function onSearchChanged({ value }, state, searchService) {
  cancelPending();

  const term = String(value ?? "").trim();
  if (!term) {
    uiBus.emit("search:cleared");
    return;
  }

  const current = latestSearch;
  pendingTimer = setTimeout(async () => {
    const results = await searchService.search(state.currentBookPath, term);
    if (current !== latestSearch) return;
    uiBus.emit("search:results", { term, results });
  }, SEARCH_DEBOUNCE_MS);
}

/**
 * Trata o pedido de limpar a pesquisa (botão X): encerra o modo de pesquisa.
 * @returns {void}
 */
export function onSearchClear() {
  cancelPending();
  uiBus.emit("search:cleared");
}
