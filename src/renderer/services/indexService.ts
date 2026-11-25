/**
 * @file Mantém os `index.md` do livro em dia: acrescenta o link de uma ficha criada e remove os links de arquivos
 * excluídos. Os índices são lidos e gravados direto no disco (não passam pelas permissões de edição, que existem para
 * o autor e a IA); as alterações entram no changelog.
 */

import { normalizePath } from "../utils/helpers.js";
import { t } from "../../shared/i18n.js";
import {
  addIndexLink,
  entityIndexPath,
  indexPathsFor,
  removeIndexLinks,
} from "../utils/bookIndex.js";

/**
 * Acrescenta ao índice da categoria o link de uma ficha recém-criada (personagem, local ou conceito/sistema).
 * @param {Object} params
 * @param {string} params.book - Caminho absoluto do livro.
 * @param {string} params.relPath - Caminho da ficha relativo ao livro.
 * @param {string} params.title - Título da ficha.
 * @param {import('./changelogService.js').ChangelogService} [params.changelog] - Serviço do changelog.
 * @param {Object} [params.actor] - Autor da alteração (padrão: o mesmo da criação).
 * @returns {Promise<boolean>} Se o índice foi alterado.
 */
export async function addEntityToIndex({
  book,
  relPath,
  title,
  changelog,
  actor,
}) {
  const indexRel = entityIndexPath(relPath);
  if (!indexRel) return false;

  const indexPath = `${normalizePath(book)}/${indexRel}`;
  const before = await window.electronAPI.readFile(indexPath);
  if (before === null) return false;

  const after = addIndexLink(before, title, relPath);
  if (after === before) return false;

  await window.electronAPI.saveFile(indexPath, after);
  await changelog?.record({
    action: "update",
    filePath: indexPath,
    before,
    after,
    actor,
    meta: { reason: t("Ficha criada ({title})", { title }) },
    bookPath: book,
  });
  return true;
}

/**
 * Remove dos índices os links dos arquivos excluídos (capítulos e fichas do Mundo).
 * @param {Object} params
 * @param {string} params.book - Caminho absoluto do livro.
 * @param {string[]} params.relPaths - Caminhos dos arquivos excluídos, relativos ao livro.
 * @param {import('./changelogService.js').ChangelogService} [params.changelog] - Serviço do changelog.
 * @param {string} [params.reason] - Motivo registrado no changelog.
 * @returns {Promise<number>} Quantidade de índices alterados.
 */
export async function removeFromIndexes({
  book,
  relPaths,
  changelog,
  reason = t("Arquivo excluído"),
}) {
  const byIndex = new Map();
  for (const rel of relPaths) {
    for (const index of indexPathsFor(rel)) {
      if (!byIndex.has(index)) byIndex.set(index, []);
      byIndex.get(index).push(rel);
    }
  }

  let changed = 0;
  for (const [indexRel, removed] of byIndex) {
    const indexPath = `${normalizePath(book)}/${indexRel}`;
    const before = await window.electronAPI.readFile(indexPath);
    if (before === null) continue;

    const after = removeIndexLinks(before, removed);
    if (after === before) continue;

    await window.electronAPI.saveFile(indexPath, after);
    await changelog?.record({
      action: "update",
      filePath: indexPath,
      before,
      after,
      actor: changelog.systemActor(),
      meta: { reason },
      bookPath: book,
    });
    changed += 1;
  }
  return changed;
}
