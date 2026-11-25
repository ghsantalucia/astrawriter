/**
 * @file Lista do changelog do livro (corrida, com rolagem infinita, do mais recente ao mais antigo), usada pela Central do Livro.
 */

import Handlebars from "handlebars";
import { toViewEntry } from "../../utils/changelogFormat.js";
import rowsTpl from "../../components/Modal/templates/changelogRows.hbs?raw";

/** Distância (px) do fim da lista a partir da qual o próximo arquivo de log é carregado. */
const LOAD_THRESHOLD = 120;

/**
 * Liga a lista do changelog ao seu contêiner: carrega o arquivo de log mais recente e, conforme o usuário rola,
 * os mais antigos.
 * @param {HTMLElement} root - Elemento do modal.
 * @param {import('../../services/changelogService.js').ChangelogService} changelog - Serviço do changelog.
 * @returns {void}
 */
export function mountChangelogList(root, changelog) {
  const scroll = root.querySelector("#changelog-scroll");
  const list = root.querySelector("#changelog-list");
  const status = root.querySelector("#changelog-status");
  const render = Handlebars.compile(rowsTpl);

  let nextFile = null;
  let started = false;
  let done = false;
  let loading = false;

  const loadMore = async () => {
    if (loading || done) return;
    loading = true;
    status.textContent = "Carregando…";

    const page = await changelog.getPage(started ? nextFile : null);
    started = true;

    if (page.file === null) {
      done = true;
      status.textContent = "Nenhum registro ainda.";
    } else {
      list.insertAdjacentHTML(
        "beforeend",
        render({ entries: page.entries.map(toViewEntry) }),
      );
      nextFile = page.older;
      if (!nextFile) {
        done = true;
        status.textContent = "Fim do histórico.";
      } else {
        status.textContent = "";
      }
    }
    loading = false;

    // Se o conteúdo carregado ainda não preenche a área visível, continua carregando
    if (!done && scroll.scrollHeight <= scroll.clientHeight + LOAD_THRESHOLD) {
      loadMore();
    }
  };

  scroll.addEventListener("scroll", () => {
    const remaining =
      scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight;
    if (remaining < LOAD_THRESHOLD) loadMore();
  });

  loadMore();
}
