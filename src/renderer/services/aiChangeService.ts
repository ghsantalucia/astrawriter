/**
 * @file Arquivos "alterados pela IA" (modo autônomo): como a IA grava direto, sem a janela de revisão, cada arquivo que
 * ela alterou ganha uma bolinha no explorer (e nas guias do capítulo) até o autor abri-lo. A bolinha some 3 segundos
 * depois que o arquivo é aberto no editor (mesmo que ele seja fechado antes disso). A lista fica salva no livro
 * (`.system/ai-changed.json`) e sobrevive a reiniciar o app.
 */

import { uiBus } from "../events/uiBus.js";
import { normalizePath } from "../utils/helpers.js";
import { readSystemJson, writeSystemJson } from "../review/reviewStore.js";

const FILE = ".system/ai-changed.json";

/** Tempo, depois de abrir o arquivo, até a bolinha sumir. */
export const SEEN_DELAY_MS = 3000;

/**
 * Serviço dos arquivos alterados pela IA.
 * @class
 */
export class AiChangeService {
  declare loaded: any;

  declare bookPath: any;
  declare paths: any;
  declare state: any;
  declare timers: any;

  /**
   * @param {Object} state - Estado global.
   */
  constructor(state) {
    this.state = state;
    /** Caminhos relativos ao livro (sem `.temp`). @type {Set<string>} */
    this.paths = new Set();
    this.bookPath = null;
    this.timers = new Map();
    this.loaded = Promise.resolve();
    uiBus.on("book:changed", () => {
      this.loaded = this.load();
    });
    uiBus.on("book:cleared", () => this.clear());
    uiBus.on("file:opened", ({ fullPath }) => this.seen(fullPath));
  }

  /**
   * Caminho relativo ao livro atual.
   * @param {string} abs - Caminho absoluto.
   * @returns {string|null}
   * @private
   */
  relOf(abs) {
    const book = normalizePath(this.state.currentBookPath || "").replace(/\/+$/, "");
    const path = normalizePath(abs || "").replace(/\.temp$/, "");
    return book && path.startsWith(`${book}/`) ? path.slice(book.length + 1) : null;
  }

  /**
   * Carrega do disco a lista do livro atual.
   * @returns {Promise<void>}
   */
  async load() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.bookPath = this.state.currentBookPath ? normalizePath(this.state.currentBookPath).replace(/\/+$/, "") : null;
    const saved = this.bookPath ? await readSystemJson(this.bookPath, FILE, []) : [];
    this.paths = new Set(Array.isArray(saved) ? saved : []);
    this.publish();
  }

  /** Esquece tudo (nenhum livro selecionado). @returns {void} */
  clear() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.bookPath = null;
    this.paths = new Set();
    this.publish();
  }

  /**
   * Grava a lista no livro.
   * @returns {Promise<void>}
   * @private
   */
  async persist() {
    if (this.bookPath) await writeSystemJson(this.bookPath, FILE, [...this.paths]);
  }

  /**
   * Avisa a interface que a lista mudou.
   * @returns {void}
   * @private
   */
  publish() {
    uiBus.emit("ai-changed:updated", { paths: [...this.paths] });
  }

  /**
   * Marca arquivos como alterados pela IA.
   * @param {string[]} absPaths - Caminhos absolutos.
   * @returns {Promise<void>}
   */
  async mark(absPaths) {
    await this.loaded;
    let changed = false;
    for (const abs of absPaths) {
      const rel = this.relOf(abs);
      if (!rel || this.paths.has(rel)) continue;
      this.paths.add(rel);
      changed = true;
    }
    if (!changed) return;
    this.publish();
    await this.persist();
    // O arquivo que já está aberto no editor entra na contagem dos 3 segundos
    if (this.state.currentFilePath) this.seen(this.state.currentFilePath);
  }

  /**
   * O arquivo foi aberto no editor: a bolinha some depois de 3 segundos.
   * @param {string} abs - Caminho absoluto do arquivo aberto.
   * @returns {void}
   */
  seen(abs) {
    const rel = this.relOf(abs);
    if (!rel || !this.paths.has(rel) || this.timers.has(rel)) return;
    this.timers.set(
      rel,
      setTimeout(async () => {
        this.timers.delete(rel);
        if (!this.paths.delete(rel)) return;
        this.publish();
        await this.persist();
      }, SEEN_DELAY_MS),
    );
  }

  /**
   * Caminhos (relativos ao livro) marcados.
   * @returns {string[]}
   */
  list() {
    return [...this.paths];
  }
}
