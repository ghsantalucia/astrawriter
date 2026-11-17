/**
 * @file Serviço das pastas do usuário e da movimentação de arquivos entre pastas.
 *
 * - Pastas estruturais (content, assets, notes, categorias e capítulos) NÃO podem ser criadas, renomeadas nem
 *   excluídas manualmente: o `folder.yml` delas tem `userDelete: false` / `userRename: false`.
 * - Pastas do usuário (em Anotações e dentro das categorias do Mundo) nascem com `userDelete: true` e
 *   `userRename: true`; renomear altera apenas o título exibido (`title` do folder.yml).
 * - Arquivos só podem ser movidos entre pastas da MESMA categoria oficial (anotações; personagens; ambientes;
 *   sistemas). Os links internos para o arquivo movido são corrigidos em todo o livro.
 */

import { domainBus } from "../events/domainBus.js";
import { removeFromIndexes } from "./indexService.js";
import { uiBus } from "../events/uiBus.js";
import { normalizePath } from "../utils/helpers.js";
import { parseYaml, stringifyYaml } from "../utils/markdown.js";
import { flattenBookTree, toInternalHref } from "../utils/bookFiles.js";

/** Categorias oficiais onde o usuário pode criar pastas (caminhos relativos ao livro). */
const CATEGORY_ROOTS = [
  "notes",
  "assets/characters",
  "assets/places",
  "assets/elements",
];

/**
 * Categoria oficial de um caminho relativo ao livro (`notes` ou `assets/<categoria>`), ou null.
 * @param {string} bookRel - Caminho relativo ao livro.
 * @returns {string|null}
 */
export function categoryOf(bookRel) {
  const rel = normalizePath(bookRel).replace(/^\/+/, "");
  return (
    CATEGORY_ROOTS.find((root) => rel === root || rel.startsWith(`${root}/`)) ||
    null
  );
}

/**
 * Serviço de pastas do usuário e movimentação de arquivos.
 * @class
 */
export class FolderService {
  /**
   * @param {Object} state - Estado global da aplicação.
   * @param {import('./changelogService.js').ChangelogService} changelog - Serviço do changelog.
   */
  constructor(state, changelog) {
    this.state = state;
    this.changelog = changelog;
  }

  /**
   * Caminho do livro atual (normalizado, sem barra final).
   * @returns {string}
   * @private
   */
  requireBook() {
    if (!this.state.currentBookPath)
      throw new Error("Nenhum livro selecionado.");
    return normalizePath(this.state.currentBookPath).replace(/\/+$/, "");
  }

  /**
   * Indica se o usuário pode criar pastas dentro de um caminho (categoria oficial ou pasta do usuário).
   * @param {string} parentRel - Pasta pai, relativa ao livro.
   * @returns {boolean}
   */
  canCreateIn(parentRel) {
    return categoryOf(parentRel) !== null;
  }

  /**
   * Cria uma pasta do usuário (com `folder.yml`). Em categorias do Mundo, copia o `template.md` da categoria para
   * que o botão de nova ficha funcione dentro da pasta.
   * @param {string} parentRel - Pasta pai, relativa ao livro (ex.: `notes`).
   * @param {string} name - Nome exibido da pasta.
   * @param {Object} [actor] - Autor no changelog (padrão: o usuário).
   * @returns {Promise<{rel: string, title: string}>}
   * @throws {Error} Se o local não aceita pastas ou o nome é inválido.
   */
  async createFolder(parentRel, name, actor = this.changelog.userActor()) {
    const book = this.requireBook();
    const title = String(name || "").trim();
    if (!title) throw new Error("Informe um nome para a pasta.");
    if (!this.canCreateIn(parentRel)) {
      throw new Error("Não é permitido criar pastas neste local.");
    }

    const siblings =
      (await window.electronAPI.listDir(`${book}/${parentRel}`)) || [];
    const taken = new Set(siblings.map((e) => e.name.toLowerCase()));
    // Nome em disco genérico e numerado (folder_001, folder_002...); o nome digitado fica só no `title` do folder.yml
    let number = 1;
    for (const name of taken) {
      const m = /^folder_(\d+)$/.exec(name);
      if (m) number = Math.max(number, parseInt(m[1], 10) + 1);
    }
    const folder = `folder_${String(number).padStart(3, "0")}`;

    const rel = `${parentRel}/${folder}`;
    const yml = stringifyYaml({
      humanRead: true,
      humanWrite: true,
      aiRead: true,
      aiWrite: true,
      advanced: false,
      userDelete: true,
      userRename: true,
      title,
    });
    const ymlPath = `${book}/${rel}/folder.yml`;
    const saved = await window.electronAPI.saveFile(ymlPath, yml);
    if (!saved?.success)
      throw new Error(saved?.error || "Falha ao criar a pasta.");
    await this.changelog.record({
      action: "create",
      filePath: ymlPath,
      after: yml,
      actor,
    });

    // Fichas do Mundo: a subpasta herda o modelo da categoria
    const category = categoryOf(rel);
    if (category?.startsWith("assets/")) {
      const template = await window.electronAPI.readFile(
        `${book}/${category}/template.md`,
      );
      if (template !== null) {
        await window.electronAPI.saveFile(
          `${book}/${rel}/template.md`,
          template,
        );
      }
    }

    this.notify("folder:created", { bookPath: book, rel, title });
    return { rel, title };
  }

  /**
   * Lê o folder.yml de uma pasta.
   * @param {string} rel - Pasta relativa ao livro.
   * @returns {Promise<{path: string, text: string|null, meta: Object}>}
   * @private
   */
  async readFolderMeta(rel) {
    const path = `${this.requireBook()}/${rel}/folder.yml`;
    const text = await window.electronAPI.readFile(path);
    return { path, text, meta: text ? parseYaml(text) || {} : {} };
  }

  /**
   * Renomeia (título exibido) uma pasta do usuário.
   * @param {string} rel - Pasta relativa ao livro.
   * @param {string} name - Novo nome.
   * @returns {Promise<void>}
   * @throws {Error} Se a pasta não permite renomear.
   */
  async renameFolder(rel, name) {
    const title = String(name || "").trim();
    if (!title) throw new Error("Informe um nome para a pasta.");
    const { path, text, meta } = await this.readFolderMeta(rel);
    if (meta.userRename !== true)
      throw new Error("Esta pasta não pode ser renomeada.");

    meta.title = title;
    const next = stringifyYaml(meta);
    await window.electronAPI.saveFile(path, next);
    await this.changelog.record({
      action: "update",
      filePath: path,
      before: text,
      after: next,
      actor: this.changelog.userActor(),
    });
    this.notify("folder:renamed", { bookPath: this.requireBook(), rel, title });
  }

  /**
   * Resumo do que seria apagado ao excluir uma pasta do usuário.
   * @param {string} rel - Pasta relativa ao livro.
   * @returns {Promise<{files: number, drafts: number, title: string}>}
   */
  async describeFolder(rel) {
    const { meta } = await this.readFolderMeta(rel);
    const all = await this.listAll(`${this.requireBook()}/${rel}`);
    return {
      title: meta.title || rel.split("/").pop(),
      files: all.filter(
        (f) =>
          !f.endsWith(".temp") &&
          !f.endsWith("folder.yml") &&
          !f.endsWith("template.md"),
      ).length,
      drafts: all.filter((f) => f.endsWith(".temp")).length,
    };
  }

  /**
   * Lista recursivamente os arquivos de uma pasta.
   * @param {string} dir - Pasta absoluta.
   * @returns {Promise<string[]>}
   * @private
   */
  async listAll(dir) {
    const files = [];
    for (const entry of (await window.electronAPI.listDir(dir)) || []) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory) files.push(...(await this.listAll(full)));
      else files.push(full);
    }
    return files;
  }

  /**
   * Exclui uma pasta do usuário com tudo o que há dentro (registrando cada arquivo no changelog).
   * @param {string} rel - Pasta relativa ao livro.
   * @param {Object} [actor] - Autor no changelog (padrão: o usuário).
   * @returns {Promise<{deleted: number}>}
   * @throws {Error} Se a pasta não permite exclusão.
   */
  async deleteFolder(rel, actor = this.changelog.userActor()) {
    const book = this.requireBook();
    const { meta } = await this.readFolderMeta(rel);
    if (meta.userDelete !== true)
      throw new Error("Esta pasta não pode ser excluída.");

    const dir = `${book}/${rel}`;
    const snapshots = [];
    for (const file of await this.listAll(dir)) {
      if (file.endsWith(".temp")) continue;
      snapshots.push({ file, before: await window.electronAPI.readFile(file) });
    }

    const removed = await window.electronAPI.deleteFolder(dir);
    if (!removed?.success)
      throw new Error(removed?.error || "Falha ao excluir a pasta.");

    for (const { file, before } of snapshots) {
      this.changelog.clearDraft(file);
      this.changelog.endSession(file);
      if (before === null) continue;
      await this.changelog.record({
        action: "delete",
        filePath: file,
        before,
        actor,
        meta: { reason: `Pasta excluída (${rel})` },
      });
    }

    await removeFromIndexes({
      book,
      relPaths: snapshots.map(({ file }) => file.slice(book.length + 1)),
      changelog: this.changelog,
      reason: `Pasta excluída (${rel}): links removidos do índice`,
    });

    this.notify("folder:deleted", { bookPath: book, rel });
    return { deleted: snapshots.length };
  }

  // ========== Movimentação de arquivos ========== //

  /**
   * Verifica se um arquivo pode ser movido para uma pasta (mesma categoria oficial).
   * @param {string} fileRel - Arquivo, relativo ao livro.
   * @param {string} destRel - Pasta de destino, relativa ao livro.
   * @returns {{ok: boolean, reason?: string}}
   */
  checkMove(fileRel, destRel) {
    const from = categoryOf(fileRel);
    const to = categoryOf(destRel);
    if (!from || !to || from !== to) {
      return {
        ok: false,
        reason: "Não é permitido mover arquivos entre categorias diferentes.",
      };
    }
    const parent = normalizePath(fileRel).split("/").slice(0, -1).join("/");
    if (parent === normalizePath(destRel)) {
      return { ok: false, reason: "O arquivo já está nesta pasta." };
    }
    return { ok: true };
  }

  /**
   * Move um arquivo (e o rascunho) para outra pasta da mesma categoria, corrigindo os links internos que apontavam
   * para ele.
   * @param {string} fileAbs - Caminho absoluto do arquivo.
   * @param {string} destRel - Pasta de destino, relativa ao livro.
   * @param {Object} [actor] - Autor no changelog (padrão: o usuário).
   * @returns {Promise<{from: string, to: string}>} Caminhos absolutos antigo e novo.
   * @throws {Error} Se o movimento não é permitido ou o destino já tem um arquivo com o mesmo nome.
   */
  async moveFile(fileAbs, destRel, actor = this.changelog.userActor()) {
    const book = this.requireBook();
    const from = normalizePath(fileAbs).replace(/\.temp$/, "");
    const fromRel = from.slice(book.length + 1);

    const check = this.checkMove(fromRel, destRel);
    if (!check.ok) throw new Error(check.reason);

    const name = from.split("/").pop();
    const to = `${book}/${destRel}/${name}`;
    const moved = await window.electronAPI.renamePath(from, to);
    if (!moved?.success)
      throw new Error(moved?.error || "Falha ao mover o arquivo.");
    // O rascunho acompanha o arquivo (se não existir, ignora)
    await window.electronAPI
      .renamePath(`${from}.temp`, `${to}.temp`)
      .catch(() => null);

    this.changelog.clearDraft(from);
    this.changelog.endSession(from);
    await this.changelog.recordMove(to, from, actor);

    await this.fixLinks(`/${fromRel}`, `/${to.slice(book.length + 1)}`);

    this.notify("file:moved", { bookPath: book, from, to });
    return { from, to };
  }

  /**
   * Verifica se uma pasta do usuário pode ser movida para dentro de outra pasta (mesma categoria oficial, nunca para
   * dentro de si mesma).
   * @param {string} folderRel - Pasta movida, relativa ao livro.
   * @param {string} destRel - Pasta de destino, relativa ao livro.
   * @returns {{ok: boolean, reason?: string}}
   */
  checkFolderMove(folderRel, destRel) {
    const from = normalizePath(folderRel).replace(/\/+$/, "");
    const dest = normalizePath(destRel).replace(/\/+$/, "");
    const a = categoryOf(from);
    const b = categoryOf(dest);
    if (!a || !b || a !== b) {
      return {
        ok: false,
        reason: "Não é permitido mover pastas entre categorias diferentes.",
      };
    }
    if (dest === from || dest.startsWith(`${from}/`)) {
      return {
        ok: false,
        reason: "Uma pasta não pode ser movida para dentro dela mesma.",
      };
    }
    if (from.split("/").slice(0, -1).join("/") === dest) {
      return { ok: false, reason: "A pasta já está neste local." };
    }
    return { ok: true };
  }

  /**
   * Move uma pasta criada pelo usuário (com tudo o que há dentro) para outra pasta da mesma categoria, registrando a
   * movimentação de cada arquivo no changelog e corrigindo os links internos.
   * @param {string} folderRel - Pasta relativa ao livro.
   * @param {string} destRel - Pasta de destino, relativa ao livro.
   * @param {Object} [actor] - Autor no changelog (padrão: o usuário).
   * @returns {Promise<{moved: number}>}
   * @throws {Error} Se o movimento não é permitido ou o destino já tem uma pasta com o mesmo nome.
   */
  async moveFolder(folderRel, destRel, actor = this.changelog.userActor()) {
    const book = this.requireBook();
    const from = normalizePath(folderRel).replace(/\/+$/, "");
    const dest = normalizePath(destRel).replace(/\/+$/, "");
    const check = this.checkFolderMove(from, dest);
    if (!check.ok) throw new Error(check.reason);

    const { meta } = await this.readFolderMeta(from);
    if (meta.userRename !== true)
      throw new Error("Esta pasta não pode ser movida.");

    const oldDir = `${book}/${from}`;
    const newDir = `${book}/${dest}/${from.split("/").pop()}`;
    const files = (await this.listAll(oldDir)).filter(
      (f) => !f.endsWith(".temp") && !/\/(folder\.yml|template\.md)$/.test(f),
    );

    const moved = await window.electronAPI.renamePath(oldDir, newDir);
    if (!moved?.success)
      throw new Error(moved?.error || "Falha ao mover a pasta.");

    for (const oldFile of files) {
      const newFile = newDir + normalizePath(oldFile).slice(oldDir.length);
      this.changelog.clearDraft(oldFile);
      this.changelog.endSession(oldFile);
      await this.changelog.recordMove(newFile, oldFile, actor);
      await this.fixLinks(
        `/${normalizePath(oldFile).slice(book.length + 1)}`,
        `/${newFile.slice(book.length + 1)}`,
      );
    }

    this.notify("folder:moved", { bookPath: book, from, to: dest });
    return { moved: files.length };
  }

  /**
   * Corrige, em todos os arquivos do livro, os links internos para um arquivo que mudou de lugar. As alterações são
   * registradas como feitas pelo Sistema.
   * @param {string} oldHref - Caminho antigo (com barra inicial).
   * @param {string} newHref - Caminho novo (com barra inicial).
   * @returns {Promise<void>}
   * @private
   */
  async fixLinks(oldHref, newHref) {
    const book = this.requireBook();
    const tree = await window.electronAPI.getTree(book);
    const oldEnc = toInternalHref(oldHref.slice(1));
    const newEnc = toInternalHref(newHref.slice(1));
    const pattern = new RegExp(
      `\\]\\((?:${escapeRegExp(oldEnc)}|${escapeRegExp(oldHref)})((?:#[^)\\s]*)?)\\)`,
      "g",
    );

    for (const file of flattenBookTree(tree, book)) {
      for (const path of [file.absPath, `${file.absPath}.temp`]) {
        const before = await window.electronAPI.readFile(path);
        if (before === null || !pattern.test(before)) continue;
        pattern.lastIndex = 0;
        const after = before.replace(
          pattern,
          (m, hash) => `](${newEnc}${hash})`,
        );
        await window.electronAPI.saveFile(path, after);
        if (!path.endsWith(".temp")) {
          await this.changelog.record({
            action: "update",
            filePath: path,
            before,
            after,
            actor: this.changelog.systemActor(),
            meta: {
              reason: "Links internos atualizados após mover um arquivo",
            },
          });
        }
      }
    }
  }

  /**
   * Notifica os dois barramentos.
   * @param {string} event - Nome do evento.
   * @param {Object} payload - Dados.
   * @returns {void}
   * @private
   */
  notify(event, payload) {
    domainBus.emit(event, payload);
    uiBus.emit(event, payload);
  }
}

/**
 * Escapa um texto para uso literal em expressão regular.
 * @param {string} text - Texto.
 * @returns {string}
 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
