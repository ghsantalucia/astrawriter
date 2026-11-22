/**
 * @file Serviço de exclusão de arquivos (anotações e fichas do mundo) e de capítulos inteiros.
 *
 * Excluir um capítulo apaga a pasta com todos os arquivos e subpastas e renumera os capítulos seguintes para não
 * sobrar buracos. Tudo o que o usuário apaga é registrado no changelog com o conteúdo (para auditoria); os ajustes
 * colaterais feitos para manter a coerência (mover pastas, atualizar o índice, renomear títulos padrão) são registrados
 * com o autor "Sistema".
 */

import { domainBus } from "../events/domainBus.js";
import { removeFromIndexes } from "./indexService.js";
import { uiBus } from "../events/uiBus.js";
import { normalizePath } from "../utils/helpers.js";
import {
  parseMarkdown,
  parseYaml,
  stringifyFrontmatter,
  stringifyYaml,
} from "../utils/markdown.js";
import { replaceFirstHeading } from "../utils/template.js";
import { canDeleteFile, chapterNumber } from "../utils/deletePermission.js";

/**
 * Formata um número com zeros à esquerda.
 * @param {number} n - Número.
 * @param {number} [width=3] - Largura mínima.
 * @returns {string}
 */
const pad = (n, width = 3) => String(n).padStart(width, "0");

/**
 * Serviço de exclusão de arquivos e capítulos.
 * @class
 */
export class DeletionService {
  declare changelog: any;
  declare state: any;

  /**
   * @param {Object} state - Estado global da aplicação.
   * @param {import('./changelogService.js').ChangelogService} changelog - Serviço do changelog.
   */
  constructor(state, changelog) {
    this.state = state;
    this.changelog = changelog;
  }

  // ========== Utilitários ========== //

  /**
   * Caminho do livro atual (normalizado, sem barra final).
   * @returns {string}
   * @throws {Error} Se nenhum livro está selecionado.
   * @private
   */
  requireBook() {
    if (!this.state.currentBookPath)
      throw new Error("Nenhum livro selecionado.");
    return normalizePath(this.state.currentBookPath).replace(/\/+$/, "");
  }

  /**
   * Lista recursivamente os arquivos de uma pasta (incluindo rascunhos `.temp`).
   * @param {string} dir - Pasta.
   * @returns {Promise<string[]>} Caminhos absolutos.
   * @private
   */
  async listFilesRecursive(dir) {
    const files = [];
    for (const entry of (await window.electronAPI.listDir(dir)) || []) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory)
        files.push(...(await this.listFilesRecursive(full)));
      else files.push(full);
    }
    return files;
  }

  /**
   * Capítulos do livro, em ordem crescente.
   * @returns {Promise<Array<{name: string, number: number}>>}
   */
  async listChapters() {
    const book = this.requireBook();
    return ((await window.electronAPI.listDir(`${book}/content`)) || [])
      .filter((e) => e.isDirectory && chapterNumber(e.name) !== null)
      .map((e) => ({ name: e.name, number: chapterNumber(e.name) }))
      .sort((a, b) => a.number - b.number);
  }

  /**
   * Resumo do que seria apagado ao excluir um capítulo (para a confirmação).
   * @param {string} folderName - Pasta do capítulo (ex.: `chapter_002`).
   * @returns {Promise<{files: number, drafts: number, renumbered: Array<{from: number, to: number}>}>}
   */
  async describeChapterDeletion(folderName) {
    const book = this.requireBook();
    const files = await this.listFilesRecursive(
      `${book}/content/${folderName}`,
    );
    const number = chapterNumber(folderName);
    return {
      files: files.filter((f) => !f.endsWith(".temp")).length,
      drafts: files.filter((f) => f.endsWith(".temp")).length,
      renumbered: (await this.listChapters())
        .filter((c) => c.number > number)
        .map((c) => ({ from: c.number, to: c.number - 1 })),
    };
  }

  /**
   * Notifica os dois barramentos.
   * @param {string} event - Nome do evento.
   * @param {Object} payload - Dados do evento.
   * @returns {void}
   * @private
   */
  notify(event, payload) {
    domainBus.emit(event, payload);
    uiBus.emit(event, payload);
  }

  // ========== Arquivos ========== //

  /**
   * Exclui um arquivo (e o rascunho `.temp`, se houver) depois de validar a permissão.
   * @param {string} filePath - Caminho absoluto do arquivo.
   * @param {Object} [options]
   * @param {"user"|"ai"} [options.who="user"] - Quem exclui (define a regra de permissão e o autor no changelog).
   * @returns {Promise<{success: boolean, title: string}>}
   * @throws {Error} Se o arquivo não pode ser excluído.
   */
  async deleteFile(filePath, { who = "user" } = {}) {
    const book = this.requireBook();
    const path = normalizePath(filePath);
    const rel = path.slice(book.length + 1);

    const official = await window.electronAPI.readFile(path);
    // Arquivo novo ainda não sincronizado: só existe o rascunho (nada vai para o changelog, pois nunca foi oficial)
    const draft =
      official === null ? await window.electronAPI.readFile(`${path}.temp`) : null;
    const before = official ?? draft;
    if (before === null) throw new Error("O arquivo não existe mais.");

    const { metadata } = parseMarkdown(before);
    if (!canDeleteFile(metadata, rel, who)) {
      throw new Error("Este arquivo não pode ser excluído.");
    }

    if (official !== null) {
      const result = await window.electronAPI.deleteFile(path);
      if (!result?.success)
        throw new Error(result?.error || "Falha ao excluir.");
    }
    await window.electronAPI.deleteFile(`${path}.temp`).catch(() => null);

    if (official !== null) {
      await this.changelog.record({
        action: "delete",
        filePath: path,
        before: official,
        actor:
          who === "ai" ? this.changelog.aiActor() : this.changelog.userActor(),
      });
    }
    this.changelog.clearDraft(path);
    this.changelog.endSession(path);
    await removeFromIndexes({
      book,
      relPaths: [rel],
      changelog: this.changelog,
      reason: "Arquivo excluído: link removido do índice",
    });

    const title = metadata.title || path.split("/").pop();
    this.notify("file:deleted", { path, relativePath: rel, title });
    return { success: true, title };
  }

  // ========== Capítulos ========== //

  /**
   * Exclui um capítulo inteiro (pasta, arquivos e subpastas) e renumera os seguintes para não deixar buracos.
   * @param {string} folderName - Pasta do capítulo (ex.: `chapter_002`).
   * @returns {Promise<{deleted: number, renumbered: Array<{from: string, to: string}>}>}
   * @throws {Error} Se a pasta não é um capítulo ou a exclusão falha.
   */
  async deleteChapter(folderName) {
    const book = this.requireBook();
    const number = chapterNumber(folderName);
    if (number === null)
      throw new Error("A pasta informada não é um capítulo.");

    const content = `${book}/content`;
    const folderPath = `${content}/${folderName}`;
    const chapters = await this.listChapters();
    if (!chapters.some((c) => c.name === folderName)) {
      throw new Error("O capítulo não existe mais.");
    }

    // Guarda o conteúdo de tudo o que será apagado (vai para o changelog depois da exclusão)
    const files = await this.listFilesRecursive(folderPath);
    const snapshots = [];
    for (const file of files) {
      if (file.endsWith(".temp")) continue;
      snapshots.push({ file, before: await window.electronAPI.readFile(file) });
    }

    const removed = await window.electronAPI.deleteFolder(folderPath);
    if (!removed?.success)
      throw new Error(removed?.error || "Falha ao excluir a pasta.");

    const user = this.changelog.userActor();
    for (const { file, before } of snapshots) {
      this.changelog.clearDraft(file);
      this.changelog.endSession(file);
      if (before === null) continue;
      await this.changelog.record({
        action: "delete",
        filePath: file,
        before,
        actor: user,
        meta: { reason: `Capítulo excluído (${folderName})` },
      });
    }

    // Renumera os seguintes, em ordem crescente (cada nome novo já está livre)
    const renumbered = [];
    for (const chapter of chapters.filter((c) => c.number > number)) {
      const width = chapter.name.length - "chapter_".length;
      const newName = `chapter_${pad(chapter.number - 1, width)}`;
      await this.renumberChapter(content, chapter, newName);
      renumbered.push({ from: chapter.name, to: newName });
    }

    await this.updateChapterIndex(content, folderName, number);

    this.notify("chapter:deleted", { bookPath: book, folderName, renumbered });
    return { deleted: snapshots.length, renumbered };
  }

  /**
   * Renomeia a pasta de um capítulo e ajusta o que depende do número (títulos padrão), tudo como "Sistema".
   * @param {string} content - Pasta `content` do livro.
   * @param {{name: string, number: number}} chapter - Capítulo a mover.
   * @param {string} newName - Novo nome da pasta.
   * @returns {Promise<void>}
   * @private
   */
  async renumberChapter(content, chapter, newName) {
    const oldPath = `${content}/${chapter.name}`;
    const newPath = `${content}/${newName}`;
    const oldFiles = await this.listFilesRecursive(oldPath);

    const result = await window.electronAPI.renamePath(oldPath, newPath);
    if (!result?.success) {
      throw new Error(`Falha ao renumerar ${chapter.name}: ${result?.error}`);
    }

    // Cada arquivo que mudou de caminho entra no changelog (o histórico dele continua valendo)
    for (const oldFile of oldFiles) {
      if (oldFile.endsWith(".temp")) continue;
      const moved = oldFile.replace(oldPath, newPath);
      this.changelog.clearDraft(oldFile);
      this.changelog.endSession(oldFile);
      await this.changelog.recordMove(moved, oldFile);
    }

    // Título padrão ("Capítulo 03") acompanha o número novo; títulos escolhidos pelo autor não são tocados
    const oldLabel = `Capítulo ${pad(chapter.number, 2)}`;
    const newLabel = `Capítulo ${pad(chapter.number - 1, 2)}`;
    await this.renameDefaultLabel(`${newPath}/folder.yml`, oldLabel, newLabel);
    for (const file of await window.electronAPI.listDir(newPath)) {
      if (file.isDirectory || !/draft\.md$/i.test(file.name)) continue;
      await this.renameDraftTitle(
        `${newPath}/${file.name}`,
        oldLabel,
        newLabel,
      );
    }
  }

  /**
   * Troca o título/descrição padrão do `folder.yml` de um capítulo.
   * @param {string} ymlPath - Caminho do folder.yml.
   * @param {string} oldLabel - Título padrão antigo.
   * @param {string} newLabel - Título padrão novo.
   * @returns {Promise<void>}
   * @private
   */
  async renameDefaultLabel(ymlPath, oldLabel, newLabel) {
    const before = await window.electronAPI.readFile(ymlPath);
    if (before === null) return;
    const meta = parseYaml(before) || {};
    let changed = false;
    for (const key of ["title", "description"]) {
      if (meta[key] === oldLabel) {
        meta[key] = newLabel;
        changed = true;
      }
    }
    if (!changed) return;
    const after = stringifyYaml(meta);
    await window.electronAPI.saveFile(ymlPath, after);
    await this.logSystemUpdate(ymlPath, before, after, "Capítulos renumerados");
  }

  /**
   * Troca o título padrão do manuscrito (frontmatter `chapter_title` e título H1) de um capítulo renumerado.
   * Manuscritos com rascunho pendente não são tocados.
   * @param {string} draftPath - Caminho do manuscrito.
   * @param {string} oldLabel - Título padrão antigo.
   * @param {string} newLabel - Título padrão novo.
   * @returns {Promise<void>}
   * @private
   */
  async renameDraftTitle(draftPath, oldLabel, newLabel) {
    if ((await window.electronAPI.readFile(`${draftPath}.temp`)) !== null)
      return;
    const before = await window.electronAPI.readFile(draftPath);
    if (before === null) return;

    const { metadata, body } = parseMarkdown(before);
    if (metadata.chapter_title !== oldLabel) return;

    metadata.chapter_title = newLabel;
    const heading = body.match(/^#\s+(.*)$/m);
    const nextBody =
      heading && heading[1].trim() === oldLabel
        ? replaceFirstHeading(body, newLabel)
        : body;
    const after = stringifyFrontmatter(metadata, nextBody);
    await window.electronAPI.saveFile(draftPath, after);
    await this.logSystemUpdate(
      draftPath,
      before,
      after,
      "Capítulos renumerados",
    );
  }

  /**
   * Atualiza `content/index.md`: remove o capítulo excluído e acerta os links/títulos dos renumerados.
   * @param {string} content - Pasta `content` do livro.
   * @param {string} deletedName - Pasta do capítulo excluído.
   * @param {number} deletedNumber - Número do capítulo excluído.
   * @returns {Promise<void>}
   * @private
   */
  async updateChapterIndex(content, deletedName, deletedNumber) {
    const indexPath = `${content}/index.md`;
    const before = await window.electronAPI.readFile(indexPath);
    if (before === null) return;

    const lines = before
      .split("\n")
      .filter((line) => !line.includes(`](content/${deletedName}/`));
    const after = lines
      .map((line) =>
        line.replace(
          /\[([^\]]*)\]\(content\/chapter_(\d+)\//,
          (match, text, digits) => {
            const n = Number(digits);
            if (n <= deletedNumber) return match;
            const oldLabel = `Capítulo ${pad(n, 2)}`;
            const label =
              text === oldLabel ? `Capítulo ${pad(n - 1, 2)}` : text;
            return `[${label}](content/chapter_${pad(n - 1, digits.length)}/`;
          },
        ),
      )
      .join("\n");

    if (after === before) return;
    await window.electronAPI.saveFile(indexPath, after);
    await this.logSystemUpdate(
      indexPath,
      before,
      after,
      `Capítulo excluído (${deletedName}) e capítulos seguintes renumerados`,
    );
  }

  /**
   * Registra no changelog uma alteração colateral feita pelo sistema.
   * @param {string} filePath - Arquivo alterado.
   * @param {string} before - Conteúdo antes.
   * @param {string} after - Conteúdo depois.
   * @param {string} reason - Motivo da alteração.
   * @returns {Promise<void>}
   * @private
   */
  async logSystemUpdate(filePath, before, after, reason) {
    await this.changelog.record({
      action: "update",
      filePath,
      before,
      after,
      actor: this.changelog.systemActor(),
      meta: { reason },
    });
  }
}
