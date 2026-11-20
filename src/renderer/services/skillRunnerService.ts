// @ts-nocheck
/**
 * @file Execução de skills: manual ("executar agora"), por gatilho (skills recorrentes) ou a pedido da IA. Toda execução
 * respeita a permissão: cada skill tem "pedir permissão antes de ativar" (ligado por padrão) e há a opção geral "todas as
 * skills pedem permissão" (obrigatória nos perfis Mínimo e Econômico). A janela de permissão mostra o que a skill pode
 * fazer e a estimativa de tokens. As execuções são feitas uma de cada vez, e os gatilhos nunca disparam durante uma
 * execução (uma skill não dispara outra, nem a si mesma).
 */

import { compactInstructions } from "../ai/compact.js";
import { resolveAnalysis } from "../ai/profiles.js";
import { uiBus } from "../events/uiBus.js";
import { domainBus } from "../events/domainBus.js";
import { escapeHtml as esc } from "../utils/helpers.js";
import { TRIGGERS } from "./skillService.js";

/** Tempo sem gatilhos depois de uma execução (as gravações da própria skill também geram eventos). */
const COOLDOWN_MS = 4000;

/**
 * Tipo de arquivo (para os gatilhos de ficha) a partir do caminho.
 * @param {string} path - Caminho (absoluto ou relativo ao livro).
 * @returns {string}
 */
export function fileTypeOf(path) {
  const p = String(path || "").replace(/\\/g, "/");
  if (/content\/chapter_\d+\//i.test(p)) return "chapter";
  if (/assets\/characters\//i.test(p)) return "character";
  if (/assets\/places\//i.test(p)) return "place";
  if (/assets\/elements\//i.test(p)) return "element";
  if (/assets\/events\//i.test(p)) return "event";
  if (/(^|\/)notes\//i.test(p)) return "note";
  return "file";
}

/**
 * Serviço de execução de skills.
 * @class
 */
export class SkillRunnerService {
  /**
   * @param {Object} services - Serviços (skills, ai).
   * @param {Object} state - Estado global.
   */
  constructor(services, state) {
    this.services = services;
    this.state = state;
    /** Fila de execuções (uma por vez). */
    this.queue = Promise.resolve();
    this.active = null;
    this.lastEnd = 0;
    /** Execuções pedidas pela IA no meio de uma resposta: rodam quando ela termina. */
    this.pending = [];
    this.recent = new Map();
  }

  /** Liga os gatilhos aos eventos do app. @returns {void} */
  init() {
    const fire = (id, payload) => this.fire(id, payload);
    uiBus.on("book:changed", () => fire("book-open", {}));
    uiBus.on("sync:completed", (p) => fire("sync", p));
    uiBus.on("file:opened", (p) => fire("file-open", { path: p?.relativePath || p?.fullPath }));
    uiBus.on("analysis:changed", () => fire("analysis-done", {}));
    uiBus.on("export:file", () => fire("export", {}));
    // Salvamento automático do rascunho: um aviso por arquivo a cada 60 s
    uiBus.on("temp-file:saved", (path) => fire("file-save", { path: String(path) }, 60_000));
    // Fichas e capítulos
    domainBus.on("file:created", (p) => this.fireFile("created", p));
    domainBus.on("chapter:created", (p) => this.fireFile("created", { ...p, relativePath: `content/${p.folderName}/2_draft.md` }));
    domainBus.on("file:deleted", (p) => this.fireFile("deleted", p));
    domainBus.on("chapter:deleted", (p) => this.fireFile("deleted", { ...p, relativePath: `content/${p.folderName}/2_draft.md` }));
    uiBus.on("temp-file:synced", (path) => this.fireFile("updated", { path: String(path?.filePath || path) }));
    // A IA terminou a resposta: as skills que ela pediu para rodar entram em fila
    domainBus.on("ai:turn-finished", () => this.flushPending());
  }

  /**
   * Dispara os gatilhos de ficha (criada, atualizada, excluída) para o tipo do arquivo e para "qualquer arquivo".
   * @param {"created"|"updated"|"deleted"} when - Momento.
   * @param {Object} payload - Dados do evento (caminho).
   * @returns {void}
   */
  fireFile(when, payload) {
    const path = payload?.relativePath || payload?.path || "";
    const type = fileTypeOf(path);
    if (/(^|\/)(index|template|timeline)\.md/i.test(path) || /\.system\//.test(path)) return;
    this.fire(`${when}:${type}`, { path, title: payload?.title });
    if (type !== "file") this.fire(`${when}:file`, { path, title: payload?.title });
  }

  /**
   * Um gatilho disparou: pede a execução das skills recorrentes ativas que o usam.
   * @param {string} id - Gatilho.
   * @param {Object} payload - Dados do evento.
   * @param {number} [dedupeMs=8000] - Ignora o mesmo gatilho/arquivo repetido dentro deste tempo.
   * @returns {void}
   */
  fire(id, payload = {}, dedupeMs = 8000) {
    if (!this.state.currentBookPath && id !== "app-start") return;
    if (this.active || Date.now() - this.lastEnd < COOLDOWN_MS) return;
    const key = `${id}|${payload.path || ""}`;
    const now = Date.now();
    if (now - (this.recent.get(key) || 0) < dedupeMs) return;
    const matching = this.services.skills.installed().filter((s) => s.kind === "recurring" && s.enabled && s.triggers.includes(id));
    if (!matching.length) return;
    this.recent.set(key, now);
    for (const skill of matching) this.request(skill, { trigger: id, payload });
  }

  /**
   * Pede a execução de uma skill (entra na fila; pede permissão se for o caso).
   * @param {Object} skill - Skill.
   * @param {{trigger?: string, payload?: Object, manual?: boolean, byAi?: boolean}} [options] - Origem da execução.
   * @returns {Promise<{ran: boolean, ok?: boolean, text?: string, tokens?: number}>}
   */
  request(skill, options = {}) {
    const job = async () => {
      const { value: askAlways } = this.services.skills.askAlways();
      const mustAsk = options.manual === true ? true : askAlways || skill.askBefore;
      if (mustAsk && !(await this.confirm(skill, options))) return { ran: false };
      return this.run(skill, options);
    };
    const result = this.queue.then(job, job);
    this.queue = result.catch(() => {});
    return result;
  }

  /**
   * Pedido da IA durante a resposta: a skill só é executada (com a permissão do autor) quando a IA termina de responder.
   * @param {Object} skill - Skill.
   * @returns {void}
   */
  requestFromAi(skill) {
    if (!this.pending.some((s) => s.slug === skill.slug)) this.pending.push(skill);
  }

  /** Executa as skills que a IA pediu. @returns {void} */
  flushPending() {
    const list = this.pending.splice(0);
    // Skills recorrentes que o autor configurou para rodar sozinhas não pedem permissão de novo
    for (const skill of list) this.request(skill, { trigger: "ai", byAi: true, manual: !(skill.kind === "recurring" && skill.enabled && !skill.askBefore) });
  }

  /**
   * Janela de permissão (com a estimativa de tokens).
   * @param {Object} skill - Skill.
   * @param {Object} options - Origem da execução.
   * @returns {Promise<boolean>}
   * @private
   */
  async confirm(skill, options) {
    const bookTokens = await this.services.skills.bookTokens();
    const { tokens, basis } = this.services.skills.estimate(skill, bookTokens);
    const trigger = options.trigger && TRIGGERS.get(options.trigger);
    const from = options.byAi ? "A IA pediu para executar esta skill." : trigger ? `Ela foi disparada por: <strong>${esc(trigger.label)}</strong>.` : "Você pediu para executá-la.";
    const edits = skill.tools.some((t) => /write|replace|append|create|delete|move|set_|update_|restore|auto_link|resolve|register/.test(t));
    return new Promise((resolve) => {
      uiBus.emit("modal:open", {
        id: `skill-confirm-${Date.now()}`,
        title: `Executar a skill “${skill.title}”?`,
        content: `<div class="cn-confirm">
          <p>${from}</p>
          <p>${esc(skill.description)}</p>
          <p><strong>Ela pode usar:</strong> ${skill.tools.length ? skill.tools.map((t) => `<code>${esc(t)}</code>`).join(", ") : "nenhuma tool (só conversa)"}.</p>
          ${edits ? "<p><strong>Atenção:</strong> esta skill pode <strong>modificar arquivos do seu livro</strong>. As alterações passam pela sua revisão (ou são gravadas direto no modo autônomo) e ficam no changelog para desfazer.</p>" : ""}
          ${skill.origin === "market" ? "<p><strong>Esta skill veio do catálogo.</strong> Execute apenas se você confia na fonte.</p>" : ""}
          <p><strong>Custo estimado:</strong> ${tokens ? `cerca de <strong>${tokens.toLocaleString("pt-BR")} tokens</strong> (${esc(basis)}; o livro tem ~${bookTokens.toLocaleString("pt-BR")} tokens).` : "sem estimativa ainda (será calculada depois da primeira execução)."} Os tokens são cobrados pelo seu provedor de IA.</p>
        </div>`,
        onClose: () => resolve(false),
        buttons: [
          { text: "Cancelar", class: "btn-secondary", onClick: (modal) => (resolve(false), modal.close()) },
          { text: "Executar", class: "btn-primary", onClick: (modal) => (resolve(true), modal.close()) },
        ],
      });
    });
  }

  /**
   * Executa a skill agora (sem perguntar): manda as instruções à IA com as tools permitidas e registra o resultado.
   * @param {Object} skill - Skill.
   * @param {Object} options - Origem da execução.
   * @returns {Promise<{ran: boolean, ok: boolean, text?: string, tokens?: number}>}
   */
  async run(skill, options = {}) {
    const ai = this.services.ai;
    const skills = this.services.skills;
    const bookTokens = await skills.bookTokens();
    this.active = skill.slug;
    uiBus.emit("chat:system-notice", { text: `Executando a skill “${skill.title}”…` });
    const trigger = options.trigger && TRIGGERS.get(options.trigger);
    const context = [
      trigger ? `Gatilho: ${trigger.label}.` : "Execução pedida pelo autor.",
      options.payload?.path ? `Arquivo: ${options.payload.path}.` : "",
      this.state.currentFilePath ? `Arquivo aberto no editor: ${String(this.state.currentFilePath).replace(/\.temp$/, "")}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const prompt = `Execute agora a skill “${skill.title}” seguindo as instruções abaixo ao pé da letra. Use somente as tools disponíveis. ${context}\n\n# Instruções da skill\n\n${resolveAnalysis(this.state.aiSettings?.analysis).compact ? compactInstructions(skill.body) : skill.body}`;
    try {
      const profile = this.state.aiSettings?.analysis;
      if (profile?.chatOnly) throw new Error("O modo “apenas conversa” está ligado: desligue-o para executar skills.");
      const { text, tokens } = await ai.sendMessage({ prompt, history: [], skill });
      skills.recordRun(skill.slug, { ok: true, tokens, trigger: options.trigger || "manual", bookTokens });
      uiBus.emit("chat:system-notice", { text: `Skill “${skill.title}” concluída (${tokens.toLocaleString("pt-BR")} tokens).${text ? ` ${String(text).slice(0, 280)}` : ""}` });
      return { ran: true, ok: true, text, tokens };
    } catch (error) {
      skills.recordRun(skill.slug, { ok: false, tokens: 0, trigger: options.trigger || "manual", bookTokens, error: String(error.message || error).slice(0, 200) });
      uiBus.emit("chat:system-notice", { text: `A skill “${skill.title}” falhou: ${error.message || error}` });
      return { ran: true, ok: false };
    } finally {
      this.active = null;
      this.lastEnd = Date.now();
    }
  }
}
