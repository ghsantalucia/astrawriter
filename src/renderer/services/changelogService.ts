// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Serviço do changelog: identifica QUEM realizou uma ação (usuário ou IA, com provedor e modelo) e registra
 * criações, alterações, exclusões, leituras e restaurações no changelog do livro (gravado pelo processo principal).
 *
 * É o ponto único pelo qual `FileService`, `CreationService` e as ferramentas da IA registram o que acontece, e
 * também o que a interface usa para listar o histórico de um arquivo e restaurar versões.
 */

import { normalizePath, uniqueId } from "../utils/helpers.js";
import { getProviderInfo } from "../ai/providers/index.js";

/** Nomes de arquivo que nunca entram no changelog (são estado de interface, não conteúdo do livro). */
const IGNORED_FILES = new Set(["config.json"]);

/**
 * @typedef {Object} Actor
 * @property {"user"|"ai"|"system"} type - Quem agiu.
 * @property {string} [provider] - Provedor de IA (apenas para `ai`).
 * @property {string} [model] - Modelo de IA (apenas para `ai`).
 */

/**
 * Serviço de registro e consulta do changelog.
 * @class
 */
export class ChangelogService {
  /**
   * Cria uma instância do ChangelogService.
   * @param {Object} state - Estado global da aplicação.
   */
  constructor(state) {
    this.state = state;
    /** Autores dos rascunhos (.temp) feitos pela IA, por caminho do arquivo oficial, até o rascunho ser resolvido. */
    this.draftAuthors = new Map();
    /** Sessões de salvamento automático em andamento: `caminho|tipo-de-autor` -> id da sessão. */
    this.autosaveSessions = new Map();
  }

  // ========== Identificação do autor ========== //

  /**
   * Autor "usuário".
   * @returns {Actor}
   */
  userActor() {
    return { type: "user" };
  }

  /**
   * Autor "Sistema": ajustes que o próprio app faz (renumerar capítulos, trocar de modelo por fallback...).
   * @returns {Actor}
   */
  systemActor() {
    return { type: "system" };
  }

  /**
   * Autor "IA", com o provedor e o modelo ativos no momento.
   * @returns {Actor}
   */
  aiActor() {
    const provider = this.state.aiProvider;
    const info = getProviderInfo(provider);
    const model =
      this.state.aiSettings?.providers?.[provider]?.model ||
      info?.defaultModel ||
      "";
    return { type: "ai", provider, model };
  }

  /**
   * Resolve o autor de uma gravação em arquivo oficial: se o conteúdo veio de um rascunho feito pela IA (e o usuário o
   * aprovou), o autor é a IA; caso contrário, é o usuário.
   * @param {string} filePath - Caminho do arquivo oficial.
   * @returns {Actor}
   */
  actorFor(filePath) {
    return this.draftAuthors.get(this.key(filePath)) || this.userActor();
  }

  /**
   * Marca que o rascunho de um arquivo foi escrito pela IA.
   * @param {string} filePath - Caminho do arquivo oficial.
   * @returns {void}
   */
  markAiDraft(filePath) {
    this.draftAuthors.set(this.key(filePath), this.aiActor());
  }

  /**
   * Esquece o autor do rascunho (ao sincronizar ou descartar).
   * @param {string} filePath - Caminho do arquivo oficial ou do .temp.
   * @returns {void}
   */
  clearDraft(filePath) {
    this.draftAuthors.delete(this.key(filePath));
  }

  /**
   * Chave normalizada (arquivo oficial, sem `.temp`) para o mapa de autores.
   * @param {string} filePath - Caminho do arquivo.
   * @returns {string}
   * @private
   */
  key(filePath) {
    return normalizePath(filePath).replace(/\.temp$/, "");
  }

  // ========== Registro ========== //

  /**
   * Indica se um caminho entra no changelog (conteúdo do livro; não rascunhos, `.system` nem config).
   * @param {string} filePath - Caminho do arquivo.
   * @returns {boolean}
   */
  isTracked(filePath) {
    if (!filePath || /\.temp$/.test(filePath)) return false;
    const name = normalizePath(filePath).split("/").pop();
    return !IGNORED_FILES.has(name);
  }

  /**
   * Caminho do livro ao qual um arquivo pertence (o livro atual, a menos que outro seja informado).
   * @param {string} filePath - Caminho do arquivo.
   * @param {string} [bookPath] - Livro explícito (ex.: um livro recém-criado).
   * @returns {string|null}
   * @private
   */
  resolveBook(filePath, bookPath) {
    const book = bookPath || this.state.currentBookPath;
    if (!book) return null;
    const normBook = normalizePath(book).replace(/\/+$/, "");
    return normalizePath(filePath).startsWith(`${normBook}/`) ? normBook : null;
  }

  /**
   * Registra uma ação no changelog. Nunca lança erro: falha de log não pode impedir a ação do usuário.
   * @param {Object} params
   * @param {"create"|"update"|"delete"|"read"|"restore"} params.action - Ação realizada.
   * @param {string} params.filePath - Caminho absoluto do arquivo.
   * @param {string|null} [params.before] - Conteúdo antes.
   * @param {string|null} [params.after] - Conteúdo depois.
   * @param {Actor} [params.actor] - Quem agiu (padrão: usuário).
   * @param {Object} [params.meta] - Informações extras.
   * @param {string} [params.bookPath] - Livro do arquivo, se não for o atual.
   * @returns {Promise<Object|null>} Registro gravado.
   */
  async record({
    action,
    filePath,
    before = null,
    after = null,
    actor,
    meta,
    bookPath,
  }) {
    try {
      if (!this.isTracked(filePath)) return null;
      const book = this.resolveBook(filePath, bookPath);
      if (!book) return null;

      const result = await window.electronAPI.changelogRecord(book, {
        action,
        filePath,
        before,
        after,
        actor: actor || this.userActor(),
        meta,
      });
      return result?.entry || null;
    } catch (error) {
      console.error("[CHANGELOG] Falha ao registrar:", error);
      return null;
    }
  }

  /**
   * Registra a leitura de um arquivo pela IA (útil para depurar o comportamento dela).
   * @param {string} filePath - Caminho absoluto do arquivo lido.
   * @param {string} [tool] - Ferramenta usada (ex.: `read_file`).
   * @returns {Promise<Object|null>}
   */
  recordAiRead(filePath, tool) {
    return this.record({
      action: "read",
      filePath,
      actor: this.aiActor(),
      meta: tool ? { tool } : undefined,
    });
  }

  /**
   * Registra uma leitura da IA sobre o livro inteiro (ex.: listar os arquivos).
   * @param {string} tool - Ferramenta usada.
   * @param {Object} [meta] - Informações extras.
   * @returns {Promise<Object|null>}
   */
  async recordBookRead(tool, meta = {}) {
    try {
      const book = this.state.currentBookPath
        ? normalizePath(this.state.currentBookPath).replace(/\/+$/, "")
        : null;
      if (!book) return null;
      const result = await window.electronAPI.changelogRecord(book, {
        action: "read",
        scope: "book",
        filePath: book,
        actor: this.aiActor(),
        meta: { tool, ...meta },
      });
      return result?.entry || null;
    } catch (error) {
      console.error("[CHANGELOG] Falha ao registrar:", error);
      return null;
    }
  }

  // ========== Consulta e restauração ========== //

  /**
   * Histórico de versões de um arquivo (mais recente primeiro).
   * `restoredFrom` é preenchido quando a versão atual acabou de ser restaurada de uma versão antiga (que então não
   * aparece mais na lista).
   * @param {string} filePath - Caminho absoluto do arquivo.
   * @returns {Promise<{entries: Object[], restoredFrom: Object|null}>}
   */
  async getFileHistory(filePath) {
    const book = this.resolveBook(filePath);
    if (!book) return { entries: [], restoredFrom: null };
    const relPath = normalizePath(filePath).slice(book.length + 1);
    return (
      (await window.electronAPI.changelogFileHistory(book, relPath)) || {
        entries: [],
        restoredFrom: null,
      }
    );
  }

  /**
   * Conteúdo de uma versão do histórico e o conteúdo atual do arquivo (para comparar antes de restaurar).
   * @param {string} filePath - Caminho absoluto do arquivo.
   * @param {number} entryId - Id do registro da versão.
   * @returns {Promise<{success: boolean, error?: string, content?: string|null, current?: string|null}>}
   */
  async preview(filePath, entryId) {
    const book = this.resolveBook(filePath);
    if (!book) return { success: false, error: "Arquivo fora do livro atual." };
    return window.electronAPI.changelogPreview(book, filePath, entryId);
  }

  /**
   * Uma página do changelog do livro atual (um arquivo de log), do mais recente ao mais antigo.
   * @param {string|null} [file] - Arquivo de log (null = o mais recente).
   * @returns {Promise<{file: string|null, entries: Object[], older: string|null}>}
   */
  async getPage(file = null) {
    if (!this.state.currentBookPath)
      return { file: null, entries: [], older: null };
    return window.electronAPI.changelogPage(
      normalizePath(this.state.currentBookPath),
      file,
    );
  }

  /**
   * Restaura um arquivo para uma versão do histórico (apagando tudo o que veio depois).
   * @param {string} filePath - Caminho absoluto do arquivo.
   * @param {number} entryId - Id do registro a restaurar.
   * @param {Actor} [actor] - Quem restaurou (padrão: o usuário).
   * @returns {Promise<{success: boolean, error?: string, removed?: number}>}
   */
  async restore(filePath, entryId, actor = this.userActor()) {
    const book = this.resolveBook(filePath);
    if (!book) return { success: false, error: "Arquivo fora do livro atual." };
    this.clearDraft(filePath);
    this.endSession(filePath);
    return window.electronAPI.changelogRestore(book, filePath, entryId, actor);
  }

  // ========== Salvamento automático (uma entrada por sessão) ========== //

  /**
   * Chave da sessão de um arquivo para um tipo de autor.
   * @param {string} filePath - Caminho do arquivo oficial ou do .temp.
   * @param {string} actorType - `user` ou `ai`.
   * @returns {string}
   * @private
   */
  sessionKey(filePath, actorType) {
    return `${this.key(filePath)}|${actorType}`;
  }

  /**
   * Prepara o registro de um salvamento automático. Deve ser chamada ANTES de gravar o rascunho: em uma sessão nova,
   * lê o conteúdo efetivo do arquivo (rascunho existente ou arquivo oficial), que serve de base das diferenças.
   * @param {string} filePath - Caminho do arquivo oficial.
   * @param {Actor} actor - Quem está salvando.
   * @returns {Promise<{sessionId: string, before: string|null}|null>} Null se o arquivo não é rastreado.
   */
  async beginAutosave(filePath, actor) {
    const official = this.key(filePath);
    if (!this.isTracked(official)) return null;

    const key = this.sessionKey(official, actor.type);
    const known = this.autosaveSessions.get(key);
    if (known) return { sessionId: known, before: null };

    const sessionId = uniqueId("session");
    const before =
      (await window.electronAPI.readFile(`${official}.temp`)) ??
      (await window.electronAPI.readFile(official)) ??
      "";
    this.autosaveSessions.set(key, sessionId);
    return { sessionId, before };
  }

  /**
   * Registra (ou atualiza) o registro da sessão de salvamento automático de um arquivo. Nunca lança erro.
   * @param {string} filePath - Caminho do arquivo oficial.
   * @param {{sessionId: string, before: string|null}} session - Resultado de {@link ChangelogService#beginAutosave}.
   * @param {string} after - Conteúdo do rascunho gravado.
   * @param {Actor} actor - Quem salvou.
   * @returns {Promise<Object|null>}
   */
  async recordAutosave(filePath, session, after, actor) {
    try {
      const official = this.key(filePath);
      const book = this.resolveBook(official);
      if (!book || !session) return null;
      const result = await window.electronAPI.changelogAutosave(book, {
        sessionId: session.sessionId,
        filePath: official,
        before: session.before,
        after,
        actor,
      });
      return result?.entry || null;
    } catch (error) {
      console.error("[CHANGELOG] Falha ao registrar autosave:", error);
      return null;
    }
  }

  /**
   * Encerra as sessões de salvamento automático de um arquivo (a próxima edição abre um novo registro).
   * @param {string} filePath - Caminho do arquivo.
   * @returns {void}
   */
  endSession(filePath) {
    const official = this.key(filePath);
    this.autosaveSessions.delete(this.sessionKey(official, "user"));
    this.autosaveSessions.delete(this.sessionKey(official, "ai"));
  }

  /**
   * Encerra as sessões de todos os arquivos, exceto o informado (usado ao trocar de arquivo no editor).
   * @param {string|null} [keepPath] - Arquivo que continua em edição.
   * @returns {void}
   */
  endSessionsExcept(keepPath = null) {
    const keep = keepPath ? this.key(keepPath) : null;
    for (const key of [...this.autosaveSessions.keys()]) {
      if (key.split("|")[0] !== keep && key.endsWith("|user")) {
        this.autosaveSessions.delete(key);
      }
    }
  }

  /**
   * Encerra as sessões de rascunho da IA (quando ela termina de editar).
   * @returns {void}
   */
  endAiSessions() {
    for (const key of [...this.autosaveSessions.keys()]) {
      if (key.endsWith("|ai")) this.autosaveSessions.delete(key);
    }
  }

  // ========== Outros registros ========== //

  /**
   * Registra uma mudança de configuração (ex.: provedor/modelo de IA) no changelog do livro atual.
   * Só entra quando há um livro selecionado (o changelog é por livro). Nunca registra chaves de API.
   * @param {Object} meta - Dados da mudança (`setting`, `from`, `to`...).
   * @param {Actor} [actor] - Quem alterou (padrão: usuário).
   * @returns {Promise<Object|null>}
   */
  async recordSetting(meta, actor) {
    try {
      const book = this.state.currentBookPath
        ? normalizePath(this.state.currentBookPath).replace(/\/+$/, "")
        : null;
      if (!book) return null;
      const result = await window.electronAPI.changelogRecord(book, {
        action: "setting",
        scope: "book",
        filePath: book,
        actor: actor || this.userActor(),
        meta,
      });
      return result?.entry || null;
    } catch (error) {
      console.error("[CHANGELOG] Falha ao registrar configuração:", error);
      return null;
    }
  }

  /**
   * Registra uma ação da Central de Revisões (issues encontrados, corrigidos ou dispensados, dicionário, tipos...).
   * Um registro por lote (vários issues de uma vez geram um registro só). Com `relFile` fica no arquivo; sem ele, no livro.
   * @param {Object} meta - `{ kind, count, types?, category?, word?, ... }`.
   * @param {Actor} [actor] - Quem agiu (padrão: sistema).
   * @param {string} [relFile] - Arquivo (relativo ao livro) a que o lote se refere.
   * @returns {Promise<Object|null>}
   */
  async recordReview(meta, actor, relFile) {
    try {
      const book = this.state.currentBookPath
        ? normalizePath(this.state.currentBookPath).replace(/\/+$/, "")
        : null;
      if (!book) return null;
      const result = await window.electronAPI.changelogRecord(book, {
        action: "review",
        ...(relFile ? {} : { scope: "book" }),
        filePath: relFile ? `${book}/${relFile}` : book,
        actor: actor || this.systemActor(),
        meta,
      });
      return result?.entry || null;
    } catch (error) {
      console.error("[CHANGELOG] Falha ao registrar a revisão:", error);
      return null;
    }
  }

  /**
   * Registra que um arquivo mudou de caminho (ex.: capítulo renumerado). O histórico do arquivo continua valendo.
   * @param {string} newPath - Novo caminho absoluto do arquivo.
   * @param {string} oldPath - Caminho absoluto anterior.
   * @param {Actor} [actor] - Quem moveu (padrão: sistema).
   * @param {string} [bookPath] - Livro, se não for o atual.
   * @returns {Promise<Object|null>}
   */
  recordMove(newPath, oldPath, actor, bookPath) {
    const book = this.resolveBook(newPath, bookPath);
    if (!book) return Promise.resolve(null);
    const fromRel = normalizePath(oldPath).slice(book.length + 1);
    return this.record({
      action: "move",
      filePath: newPath,
      actor: actor || this.systemActor(),
      meta: { from: fromRel },
      bookPath,
    });
  }
}
