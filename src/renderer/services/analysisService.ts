// @ts-nocheck
/**
 * @file Análise do livro pela IA, pensada para gastar poucos tokens:
 *
 * 1. **Digest por arquivo**: a IA lê cada arquivo atualizado uma única vez e grava um arquivo-sombra de metadados em
 *    `.system/digests/` (resumo, entidades, fatos e eventos). Arquivo inalterado (mesmo hash) nunca é reanalisado.
 * 2. **Candidatos sem IA**: o sistema cruza os fatos dos digests e acha onde o mesmo atributo da mesma entidade aparece com
 *    valores diferentes.
 * 3. **Verificação**: só os candidatos vão para a IA, com as citações curtas. Contradições confirmadas ou duvidosas viram
 *    issues na Central de Revisões. O resultado de cada verificação fica guardado para não ser perguntado de novo.
 *
 * A análise é oferecida ao sincronizar (arquivos novos só entram na análise depois de sincronizados) e sempre mostra a
 * estimativa de tokens antes de gastar.
 */

import { uiBus } from "../events/uiBus.js";
import { domainBus } from "../events/domainBus.js";
import { foldText, normalizePath } from "../utils/helpers.js";
import { sha1 } from "../utils/hash.js";
import { splitFrontmatter } from "../utils/markdown.js";
import { askModel } from "../ai/aiGateway.js";
import { getProviderInfo } from "../ai/providers/index.js";
import { resolveAnalysis } from "../ai/profiles.js";
import { DIGEST_DIR, readSystemJson, writeSystemJson } from "../review/reviewStore.js";
import {
  ALIGN_SYSTEM,
  alignPrompt,
  digestSystem,
  findStyleShifts,
  VERIFY_SYSTEM,
  digestPrompt,
  findCandidates,
  normalizeDigest,
  parseJsonLoose,
  verifyPrompt,
} from "../review/digest.js";

const STATE_FILE = `${DIGEST_DIR}/_state.json`;
/** Orçamento padrão de tokens por análise (estimado). */
export const DEFAULT_BUDGET = 80000;
/** Máximo de candidatos verificados por análise. */
const MAX_VERIFY = 12;
/** Arquivos que não entram na análise (estruturais ou gerados). */
const SKIP = [/(^|\/)(template|index)\.md$/i, /^assets\/events\/timeline\.md$/i, /^content\/chapter_\d+\/(1_outline|3_analysis)\.md$/i];

/**
 * Estimativa grosseira de tokens de um texto.
 * @param {number} chars - Quantidade de caracteres.
 * @returns {number}
 */
export function estimateTokens(chars) {
  return Math.ceil(chars / 3.6);
}

/**
 * Serviço de análise do livro.
 * @class
 */
export class AnalysisService {
  declare cancelled: any;

  declare changelog: any;
  declare fileService: any;
  declare issues: any;
  declare progress: any;
  declare running: any;
  declare state: any;

  /**
   * @param {Object} state - Estado global.
   * @param {import('./changelogService.js').ChangelogService} changelog - Changelog.
   * @param {import('./fileService.js').FileService} fileService - Arquivos.
   * @param {import('./issueService.js').IssueService} issues - Central de Revisões.
   */
  constructor(state, changelog, fileService, issues) {
    this.state = state;
    this.changelog = changelog;
    this.fileService = fileService;
    this.issues = issues;
    this.running = false;
    this.cancelled = false;
    /** Estado da última análise para a interface. */
    this.progress = null;
    uiBus.on("sync:completed", (payload) => this.offerAfterSync(payload));
  }

  /** @returns {string|null} Livro atual. */
  get book() {
    return this.state.currentBookPath ? normalizePath(this.state.currentBookPath).replace(/\/+$/, "") : null;
  }

  /**
   * Configurações da análise (salvas junto das de IA).
   * @returns {Object} Opções efetivas do perfil de uso da IA (ver `ai/profiles.ts`).
   */
  settings() {
    return resolveAnalysis(this.state.aiSettings?.analysis);
  }

  // ========== Digests ========== //

  /**
   * Estado persistido da análise.
   * @returns {Promise<{files: Object, verified: Object}>}
   * @private
   */
  async loadState() {
    const data = await readSystemJson(this.book, STATE_FILE, { files: {}, verified: {} });
    return { files: data.files || {}, verified: data.verified || {}, aligned: data.aligned || {} };
  }

  /**
   * Digest de um arquivo (ou null se ainda não foi analisado).
   * @param {string} rel - Caminho relativo ao livro.
   * @returns {Promise<Object|null>}
   */
  async getDigest(rel) {
    if (!this.book) return null;
    return readSystemJson(this.book, `${DIGEST_DIR}/${rel}.json`, null);
  }

  /**
   * Todos os digests do livro.
   * @returns {Promise<Object[]>}
   */
  async allDigests() {
    const state = await this.loadState();
    const out = [];
    for (const rel of Object.keys(state.files)) {
      const digest = await this.getDigest(rel);
      if (digest) out.push(digest);
    }
    return out;
  }

  /**
   * Arquivos que a IA pode analisar: `.md` oficiais (já sincronizados) com `aiRead` e fora da lista de exceções.
   * @returns {Promise<Array<{rel: string, path: string, title: string}>>}
   * @private
   */
  async eligibleFiles() {
    const tree = await window.electronAPI.getTree(this.book);
    const out = [];
    const walk = (node, prefix) => {
      for (const [key, file] of Object.entries(node?.files || {})) {
        const rel = `${prefix}${key}.md`;
        if (!/\.md(\.temp)?$/i.test(file.originalPath || "")) continue;
        if (SKIP.some((re) => re.test(rel))) continue;
        if (file.metadata?.aiRead !== true) continue;
        out.push({ rel, path: file.originalPath, title: file.metadata?.title || key, isTemp: file.isTemp });
      }
      for (const [name, sub] of Object.entries(node?.folders || {})) {
        if (!name.startsWith(".")) walk(sub, `${prefix}${name}/`);
      }
    };
    walk(tree, "");
    return out;
  }

  /**
   * Arquivos cujo digest está faltando ou desatualizado (hash do arquivo oficial mudou), com a estimativa de tokens.
   * @returns {Promise<{files: Array<{rel: string, title: string, chars: number, hash: string}>, tokens: number, total: number, analyzed: number}>}
   */
  async pending() {
    if (!this.book) return { files: [], tokens: 0, total: 0, analyzed: 0 };
    const state = await this.loadState();
    const eligible = await this.eligibleFiles();
    const files = [];
    let analyzed = 0;
    const options = this.settings();
    const wanted = { facts: options.facts, events: options.timeline, style: options.tone };

    for (const f of eligible) {
      const official = await window.electronAPI.readFile(f.path);
      if (official === null) continue; // arquivo novo (só rascunho): entra na análise depois de sincronizado
      const hash = await sha1(official);
      const entry = state.files[f.rel];
      // Digests antigos têm fatos e eventos; o que o perfil atual pede e o digest não tem exige reanalisar
      const have = entry?.caps || { facts: true, events: true, style: false };
      const missing = (wanted.facts && !have.facts) || (wanted.events && !have.events) || (wanted.style && /^content\/chapter_\d+\/2_draft\.md$/i.test(f.rel) && !have.style);
      if (entry?.hash === hash && !missing) {
        analyzed++;
        continue;
      }
      files.push({ rel: f.rel, title: f.title, chars: Math.min(official.length, 24000), hash });
    }
    // Overhead do prompt + saída estimada do JSON por arquivo
    const tokens = files.reduce((sum, f) => sum + estimateTokens(f.chars) + 500 + 700, 0);
    return { files, tokens, total: eligible.length, analyzed };
  }

  // ========== Execução ========== //

  /**
   * Pede para interromper a análise em andamento (termina o arquivo atual).
   * @returns {void}
   */
  cancel() {
    this.cancelled = true;
  }

  /**
   * Executa a análise: digests dos arquivos pendentes (respeitando o orçamento) e verificação dos candidatos a contradição.
   * @param {Object} [options]
   * @param {number} [options.budgetTokens] - Orçamento estimado (padrão: o configurado).
   * @returns {Promise<{digests: number, verified: number, issues: number, stoppedBy: string|null}>}
   */
  async run({ budgetTokens } = {}) {
    if (this.running) throw new Error("Já existe uma análise em andamento.");
    if (!this.book) throw new Error("Nenhum livro selecionado.");
    this.running = true;
    this.cancelled = false;
    const book = this.book;
    const budget = budgetTokens || this.settings().budgetTokens;
    const result = { digests: 0, verified: 0, issues: 0, stoppedBy: null };

    try {
      const { files } = await this.pending();
      const state = await this.loadState();
      let spent = 0;
      this.setProgress({ phase: "digest", done: 0, total: files.length });

      for (const f of files) {
        const cost = estimateTokens(f.chars) + 1200;
        if (spent + cost > budget && result.digests > 0) {
          result.stoppedBy = "budget";
          break;
        }
        if (this.cancelled) {
          result.stoppedBy = "cancelled";
          break;
        }
        try {
          await this.analyzeFile(f, state);
          result.digests++;
          spent += cost;
        } catch (error) {
          if (error.isRateLimit || error.status === 429) {
            result.stoppedBy = "rate-limit";
            this.notifyError(error);
            break;
          }
          console.error(`[ANALYSIS] Falha no digest de ${f.rel}:`, error);
          result.stoppedBy = "error";
          this.notifyError(error);
          break;
        }
        this.setProgress({ phase: "digest", done: result.digests, total: files.length, current: f.title });
        await writeSystemJson(book, STATE_FILE, state);
      }

      const opts = this.settings();
      if (opts.verify && opts.facts && result.digests > 0 && !result.stoppedBy) {
        const verified = await this.verifyCandidates(state, budget - spent);
        result.verified = verified.checked;
        result.issues = verified.issues;
      }
      if (!result.stoppedBy) {
        if (opts.tone) result.issues += await this.checkStyle();
        if (opts.synopsis) result.issues += await this.checkAlignment(state);
      }
      await writeSystemJson(book, STATE_FILE, state);

      if (result.digests > 0 || result.verified > 0) {
        await this.changelog?.recordReview(
          { kind: "analysis", count: result.digests, verified: result.verified, issues: result.issues },
          this.changelog.aiActor(),
        );
      }
    } finally {
      this.running = false;
      this.progress = null;
      domainBus.emit("analysis:changed", {});
      uiBus.emit("analysis:changed", {});
    }
    return result;
  }

  /**
   * Gera e grava o digest de um arquivo.
   * @param {{rel: string, title: string, hash: string}} f - Arquivo.
   * @param {{files: Object}} state - Estado da análise (atualizado).
   * @returns {Promise<void>}
   * @private
   */
  async analyzeFile(f, state) {
    const abs = `${this.book}/${f.rel}`;
    const content = await window.electronAPI.readFile(abs);
    if (content === null) return;
    const { body } = splitFrontmatter(content);
    const opts = this.settings();
    // O que a IA extrai de cada arquivo depende do perfil (cada parte a mais gasta tokens)
    const caps = { facts: opts.facts, events: opts.timeline, style: opts.tone && /^content\/chapter_\d+\/2_draft\.md$/i.test(f.rel) };
    const reply = await askModel(
      { system: digestSystem({ facts: caps.facts, events: caps.events, style: caps.style }), prompt: digestPrompt(f.rel, f.title, body), kind: "digest" },
      this.state,
    );
    const digest = normalizeDigest(parseJsonLoose(reply.text), body);
    if (!digest) throw new Error(`A IA não devolveu um digest válido para "${f.title}".`);

    const hash = await sha1(content);
    await writeSystemJson(this.book, `${DIGEST_DIR}/${f.rel}.json`, {
      version: 1,
      file: f.rel,
      hash,
      generatedAt: new Date().toISOString(),
      provider: reply.provider,
      model: reply.model,
      ...digest,
    });
    state.files[f.rel] = { hash, at: new Date().toISOString(), caps };
  }

  /**
   * Verifica com a IA os candidatos a contradição ainda não conferidos e registra os problemas na central.
   * @param {{files: Object, verified: Object}} state - Estado da análise (atualizado).
   * @param {number} budget - Tokens que ainda podem ser gastos.
   * @returns {Promise<{checked: number, issues: number}>}
   * @private
   */
  async verifyCandidates(state, budget) {
    const digests = await this.allDigests();
    const candidates = findCandidates(digests).filter((c) => !state.verified[c.key]);
    const perCheck = 700;
    const limit = Math.max(0, Math.min(MAX_VERIFY, Math.floor(budget / perCheck)));
    const todo = candidates.slice(0, limit);
    this.setProgress({ phase: "verify", done: 0, total: todo.length });

    const toRegister = [];
    let checked = 0;
    for (const candidate of todo) {
      if (this.cancelled) break;
      try {
        const reply = await askModel({ system: VERIFY_SYSTEM, prompt: verifyPrompt(candidate), kind: "verify" }, this.state);
        const verdict = parseJsonLoose(reply.text);
        const kind = ["conflict", "compatible", "unsure"].includes(verdict?.verdict) ? verdict.verdict : "unsure";
        state.verified[candidate.key] = { verdict: kind, at: new Date().toISOString() };
        checked++;
        if (kind !== "compatible") {
          const [first, ...others] = candidate.claims;
          toRegister.push({
            type: kind === "conflict" ? "fact-conflict" : "possible-conflict",
            severity: kind === "conflict" ? "error" : "warning",
            file: first.file,
            excerpt: first.quote || "",
            message: `${candidate.entity} · ${candidate.attribute}: ${candidate.claims.map((c) => `"${c.value}"`).join(" × ")}. ${String(verdict?.explanation || "").slice(0, 300)}`.trim(),
            related: others.map((c) => ({ file: c.file, excerpt: c.quote || "" })),
          });
        }
      } catch (error) {
        console.error("[ANALYSIS] Falha na verificação:", error);
        this.notifyError(error);
        break;
      }
      this.setProgress({ phase: "verify", done: checked, total: todo.length });
    }

    let issues = 0;
    if (toRegister.length > 0) {
      const res = await this.issues.register(toRegister, this.changelog.aiActor());
      issues = res.registered;
    }
    return { checked, issues };
  }

  /**
   * Procura, sem IA, capítulos que fogem do narrador ou do tempo verbal da maioria e registra sugestões.
   * @returns {Promise<number>} Quantas sugestões novas foram registradas.
   * @private
   */
  async checkStyle() {
    const shifts = findStyleShifts(await this.allDigests());
    if (shifts.length === 0) return 0;
    const items = shifts.map((s) => ({ type: "style-shift", severity: "warning", file: s.file, excerpt: "", message: s.message }));
    const res = await this.issues.register(items, this.changelog.systemActor());
    return res.registered;
  }

  /**
   * Compara com a IA os resumos dos capítulos com a sinopse (uma única chamada, refeita só se a sinopse ou algum resumo
   * mudou) e registra os capítulos que parecem fugir do objetivo do livro.
   * @param {{aligned: Object}} state - Estado da análise (atualizado).
   * @returns {Promise<number>} Quantos desvios novos foram registrados.
   * @private
   */
  async checkAlignment(state) {
    const synopsis = await window.electronAPI.readFile(`${this.book}/content/plot.md`);
    if (!synopsis) return 0;
    const { body } = splitFrontmatter(synopsis);
    const chapters = (await this.allDigests())
      .filter((d) => /^content\/chapter_\d+\//i.test(d.file) && d.summary)
      .map((d) => ({ file: d.file, summary: d.summary }));
    if (chapters.length === 0 || body.trim().length < 40) return 0;

    const key = await sha1(body + chapters.map((c) => `${c.file}:${c.summary}`).join("|"));
    if (state.aligned.key === key) return 0;

    this.setProgress({ phase: "verify", done: 0, total: 1 });
    try {
      const reply = await askModel({ system: ALIGN_SYSTEM, prompt: alignPrompt(body, chapters), kind: "alignment" }, this.state);
      const data = parseJsonLoose(reply.text);
      state.aligned = { key, at: new Date().toISOString() };
      const items = (Array.isArray(data?.issues) ? data.issues : [])
        .filter((i) => i?.file && i?.message && chapters.some((c) => c.file === i.file))
        .slice(0, 5)
        .map((i) => ({ type: "goal-drift", severity: "warning", file: i.file, excerpt: "", message: String(i.message).slice(0, 400) }));
      if (items.length === 0) return 0;
      const res = await this.issues.register(items, this.changelog.aiActor());
      return res.registered;
    } catch (error) {
      console.error("[ANALYSIS] Falha ao comparar com o objetivo do livro:", error);
      this.notifyError(error);
      return 0;
    }
  }

  /**
   * Atualiza o progresso exibido na interface.
   * @param {Object} progress - `{ phase, done, total, current? }`.
   * @returns {void}
   * @private
   */
  setProgress(progress) {
    this.progress = progress;
    uiBus.emit("analysis:progress", progress);
  }

  /**
   * Mostra o erro de uma chamada da análise ao autor.
   * @param {Error} error - Erro.
   * @returns {void}
   * @private
   */
  notifyError(error) {
    uiBus.emit("toast:show", { message: `Análise interrompida: ${error.message}`, type: "error" });
  }

  // ========== Depois de sincronizar ========== //

  /**
   * Depois de uma sincronização manual, oferece (ou executa, se configurado) a análise dos arquivos atualizados.
   * @param {Object} [payload] - `{ count }`.
   * @returns {Promise<void>}
   */
  async offerAfterSync() {
    if (!this.book || this.running || !this.settings().onSync) return;
    const aiReady = Boolean(this.state.aiSettings?.providers?.[this.state.aiProvider]?.apiKey) || !getProviderInfo(this.state.aiProvider)?.requiresKey;
    if (!aiReady) return;
    const pending = await this.pending();
    if (pending.files.length === 0) return;

    if (this.settings().autoAnalyze) {
      this.runWithToasts().catch(() => {});
      return;
    }
    const model = `${this.state.aiProvider} · ${this.state.aiSettings.providers[this.state.aiProvider]?.model || ""}`;
    uiBus.emit("modal:open", {
      id: "analysis-offer",
      title: "Analisar os arquivos atualizados?",
      content: `<div class="cn-confirm">
        <p>${pending.files.length} ${pending.files.length === 1 ? "arquivo foi sincronizado" : "arquivos foram sincronizados"} e ainda não passaram pela análise da IA (resumo de metadados e conferência de contradições).</p>
        <p>Custo estimado: <strong>~${pending.tokens.toLocaleString("pt-BR")} tokens</strong> com o modelo ${model}. Arquivos inalterados nunca são reanalisados.</p>
        <p>Você também pode analisar depois, na Central de Revisões.</p></div>`,
      buttons: [
        { text: "Depois", class: "btn-secondary" },
        {
          text: "Analisar agora",
          class: "btn-primary",
          onClick: async (modal) => {
            modal.close();
            this.runWithToasts().catch(() => {});
          },
        },
      ],
    });
  }

  /**
   * Executa a análise avisando o início e o fim por toasts.
   * @returns {Promise<Object>}
   */
  async runWithToasts() {
    uiBus.emit("toast:show", { message: "Análise da IA iniciada. Você pode continuar escrevendo.", type: "info" });
    const result = await this.run();
    const parts = [`${result.digests} arquivo(s) analisado(s)`];
    if (result.verified) parts.push(`${result.verified} verificação(ões)`);
    if (result.issues) parts.push(`${result.issues} pendência(s) nova(s)`);
    if (result.stoppedBy === "budget") parts.push("parou no orçamento de tokens; rode de novo para continuar");
    uiBus.emit("toast:show", { message: `Análise concluída: ${parts.join(", ")}.`, type: result.stoppedBy && result.stoppedBy !== "budget" ? "error" : "success" });
    return result;
  }

  // ========== Consultas (tools da IA) ========== //

  /**
   * Fatos dos digests, filtrados por entidade e/ou atributo.
   * @param {Object} filter
   * @param {string} [filter.entity] - Trecho do nome da entidade.
   * @param {string} [filter.attribute] - Trecho do atributo.
   * @returns {Promise<Object[]>}
   */
  async searchFacts({ entity, attribute } = {}) {
    const e = entity ? foldText(entity) : "";
    const a = attribute ? foldText(attribute) : "";
    const out = [];
    for (const digest of await this.allDigests()) {
      for (const fact of digest.facts || []) {
        if (e && !foldText(fact.entity).includes(e)) continue;
        if (a && !foldText(fact.attribute).includes(a)) continue;
        out.push({ file: digest.file, ...fact });
      }
    }
    return out;
  }
}
