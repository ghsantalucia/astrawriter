// @ts-nocheck
/**
 * @file Serviço da Central de Revisões: mantém a lista de issues do livro (problemas, inconsistências e sugestões),
 * dispensas, dicionário e o cache da varredura incremental.
 *
 * Origens dos issues:
 * - **derivados** (`source: "system"`): links quebrados, palavras repetidas e desconhecidas. São recalculados só nos
 *   arquivos que mudaram (hash) e guardados no cache `state.json` dentro de `.system/review/`;
 * - **registrados** (`source: "ai"`): contradições, gramática, dicas... A IA os registra pela tool `register_issues`
 *   e eles ficam em `registered.json` (não são recalculáveis de graça);
 * - **externos**: calculados por outros serviços a partir do livro (ex.: ordem dos eventos da linha do tempo).
 *
 * Tudo é atualizado por eventos (o app emite `issues:changed` nos dois barramentos a cada mudança).
 */

import { uiBus } from "../events/uiBus.js";
import { domainBus } from "../events/domainBus.js";
import { normalizePath, foldText } from "../utils/helpers.js";
import { parseMarkdown } from "../utils/markdown.js";
import { splitAliases } from "../utils/bookFiles.js";
import { hrefToRelPath } from "../components/Editor/editorTools.js";
import { spellService } from "./spellService.js";
import {
  REVIEW_DIR,
  loadReviewData,
  writeSystemJson,
  EMPTY,
} from "../review/reviewStore.js";
import {
  collectWords,
  dictionaryKey,
  findBrokenLinkIssues,
  findRepeatedWordIssues,
  findTypoIssues,
  lineOf,
  shortHash,
} from "../review/issueCheckers.js";
import { analyzeTimeline, eventFromMetadata, isEventFile, timelineMarkdown } from "../review/timeline.js";
import { splitFrontmatter } from "../utils/markdown.js";
import {
  ISSUE_TYPES,
  categoryInfo,
  normalizeSeverity,
  typeInfo,
} from "../review/issueTypes.js";

/** Espera antes de reanalisar depois de uma alteração (agrupa salvamentos seguidos). */
const RESCAN_DELAY_MS = 1200;

/** Arquivos que não entram na verificação ortográfica. */
/** Arquivos sem ortografia: índices, a linha do tempo e a análise dos capítulos (texto técnico gerado pela IA, com termos em inglês). */
const NO_SPELLING = [/^notes\/manual-completo\.md$/i, /(^|\/)index\.md$/i, /^assets\/events\/timeline\.md$/i, /^content\/chapter_\d+\/3_analysis\.md$/i];

/**
 * Serviço de issues (Central de Revisões).
 * @class
 */
export class IssueService {
  /**
   * @param {Object} state - Estado global.
   * @param {import('./changelogService.js').ChangelogService} changelog - Serviço do changelog.
   * @param {import('./fileService.js').FileService} fileService - Serviço de arquivos.
   */
  constructor(state, changelog, fileService) {
    this.state = state;
    this.changelog = changelog;
    this.fileService = fileService;
    /** @type {{state: Object, registered: Object, dismissed: Object, dictionary: Object}|null} */
    this.data = null;
    this.bookPath = null;
    /** Issues calculados por outros serviços (ex.: linha do tempo), por chave. */
    this.external = {};
    this.scanning = null;
    this.rerun = null;
    this.timer = null;
    this.pendingOnly = new Set();
    this.pendingAll = false;
    this.cache = null;
    this.loaded = Promise.resolve();
    this.listen();
  }

  // ========== Eventos ========== //

  /**
   * Liga os ouvintes: o livro trocado carrega tudo; qualquer alteração de arquivo agenda uma reanálise incremental.
   * @returns {void}
   * @private
   */
  listen() {
    uiBus.on("book:changed", () => {
      this.loaded = this.load().then(() => this.scan());
    });
    uiBus.on("book:cleared", () => this.unload());

    // Salvamento automático, sincronização e descarte de rascunhos: só o arquivo afetado é reanalisado
    for (const event of ["temp-file:saved", "temp-file:synced", "temp-file:deleted", "file:variables-changed"]) {
      uiBus.on(event, (payload) => {
        const path = typeof payload === "string" ? payload : payload?.path || payload?.filePath;
        this.schedule(path ? this.relOf(path) : null);
      });
    }
    // Estrutura mudou (criação, exclusão, movimentação, restauração...): os links de todos os arquivos podem ter mudado
    for (const event of ["file:created", "chapter:created", "file:deleted", "file:restored", "book:structure-changed", "file:moved"]) {
      uiBus.on(event, () => this.schedule(null));
    }
  }

  /**
   * Caminho relativo ao livro de um caminho absoluto (sem `.temp`).
   * @param {string} abs - Caminho absoluto.
   * @returns {string|null}
   */
  relOf(abs) {
    const book = normalizePath(this.state.currentBookPath || "").replace(/\/+$/, "");
    const path = normalizePath(abs).replace(/\.temp$/, "");
    if (!book || !path.startsWith(`${book}/`)) return null;
    return path.slice(book.length + 1);
  }

  /**
   * Agenda uma reanálise (de um arquivo ou do livro todo), agrupando pedidos seguidos.
   * @param {string|null} rel - Arquivo (relativo ao livro) ou null para o livro inteiro.
   * @returns {void}
   */
  schedule(rel) {
    if (!this.data || !this.isEnabled()) return;
    if (rel) this.pendingOnly.add(rel);
    else this.pendingAll = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const only = this.pendingAll ? null : [...this.pendingOnly];
      this.pendingAll = false;
      this.pendingOnly.clear();
      this.scan({ only }).catch((e) => console.error("[ISSUES] Falha na varredura:", e));
    }, RESCAN_DELAY_MS);
  }

  // ========== Carga e persistência ========== //

  /**
   * Carrega do disco os dados da central para o livro atual.
   * @returns {Promise<void>}
   */
  async load() {
    const book = this.state.currentBookPath
      ? normalizePath(this.state.currentBookPath).replace(/\/+$/, "")
      : null;
    this.bookPath = book;
    this.external = {};
    this.cache = null;
    if (!book) {
      this.data = null;
      this.publish();
      return;
    }
    this.data = await loadReviewData(book);
    spellService.setBookWords(new Set(this.data.dictionary.words));
    this.rebuildTimeline();
    this.publish();
  }

  /**
   * Esquece tudo (nenhum livro selecionado).
   * @returns {void}
   */
  unload() {
    this.data = null;
    this.bookPath = null;
    this.external = {};
    this.cache = null;
    spellService.setBookWords(new Set());
    this.publish();
  }

  /**
   * Grava um dos arquivos da central.
   * @param {"state"|"registered"|"dismissed"|"dictionary"} name - Qual arquivo.
   * @returns {Promise<void>}
   * @private
   */
  async persist(name) {
    if (!this.data || !this.bookPath) return;
    await writeSystemJson(this.bookPath, `${REVIEW_DIR}/${name}.json`, this.data[name]);
  }

  /**
   * As revisões do sistema estão ligadas neste livro? Desligadas, os issues já encontrados continuam na central, mas
   * nada novo é procurado e o rodapé do editor não mostra o contador.
   * @returns {boolean}
   */
  isEnabled() {
    return this.data?.settings?.enabled !== false;
  }

  /**
   * Liga ou desliga as revisões do sistema neste livro (ao ligar, o livro é reanalisado).
   * @param {boolean} value - Ligadas?
   * @returns {Promise<void>}
   */
  async setEnabled(value) {
    if (!this.data) return;
    this.data.settings.enabled = Boolean(value);
    await this.persist("settings");
    this.publish();
    if (value) await this.scan();
  }

  /**
   * Avisa a interface (e a IA) que a lista mudou.
   * @returns {void}
   * @private
   */
  publish() {
    this.cache = null;
    const summary = this.summary();
    uiBus.emit("issues:changed", summary);
    domainBus.emit("issues:changed", summary);
  }

  // ========== Leitura ========== //

  /**
   * Palavras que nunca são erro: dicionário do livro e títulos/nomes/apelidos das fichas.
   * @returns {Set<string>}
   * @private
   */
  knownWords() {
    const words = new Set(this.data?.dictionary.words || []);
    for (const file of Object.values(this.data?.state.files || {})) {
      for (const w of file.words || []) words.add(w);
    }
    return words;
  }

  /**
   * Todos os issues visíveis (sem os dispensados, os de tipos dispensados e as palavras aceitas no dicionário).
   * @returns {Object[]}
   */
  all() {
    if (!this.data) return [];
    if (this.cache) return this.cache;
    const known = this.knownWords();
    const dismissed = this.data.dismissed;
    const out = [];
    const push = (issue) => {
      if (dismissed.issues[issue.id] || dismissed.types[issue.type]) return;
      if (issue.type === "typo" && known.has(dictionaryKey(issue.word))) return;
      out.push(issue);
    };
    for (const file of Object.values(this.data.state.files)) file.issues.forEach(push);
    this.data.registered.issues.forEach(push);
    Object.values(this.external).forEach((list) => list.forEach(push));
    this.cache = out;
    return out;
  }

  /**
   * Localiza um issue visível pelo id.
   * @param {string} id - Id do issue.
   * @returns {Object|undefined}
   */
  find(id) {
    return this.all().find((i) => i.id === id);
  }

  /**
   * Filtra os issues.
   * @param {Object} [filter]
   * @param {string} [filter.category] - Categoria.
   * @param {string} [filter.type] - Tipo.
   * @param {string} [filter.file] - Arquivo (relativo ao livro).
   * @param {"error"|"warning"} [filter.severity] - Severidade.
   * @param {"system"|"ai"} [filter.source] - Origem.
   * @returns {Object[]}
   */
  list(filter = {}) {
    return this.all().filter(
      (i) =>
        (!filter.category || i.category === filter.category) &&
        (!filter.type || i.type === filter.type) &&
        (!filter.file || i.file === filter.file) &&
        (!filter.severity || i.severity === filter.severity) &&
        (!filter.source || i.source === filter.source),
    );
  }

  /**
   * Resumo da central: totais, por categoria, por tipo, por arquivo e os mais graves.
   * @returns {{total: number, errors: number, warnings: number, byCategory: Object, byType: Object, byFile: Object, worst: Object[], color: "none"|"warning"|"error"}}
   */
  summary() {
    const issues = this.all();
    const byCategory = {};
    const byType = {};
    const byFile = {};
    let errors = 0;
    let warnings = 0;
    for (const issue of issues) {
      const sev = issue.severity === "error" ? "error" : "warning";
      if (sev === "error") errors++;
      else warnings++;
      (byCategory[issue.category] ??= { error: 0, warning: 0 })[sev]++;
      (byType[issue.type] ??= { error: 0, warning: 0 })[sev]++;
      if (issue.file) (byFile[issue.file] ??= { error: 0, warning: 0 })[sev]++;
    }
    const worst = issues
      .filter((i) => i.severity === "error")
      .slice(0, 5)
      .map((i) => this.brief(i));
    return {
      total: issues.length,
      errors,
      warnings,
      byCategory,
      byType,
      byFile,
      worst,
      disabled: !this.isEnabled(),
      color: errors > 0 ? "error" : warnings > 0 ? "warning" : "none",
    };
  }

  /**
   * Versão compacta de um issue (o que a IA e a interface listam).
   * @param {Object} issue - Issue completo.
   * @returns {Object}
   */
  brief(issue) {
    return {
      id: issue.id,
      category: issue.category,
      type: issue.type,
      severity: issue.severity,
      source: issue.source,
      file: issue.file,
      line: issue.line,
      excerpt: String(issue.excerpt || "").slice(0, 120),
      message: issue.message,
      fix: issue.suggestion?.replace !== undefined ? issue.suggestion.replace : undefined,
    };
  }

  /**
   * Tipos dispensados (com a data) e o catálogo para exibir na página inicial.
   * @returns {Array<{type: string, label: string, category: string, at: string}>}
   */
  dismissedTypes() {
    return Object.entries(this.data?.dismissed.types || {}).map(([type, info]) => ({
      type,
      label: typeInfo(type).label,
      category: typeInfo(type).category,
      at: info.at,
    }));
  }

  /**
   * Palavras do dicionário do livro.
   * @returns {string[]}
   */
  dictionaryWords() {
    return [...(this.data?.dictionary.words || [])].sort((a, b) => a.localeCompare(b));
  }

  // ========== Varredura ========== //

  /**
   * Varre o livro. Por padrão é incremental: só os arquivos cujo hash mudou são reanalisados.
   * @param {Object} [options]
   * @param {string[]|null} [options.only] - Só estes arquivos (relativos ao livro).
   * @param {string[]|null} [options.types] - Só estes tipos de issue (relê todos os arquivos; usado ao reativar um tipo).
   * @returns {Promise<void>}
   */
  async scan({ only = null, types = null } = {}) {
    if (!this.data || !this.bookPath || !this.isEnabled()) return;
    // Uma varredura por vez: pedidos que chegam durante ela rodam logo depois
    if (this.scanning) {
      this.rerun = { only, types };
      return this.scanning;
    }
    this.scanning = this.doScan({ only, types }).finally(async () => {
      this.scanning = null;
      const next = this.rerun;
      this.rerun = null;
      if (next) await this.scan(next);
    });
    return this.scanning;
  }

  /**
   * Corpo da varredura (ver {@link IssueService#scan}).
   * @param {Object} options - Opções (`only`, `types`).
   * @returns {Promise<void>}
   * @private
   */
  async doScan({ only, types }) {
    const data = this.data;
    const book = this.bookPath;
    const initial = !data.state.scanned && !types;
    const known = {};
    if (!types) {
      for (const [rel, file] of Object.entries(data.state.files)) known[rel] = file.hash;
    }

    const files = await window.electronAPI.scanBook(book, known, types ? null : only);
    if (this.data !== data) return; // trocou de livro no meio da varredura

    const existing = new Set(files.map((f) => foldText(f.rel)));
    const present = new Set(files.map((f) => f.rel));
    let changedAny = false;
    let totalFound = 0;
    let filesWithIssues = 0;

    // Arquivos que deixaram de existir saem do cache
    for (const rel of Object.keys(data.state.files)) {
      if (!present.has(rel)) {
        delete data.state.files[rel];
        changedAny = true;
      }
    }

    const spellOn = localStorage.getItem("app_spellcheck_enabled") !== "false";
    const fresh = [];

    for (const f of files) {
      if (f.content === null) continue;
      if (!types && !f.changed) continue;
      if (/(^|\/)template\.md$/i.test(f.rel)) {
        data.state.files[f.rel] = { hash: f.hash, title: "", words: [], issues: [] };
        continue;
      }

      const previous = data.state.files[f.rel];
      const issues = await this.analyzeFile(f, existing, spellOn, types);
      const entry = previous || { issues: [] };
      const before = new Set((previous?.issues || []).map((i) => i.id));
      entry.issues = types
        ? entry.issues.filter((i) => !types.includes(i.type)).concat(issues)
        : issues;
      entry.hash = f.hash;
      Object.assign(entry, this.describeFile(f.content, f.rel));
      data.state.files[f.rel] = entry;
      changedAny = true;

      // Issues novos desse arquivo (um registro só no changelog, mesmo com vários issues)
      const added = entry.issues.filter(
        (i) => !before.has(i.id) && !data.dismissed.issues[i.id] && !data.dismissed.types[i.type],
      );
      if (added.length > 0) {
        filesWithIssues++;
        totalFound += added.length;
        fresh.push({ rel: f.rel, added });
      }

      // Issues registrados pela IA nesse arquivo: o trecho mudou de lugar ou deixou de existir
      this.relocateRegistered(f.rel, f.content);
    }

    // Arquivos removidos levam consigo os issues registrados
    const before = data.registered.issues.length;
    data.registered.issues = data.registered.issues.filter((i) => !i.file || present.has(i.file));
    if (data.registered.issues.length !== before) await this.persist("registered");

    // Os links dependem de quais arquivos existem: se o conjunto mudou, reconfere os links de todos os arquivos
    const pathsKey = shortHash([...existing].sort().join("|"));
    const needLinkPass = !types && data.state.pathsKey !== undefined && data.state.pathsKey !== pathsKey;
    data.state.pathsKey = pathsKey;

    if (initial) data.state.scanned = true;
    if (changedAny || initial) await this.persist("state");
    this.rebuildTimeline();
    this.publish();

    // Changelog: um registro por arquivo (ou um resumo, na primeira varredura do livro)
    if (initial) {
      if (totalFound > 0) {
        await this.changelog?.recordReview({ kind: "scan", count: totalFound, files: filesWithIssues });
      }
    } else {
      for (const { rel, added } of fresh) {
        await this.changelog?.recordReview({ kind: "found", count: added.length, types: this.countTypes(added) }, undefined, rel);
      }
    }

    // Não chama scan() daqui (ela esperaria por si mesma): agenda a reconferência para logo depois desta varredura
    if (needLinkPass) this.rerun = this.rerun ? { only: null, types: null } : { only: null, types: ["broken-link"] };
  }

  /**
   * Recalcula a linha do tempo a partir das fichas de eventos em cache: guarda a sugestão de ordem e publica os issues
   * da categoria "linha do tempo" (ordem circular, momento contraditório, referências inexistentes...).
   * @returns {void}
   */
  rebuildTimeline() {
    const events = Object.values(this.data?.state.files || {})
      .map((f) => f.event)
      .filter(Boolean);
    const { ordered, issues } = analyzeTimeline(events);
    this.timeline = { ordered, events: events.length };
    this.external.timeline = issues;
    this.cache = null;
    this.scheduleTimelineSync();
  }

  /**
   * Agenda a atualização automática do arquivo da linha do tempo (agrupa várias mudanças seguidas).
   * @returns {void}
   * @private
   */
  scheduleTimelineSync() {
    clearTimeout(this.timelineTimer);
    this.timelineTimer = setTimeout(() => {
      this.syncTimelineFile().catch((e) => console.error("[ISSUES] Falha ao atualizar a linha do tempo:", e));
    }, 1500);
  }

  /**
   * Mantém o arquivo da linha do tempo (`assets/events/timeline.md`) em dia sem usar IA: a ordem vem dos eventos ligados
   * pelo autor ("antes"/"depois" e momento), e os eventos sem data conhecida ficam numa seção reservada. Em caso de
   * contradição (ordem circular ou momento incompatível) o arquivo não é alterado: o autor resolve nos issues. O arquivo
   * é gravado direto (como os índices) e a alteração entra no changelog como ajuste do sistema.
   * @returns {Promise<void>}
   */
  async syncTimelineFile() {
    const book = this.bookPath;
    if (!this.data || !book || !this.timeline) return;
    if ((this.external.timeline || []).some((i) => i.type === "timeline-cycle" || i.type === "timeline-order")) return;
    const abs = `${book}/assets/events/timeline.md`;
    // Rascunho pendente (ex.: a IA atualizou): não atropela
    if ((await window.electronAPI.readFile(`${abs}.temp`)) !== null) return;
    const before = await window.electronAPI.readFile(abs);
    if (before === null) return;
    const { frontmatter, body } = splitFrontmatter(before);
    const { ordered } = this.timeline;
    // Sem eventos e ainda sem lista no arquivo: mantém o texto de apresentação
    if (ordered.length === 0 && !/^\d+\.\s/m.test(body)) return;
    const after = frontmatter + timelineMarkdown(ordered);
    if (after.trim() === before.trim()) return;
    if (this.bookPath !== book) return; // trocou de livro enquanto lia
    await window.electronAPI.saveFile(abs, after);
    await this.changelog?.record({
      action: "update",
      filePath: abs,
      before,
      after,
      actor: this.changelog.systemActor(),
      meta: { reason: "Linha do tempo atualizada pelo sistema a partir dos eventos" },
      bookPath: book,
    });
  }

  /**
   * Sugestão de ordem da linha do tempo (calculada pelo sistema, sem IA) e a ficha da linha do tempo.
   * @returns {{ordered: Object[], events: number}}
   */
  timelineSuggestion() {
    return this.timeline || { ordered: [], events: 0 };
  }

  /**
   * Escreve a linha do tempo (`assets/events/timeline.md`) a partir de uma lista ordenada de eventos. O arquivo é
   * somente leitura para o autor: só o sistema (por decisão do autor) ou a IA o preenchem. Vai para o rascunho.
   * @param {Array<{rel: string, title: string, when: string}>} ordered - Eventos na ordem final.
   * @param {Object} actor - Quem escreve (sistema, por decisão do autor, ou a IA).
   * @returns {Promise<void>}
   */
  async writeTimeline(ordered, actor) {
    const rel = "assets/events/timeline.md";
    const abs = `${this.bookPath}/${rel}`;
    const { content } = await this.fileService.readFile(abs);
    if (content === null) throw new Error("A linha do tempo (assets/events/timeline.md) não existe neste livro.");
    const { frontmatter } = splitFrontmatter(content);
    const saved = await this.fileService.saveTempFile(abs, frontmatter + timelineMarkdown(ordered), { actor });
    if (!saved?.success) throw new Error(saved?.error || "Falha ao salvar a linha do tempo.");
    if (actor?.type === "ai") this.changelog?.markAiDraft(abs);
    uiBus.emit("temp-file:saved", normalizePath(abs));
    if (normalizePath(this.state.currentFilePath || "").replace(/\.temp$/, "") === normalizePath(abs)) {
      uiBus.emit("editor:open-file", { path: normalizePath(abs) });
    }
  }

  /**
   * Metadados guardados no cache de um arquivo: título e palavras que nunca são erro (título, nome e apelidos).
   * @param {string} content - Conteúdo do arquivo.
   * @param {string} rel - Caminho relativo.
   * @returns {{title: string, words: string[], event: Object|null}}
   * @private
   */
  describeFile(content, rel) {
    let meta = {};
    try {
      meta = parseMarkdown(content).metadata || {};
    } catch {
      meta = {};
    }
    const title = String(meta.title || meta.data?.title?.content || rel.split("/").pop().replace(/\.md$/i, ""));
    const words = new Set();
    const add = (text) =>
      String(text || "")
        .match(/[\p{L}\p{N}'’]+/gu)
        ?.forEach((w) => words.add(dictionaryKey(w)));
    add(meta.title);
    add(meta.data?.title?.content);
    splitAliases(meta.data?.aliases?.content).forEach(add);
    return { title, words: [...words], event: isEventFile(rel) ? eventFromMetadata(rel, meta, title) : null };
  }

  /**
   * Roda os verificadores determinísticos em um arquivo.
   * @param {{rel: string, content: string}} file - Arquivo lido.
   * @param {Set<string>} existing - Caminhos existentes (normalizados).
   * @param {boolean} spellOn - Se a verificação ortográfica está ligada.
   * @param {string[]|null} types - Restringe aos tipos informados.
   * @returns {Promise<Object[]>}
   * @private
   */
  async analyzeFile(file, existing, spellOn, types) {
    const wants = (t) => !types || types.includes(t);
    const { rel, content } = file;
    const issues = [];

    if (wants("broken-link")) {
      issues.push(...findBrokenLinkIssues(rel, content, existing, hrefToRelPath));
    }

    if (spellOn && !NO_SPELLING.some((re) => re.test(rel))) {
      const repeated = findRepeatedWordIssues(rel, content);
      if (wants("repeated-word")) issues.push(...repeated);
      if (wants("typo")) {
        const words = collectWords(content);
        const known = this.knownWords();
        const unique = [...new Set(words.map((w) => w.word).filter((w) => !known.has(dictionaryKey(w))))];
        const misspelled = new Set(await spellService.findMisspelled(unique));
        issues.push(...findTypoIssues(rel, content, words, misspelled, repeated));
      }
    }
    return issues;
  }

  /**
   * Contagem por tipo de uma lista de issues.
   * @param {Object[]} issues - Issues.
   * @returns {Object<string, number>}
   * @private
   */
  countTypes(issues) {
    const counts = {};
    for (const i of issues) counts[i.type] = (counts[i.type] || 0) + 1;
    return counts;
  }

  /**
   * Reposiciona (ou remove, se o trecho sumiu) os issues registrados pela IA de um arquivo alterado.
   * @param {string} rel - Arquivo.
   * @param {string} content - Conteúdo novo.
   * @returns {void}
   * @private
   */
  relocateRegistered(rel, content) {
    const list = this.data.registered.issues;
    let changed = false;
    this.data.registered.issues = list.filter((issue) => {
      if (issue.file !== rel || !issue.excerpt) return true;
      const at = this.locate(content, issue.excerpt, issue.start ?? 0);
      if (at < 0) {
        changed = true;
        return false; // o trecho foi reescrito: o issue deixou de valer
      }
      if (at !== issue.start) {
        issue.start = at;
        issue.end = at + issue.excerpt.length;
        issue.line = lineOf(content, at);
        changed = true;
      }
      return true;
    });
    if (changed) this.persist("registered");
  }

  /**
   * Posição do trecho no texto: a mais próxima da dica (o trecho pode ter andado por edições acima dele).
   * @param {string} content - Texto.
   * @param {string} excerpt - Trecho.
   * @param {number} hint - Posição esperada.
   * @returns {number} Índice, ou -1 se o trecho não existe mais.
   */
  locate(content, excerpt, hint = 0) {
    if (!excerpt) return -1;
    if (content.slice(hint, hint + excerpt.length) === excerpt) return hint;
    let best = -1;
    let at = content.indexOf(excerpt);
    while (at >= 0) {
      if (best < 0 || Math.abs(at - hint) < Math.abs(best - hint)) best = at;
      at = content.indexOf(excerpt, at + 1);
    }
    return best;
  }

  // ========== Ações do usuário ========== //

  /**
   * Metadados de um arquivo na árvore do livro (inclui as permissões herdadas).
   * @param {string} rel - Caminho relativo ao livro.
   * @returns {Promise<Object|null>}
   * @private
   */
  async fileMetadata(rel) {
    const tree = await window.electronAPI.getTree(this.bookPath);
    const parts = rel.split("/");
    let node = tree;
    for (const folder of parts.slice(0, -1)) node = node?.folders?.[folder];
    return node?.files?.[parts[parts.length - 1].replace(/\.md$/i, "")]?.metadata || null;
  }

  /**
   * Corrige um issue aplicando a solução recomendada. A alteração vai para o rascunho (`.md.temp`), como todas as
   * edições, e só persiste quando o autor sincronizar; fica no changelog com o autor "Sistema".
   * @param {string} id - Id do issue.
   * @returns {Promise<void>}
   * @throws {Error} Se o issue não tem solução, o arquivo não pode ser editado ou o trecho mudou.
   */
  async fix(id) {
    const issue = this.find(id);
    if (!issue) throw new Error("Esse issue não existe mais.");
    if (typeof issue.suggestion?.replace !== "string") {
      throw new Error("Este issue não tem uma correção automática.");
    }
    const meta = await this.fileMetadata(issue.file);
    if (meta && meta.humanWrite === false) {
      throw new Error("Este arquivo é somente leitura: a correção não pode ser aplicada.");
    }

    const abs = `${this.bookPath}/${issue.file}`;
    const { content } = await this.fileService.readFile(abs);
    if (content === null) throw new Error("Não foi possível ler o arquivo.");
    const at = this.locate(content, issue.excerpt, issue.start ?? 0);
    if (at < 0) {
      await this.scan({ only: [issue.file] });
      throw new Error("O trecho foi alterado desde a análise. O issue foi atualizado.");
    }

    const next = content.slice(0, at) + issue.suggestion.replace + content.slice(at + issue.excerpt.length);
    const saved = await this.fileService.saveTempFile(abs, next, {
      actor: this.changelog?.systemActor(),
    });
    if (!saved?.success) throw new Error(saved?.error || "Falha ao salvar a correção.");

    // Issue resolvido: sai do cache e dos registrados; o arquivo é reanalisado
    this.removeIssue(id);
    await this.changelog?.recordReview(
      { kind: "fixed", count: 1, types: { [issue.type]: 1 } },
      this.changelog.systemActor(),
      issue.file,
    );
    uiBus.emit("temp-file:saved", normalizePath(abs));
    if (normalizePath(this.state.currentFilePath || "").replace(/\.temp$/, "") === normalizePath(abs)) {
      uiBus.emit("editor:open-file", { path: normalizePath(abs) });
    }
    await this.persist("state");
    await this.persist("registered");
    this.publish();
    this.schedule(issue.file);
  }

  /**
   * Retira um issue das listas (derivados e registrados).
   * @param {string} id - Id do issue.
   * @returns {void}
   * @private
   */
  removeIssue(id) {
    for (const file of Object.values(this.data.state.files)) {
      file.issues = file.issues.filter((i) => i.id !== id);
    }
    this.data.registered.issues = this.data.registered.issues.filter((i) => i.id !== id);
  }

  /**
   * Dispensa issues (não voltam a aparecer, mesmo que a análise os encontre de novo).
   * @param {string[]} ids - Ids dos issues.
   * @returns {Promise<number>} Quantos foram dispensados.
   */
  async dismiss(ids) {
    const found = ids.map((id) => this.find(id)).filter(Boolean);
    if (found.length === 0) return 0;
    const now = new Date().toISOString();
    for (const issue of found) {
      this.data.dismissed.issues[issue.id] = {
        at: now,
        type: issue.type,
        file: issue.file,
        excerpt: String(issue.excerpt || "").slice(0, 80),
      };
    }
    await this.persist("dismissed");
    this.publish();
    const files = new Set(found.map((i) => i.file));
    await this.changelog?.recordReview(
      { kind: "dismissed", count: found.length, types: this.countTypes(found) },
      this.changelog.userActor(),
      files.size === 1 ? [...files][0] : undefined,
    );
    return found.length;
  }

  /**
   * Dispensa um tipo inteiro de issue (reversível pela página inicial da central).
   * @param {string} type - Tipo.
   * @returns {Promise<void>}
   */
  async dismissType(type) {
    this.data.dismissed.types[type] = { at: new Date().toISOString() };
    await this.persist("dismissed");
    this.publish();
    await this.changelog?.recordReview({ kind: "type-dismissed", type, count: 1 }, this.changelog.userActor());
  }

  /**
   * Reativa um tipo dispensado. Tipos do sistema exigem uma varredura do livro todo, só procurando por ele.
   * @param {string} type - Tipo.
   * @returns {Promise<void>}
   */
  async restoreType(type) {
    delete this.data.dismissed.types[type];
    await this.persist("dismissed");
    this.publish();
    await this.changelog?.recordReview({ kind: "type-restored", type, count: 1 }, this.changelog.userActor());
    if (typeInfo(type).source === "system" || ["typo", "repeated-word", "broken-link"].includes(type)) {
      await this.scan({ types: [type] });
    }
  }

  /**
   * Adiciona uma palavra ao dicionário do livro e remove os issues que a citam, sem reler os arquivos.
   * @param {string} word - Palavra.
   * @returns {Promise<void>}
   */
  async addToDictionary(word) {
    const key = dictionaryKey(word);
    if (!key) return;
    if (!this.data.dictionary.words.includes(key)) this.data.dictionary.words.push(key);
    spellService.setBookWords(new Set(this.data.dictionary.words));

    let removed = 0;
    for (const file of Object.values(this.data.state.files)) {
      const keep = file.issues.filter((i) => !(i.type === "typo" && dictionaryKey(i.word) === key));
      removed += file.issues.length - keep.length;
      file.issues = keep;
    }
    await this.persist("dictionary");
    await this.persist("state");
    this.publish();
    uiBus.emit("editor:refresh-stats");
    await this.changelog?.recordReview(
      { kind: "dictionary", word: key, removed, count: removed },
      this.changelog.userActor(),
    );
  }

  /**
   * Remove uma palavra do dicionário do livro e volta a procurá-la.
   * @param {string} word - Palavra.
   * @returns {Promise<void>}
   */
  async removeFromDictionary(word) {
    const key = dictionaryKey(word);
    this.data.dictionary.words = this.data.dictionary.words.filter((w) => w !== key);
    spellService.setBookWords(new Set(this.data.dictionary.words));
    await this.persist("dictionary");
    this.publish();
    await this.scan({ types: ["typo"] });
    uiBus.emit("editor:refresh-stats");
  }

  // ========== Registro pela IA ========== //

  /**
   * Registra issues encontrados pela IA (contradições, gramática, dicas...). Cada issue tem arquivo, trecho exato e
   * mensagem; tipos dispensados e issues já dispensados ou registrados são ignorados.
   * @param {Array<Object>} items - Issues da IA.
   * @param {Object} actor - Autor (a IA).
   * @returns {Promise<{registered: number, skipped: Array<{index: number, reason: string}>}>}
   */
  async register(items, actor) {
    if (!this.data) throw new Error("Nenhum livro selecionado.");
    const skipped = [];
    const added = [];

    for (let index = 0; index < items.length; index++) {
      const item = items[index] || {};
      const type = ISSUE_TYPES[item.type] ? item.type : null;
      if (!type) {
        skipped.push({ index, reason: `Tipo "${item.type}" desconhecido. Use um de: ${Object.keys(ISSUE_TYPES).join(", ")}.` });
        continue;
      }
      if (this.data.dismissed.types[type]) {
        skipped.push({ index, reason: `O autor dispensou o tipo "${type}": não registre issues dele.` });
        continue;
      }
      if (!item.file || !item.message) {
        skipped.push({ index, reason: "Informe 'file' e 'message'." });
        continue;
      }

      const file = String(item.file).replace(/^\/+/, "");
      const { content } = await this.fileService.readFile(`${this.bookPath}/${file}`);
      if (content === null) {
        skipped.push({ index, reason: `O arquivo "${file}" não existe.` });
        continue;
      }
      let start = null;
      let end = null;
      let excerpt = String(item.excerpt || "");
      if (excerpt) {
        const nth = Math.max(1, Number(item.occurrence) || 1);
        let at = -1;
        for (let n = 0; n < nth; n++) at = content.indexOf(excerpt, at + 1);
        if (at < 0) {
          skipped.push({ index, reason: `O trecho informado não foi encontrado em "${file}". Copie o texto exatamente como está no arquivo.` });
          continue;
        }
        start = at;
        end = at + excerpt.length;
      }

      const info = typeInfo(type);
      const id = `a-${shortHash(`${file}|${type}|${excerpt}|${item.message}`)}`;
      if (this.data.dismissed.issues[id] || this.data.registered.issues.some((i) => i.id === id)) {
        skipped.push({ index, reason: "Esse issue já foi registrado ou dispensado." });
        continue;
      }

      const issue = {
        id,
        category: info.category,
        type,
        severity: normalizeSeverity(info.category, item.severity || info.severity),
        source: "ai",
        file,
        start,
        end,
        line: start === null ? null : lineOf(content, start),
        excerpt,
        message: String(item.message).slice(0, 600),
        createdAt: new Date().toISOString(),
      };
      if (typeof item.replacement === "string") {
        issue.suggestion = { replace: item.replacement, label: item.replacement === "" ? "Remover o trecho" : `Trocar por "${item.replacement}"` };
      }
      if (Array.isArray(item.related)) {
        issue.related = item.related
          .filter((r) => r?.file)
          .slice(0, 5)
          .map((r) => ({ file: String(r.file).replace(/^\/+/, ""), excerpt: String(r.excerpt || "").slice(0, 200) }));
      }
      added.push(issue);
    }

    if (added.length > 0) {
      this.data.registered.issues.push(...added);
      await this.persist("registered");
      this.publish();
      await this.changelog?.recordReview(
        { kind: "registered", count: added.length, types: this.countTypes(added) },
        actor,
      );
    }
    return { registered: added.length, skipped };
  }

  /**
   * Marca issues registrados pela IA como resolvidos (ex.: depois de a IA corrigir o texto).
   * @param {string[]} ids - Ids dos issues.
   * @param {Object} actor - Autor.
   * @returns {Promise<number>} Quantos foram removidos.
   */
  async resolve(ids, actor) {
    let count = 0;
    for (const id of ids) {
      const before = this.data.registered.issues.length;
      this.data.registered.issues = this.data.registered.issues.filter((i) => i.id !== id);
      if (this.data.registered.issues.length !== before) count++;
    }
    if (count > 0) {
      await this.persist("registered");
      this.publish();
      await this.changelog?.recordReview({ kind: "resolved", count }, actor);
    }
    return count;
  }

  /**
   * Define os issues de uma fonte externa (ex.: `timeline`), substituindo os anteriores dela.
   * @param {string} key - Nome da fonte.
   * @param {Object[]} issues - Issues completos.
   * @returns {void}
   */
  setExternal(key, issues) {
    this.external[key] = issues;
    this.publish();
  }

  /**
   * Título de um arquivo para exibição (o título do frontmatter ou o nome do arquivo).
   * @param {string} rel - Caminho relativo ao livro.
   * @returns {string}
   */
  fileTitle(rel) {
    return this.data?.state.files[rel]?.title || rel.split("/").pop().replace(/\.md$/i, "");
  }

  /**
   * Descarta o cache e reanalisa o livro inteiro.
   * @returns {Promise<void>}
   */
  async rescanAll() {
    if (!this.data) return;
    this.data.state.files = {};
    this.data.state.scanned = false;
    await this.scan();
  }

  /**
   * O que procurar no editor para levar o cursor até um issue: o texto visível do trecho e qual ocorrência dele.
   * @param {Object} issue - Issue.
   * @returns {Promise<{path: string, reveal: {term: string, occurrence: number}|null}>}
   */
  async revealTarget(issue) {
    const path = `${this.bookPath}/${issue.file}`;
    const excerpt = String(issue.excerpt || "");
    if (!excerpt) return { path, reveal: null };

    // Link Markdown: no editor aparece só o texto do link
    const link = excerpt.match(/^\[([^\]]*)\]\(/);
    const term = (link ? link[1] : excerpt.split("\n")[0]).trim();
    if (!term) return { path, reveal: null };

    let occurrence = 0;
    const { content } = await this.fileService.readFile(path);
    if (content) {
      const upTo = this.locate(content, excerpt, issue.start ?? 0);
      const before = upTo > 0 ? content.slice(0, upTo) : "";
      occurrence = before.split(term).length - 1;
    }
    return { path, reveal: { term, occurrence } };
  }

  /**
   * Categoria e rótulo para exibir (atalho para a interface).
   * @param {string} id - Id da categoria.
   * @returns {Object|undefined}
   */
  category(id) {
    return categoryInfo(id);
  }

  /**
   * Dados vazios, usados quando o livro ainda não tem nada salvo.
   * @returns {Object}
   */
  static empty() {
    return EMPTY;
  }
}
