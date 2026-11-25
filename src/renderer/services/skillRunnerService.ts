/**
 * @file Execução de skills: manual ("executar agora"), por gatilho (skills recorrentes) ou a pedido da IA. Toda execução
 * respeita a permissão: cada skill tem "pedir permissão antes de ativar" (ligado por padrão) e há a opção geral "todas as
 * skills pedem permissão" (obrigatória nos perfis Mínimo e Econômico). A janela de permissão mostra o que a skill pode
 * fazer e a estimativa de tokens. As execuções são feitas uma de cada vez, e os gatilhos nunca disparam durante uma
 * execução (uma skill não dispara outra, nem a si mesma).
 */

import { flattenBookTree } from "../utils/bookFiles.js";
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
  declare active: any;
  declare lastEnd: any;
  declare pending: any;
  declare queue: any;
  declare recent: any;
  declare services: any;
  declare state: any;

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
    const fire = (id, payload, _dedupeMs?: any) => this.fire(id, payload);
    uiBus.on("book:changed", () => fire("book-open", {}));
    uiBus.on("sync:completed", (p) => fire("sync", p));
    uiBus.on("file:opened", (p) => fire("file-open", { path: p?.relativePath || p?.fullPath }));
    uiBus.on("analysis:changed", () => fire("analysis-done", {}));
    uiBus.on("export:file", () => fire("export", {}));
    // Salvamento automático do rascunho: um aviso por arquivo a cada 60 s
    uiBus.on("temp-file:saved", (path) => fire("file-save", { path: String(path) }, 60_000));
    // Fichas e capítulos
    domainBus.on("file:created", (p) => this.fireFile("created", p));
    domainBus.on("chapter:created", (p: any) => this.fireFile("created", { ...p, relativePath: `content/${p.folderName}/2_draft.md` }));
    domainBus.on("file:deleted", (p) => this.fireFile("deleted", p));
    domainBus.on("chapter:deleted", (p: any) => this.fireFile("deleted", { ...p, relativePath: `content/${p.folderName}/2_draft.md` }));
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
    // Só o manuscrito do capítulo (2_draft.md): o gatilho que a maioria das skills quer (esboço e análise não disparam)
    if (when === "updated" && /chapter_\d+\/2_draft\.md$/i.test(path.replace(/\\/g, "/"))) this.fire("chapter-sync", { path, title: payload?.title });
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
  fire(id, payload: any = {}, dedupeMs = 8000) {
    if (!this.state.currentBookPath && id !== "app-start") return;
    if (this.active || Date.now() - this.lastEnd < COOLDOWN_MS) return;
    const key = `${id}|${payload.path || ""}`;
    const now = Date.now();
    if (now - (this.recent.get(key) || 0) < dedupeMs) return;
    const mode = this.state.currentBookMetadata?.ai_mode || "assistant";
    const matching = this.services.skills
      .installed()
      .filter((s) => s.kind === "recurring" && s.enabled && s.triggers.includes(id))
      // Skills ligadas a modos (ex.: só co-autor e autônomo) não disparam sozinhas nos outros modos
      .filter((s) => !s.modes?.length || s.modes.includes(mode))
      // Skill que pede informações ao autor não roda sozinha (não há como perguntar)
      .filter((s) => !s.inputs?.length);
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
  request(skill, options: any = {}) {
    const job = async () => {
      // Gatilho com arquivo: só roda se o arquivo mudou desde a última vez que esta skill rodou nele (ou se as diretrizes mudaram)
      if (options.trigger && options.payload?.path && !options.manual && !(await this.hasChanged(skill, options.payload.path))) {
        return { ran: false, skipped: true };
      }
      if (skill.inputs?.length) {
        const answers = await this.askInputs(skill);
        if (!answers) return { ran: false };
        options = { ...options, inputs: answers };
      }
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
  async run(skill, options: any = {}) {
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
    const unchanged = await this.unchangedFiles(skill);
    const given = (options.inputs || []).length
      ? `\n\n# Informações fornecidas pelo autor\n${options.inputs.map((a) => `- ${a.question}: ${a.answer}`).join("\n")}`
      : "";
    const fixed = unchanged.size
      ? " Arquivos marcados como (inalterado desde a última execução) NÃO devem ser relidos nem reanalisados, exceto se as instruções da skill disserem o contrário ou se for indispensável para atualizar outro arquivo."
      : "";
    const prompt = `Execute agora a skill “${skill.title}” seguindo as instruções abaixo ao pé da letra. Use somente as tools disponíveis. ${context}${options.extra ? ` ${options.extra}` : ""}${fixed}${given}\n\n# Instruções da skill\n\n${resolveAnalysis(this.state.aiSettings?.analysis).compact && skill.compact !== false ? compactInstructions(skill.body) : skill.body}`;
    try {
      const profile = this.state.aiSettings?.analysis;
      if (profile?.chatOnly) throw new Error("O modo “apenas conversa” está ligado: desligue-o para executar skills.");
      const { text, tokens, readFiles } = await ai.sendMessage({ prompt, history: [], skill, unchanged: [...unchanged], web: skill.web === true });
      skills.recordRun(skill.slug, { ok: true, tokens, trigger: options.trigger || "manual", bookTokens });
      if (options.trigger && options.payload?.path) await this.markDone(skill, options.payload.path);
      // Guarda o hash do que a skill leu: na próxima execução esses arquivos chegam marcados como inalterados
      await this.markMany(skill, readFiles || []);
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

  // ========== Controle de alterações (hash por arquivo) ========== //

  /** @returns {string} Pasta do livro aberto, sem barra final. @private */
  bookDir() {
    return String(this.state.currentBookPath || "").replace(/\\/g, "/").replace(/\/+$/, "");
  }

  /**
   * Caminho relativo ao livro de um caminho (absoluto ou relativo).
   * @param {string} path - Caminho.
   * @returns {string}
   * @private
   */
  relOf(path) {
    const p = String(path || "").replace(/\\/g, "/").replace(/\.temp$/, "");
    const root = this.bookDir();
    return p.toLowerCase().startsWith(`${root.toLowerCase()}/`) ? p.slice(root.length + 1) : p.replace(/^\/+/, "");
  }

  /**
   * Hash SHA-1 de um texto.
   * @param {string} text - Texto.
   * @returns {Promise<string>}
   * @private
   */
  async sha1(text) {
    const buffer = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(String(text ?? "")));
    return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Hash das "diretrizes" de uma skill neste livro: o texto e a versão da skill e a Sinopse (tom e regras do livro). Se
   * mudarem, os arquivos já processados precisam ser vistos de novo.
   * @param {Object} skill - Skill.
   * @returns {Promise<string>}
   * @private
   */
  async guidelineHash(skill) {
    const plot = (await window.electronAPI.readFile(`${this.bookDir()}/content/plot.md`)) || "";
    return this.sha1(`${skill.version}|${skill.body}|${plot}`);
  }

  /** @returns {Promise<Object>} Estado das skills do livro (`.system/skills-state.json`). @private */
  async loadState() {
    try {
      return JSON.parse((await window.electronAPI.readFile(`${this.bookDir()}/.system/skills-state.json`)) || "{}") || {};
    } catch {
      return {};
    }
  }

  /**
   * O arquivo mudou desde a última execução (bem-sucedida) desta skill nele?
   * @param {Object} skill - Skill.
   * @param {string} path - Arquivo.
   * @returns {Promise<boolean>}
   */
  async hasChanged(skill, path) {
    try {
      const rel = this.relOf(path);
      const content = await window.electronAPI.readFile(`${this.bookDir()}/${rel}`);
      if (content === null) return true;
      const state = (await this.loadState())[skill.slug];
      if (!state || state.guideline !== (await this.guidelineHash(skill))) return true;
      return state.files?.[rel] !== (await this.sha1(content));
    } catch {
      return true;
    }
  }

  /**
   * Guarda o hash do arquivo que a skill acabou de processar.
   * @param {Object} skill - Skill.
   * @param {string} path - Arquivo.
   * @returns {Promise<void>}
   */
  async markDone(skill, path) {
    try {
      const rel = this.relOf(path);
      const content = await window.electronAPI.readFile(`${this.bookDir()}/${rel}`);
      if (content === null) return;
      const all = await this.loadState();
      const guideline = await this.guidelineHash(skill);
      const current = all[skill.slug]?.guideline === guideline ? all[skill.slug] : { guideline, files: {} };
      current.files = { ...current.files, [rel]: await this.sha1(content) };
      all[skill.slug] = current;
      await window.electronAPI.saveFile(`${this.bookDir()}/.system/skills-state.json`, JSON.stringify(all, null, 2));
    } catch {
      // sem o registro, a skill só roda de novo na próxima alteração
    }
  }

  /**
   * Janela com uma pergunta (campo de texto) para cada informação que a skill pede ao autor.
   * @param {Object} skill - Skill.
   * @returns {Promise<Array<{question: string, answer: string}>|null>} Respostas, ou null se o autor cancelou.
   * @private
   */
  askInputs(skill) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (!done) {
          done = true;
          resolve(value);
        }
      };
      uiBus.emit("modal:open", {
        id: `skill-inputs-${Date.now()}`,
        title: `Informações para “${skill.title}”`,
        content: `<div class="cn-confirm cn-skill-inputs">
          <p>Esta skill precisa de algumas informações antes de executar. Preencha cada campo:</p>
          ${skill.inputs.map((q, i) => `<label class="cn-field"><span>${esc(q)}</span><textarea class="cn-textarea" data-skill-input="${i}" rows="${/amostra|trecho|exemplo|cole/i.test(q) ? 6 : 2}"></textarea></label>`).join("")}
        </div>`,
        onClose: () => finish(null),
        buttons: [
          { text: "Cancelar", class: "btn-secondary", onClick: (modal) => (finish(null), modal.close()) },
          {
            text: "Continuar",
            class: "btn-primary",
            onClick: (modal) => {
              const fields = [...document.querySelectorAll<HTMLInputElement>("[data-skill-input]")];
              const answers = skill.inputs.map((question, i) => ({ question, answer: (fields.find((f) => Number(f.dataset.skillInput) === i)?.value || "").trim() }));
              if (answers.some((a) => !a.answer)) {
                uiBus.emit("toast:show", { message: "Preencha todos os campos para continuar.", type: "error" });
                return;
              }
              finish(answers);
              modal.close();
            },
          },
        ],
      });
    });
  }

  /**
   * Arquivos do livro que não mudaram desde a última execução desta skill (para o mapa de arquivos e a instrução fixa).
   * @param {Object} skill - Skill.
   * @returns {Promise<Set<string>>} Caminhos relativos ao livro.
   */
  async unchangedFiles(skill) {
    const out = new Set();
    try {
      const book = this.bookDir();
      if (!book) return out;
      const state = (await this.loadState())[skill.slug];
      if (!state || state.guideline !== (await this.guidelineHash(skill))) return out;
      const tree = await window.electronAPI.getTree(book);
      for (const f of flattenBookTree(tree, book)) {
        if (!state.files?.[f.relPath]) continue;
        const content = await window.electronAPI.readFile(`${book}/${f.relPath}`);
        if (content !== null && state.files[f.relPath] === (await this.sha1(content))) out.add(f.relPath);
      }
    } catch {
      // sem o mapa de inalterados, a skill trata tudo como alterado
    }
    return out;
  }

  /**
   * Guarda o hash de vários arquivos que a skill acabou de ler.
   * @param {Object} skill - Skill.
   * @param {string[]} paths - Arquivos (relativos ao livro).
   * @returns {Promise<void>}
   */
  async markMany(skill, paths) {
    try {
      if (!paths.length) return;
      const all = await this.loadState();
      const guideline = await this.guidelineHash(skill);
      const current = all[skill.slug]?.guideline === guideline ? all[skill.slug] : { guideline, files: {} };
      for (const p of paths) {
        const rel = this.relOf(p);
        const content = await window.electronAPI.readFile(`${this.bookDir()}/${rel}`);
        if (content !== null) current.files[rel] = await this.sha1(content);
      }
      all[skill.slug] = current;
      await window.electronAPI.saveFile(`${this.bookDir()}/.system/skills-state.json`, JSON.stringify(all, null, 2));
    } catch {
      // sem o registro, tudo chega como alterado na próxima vez
    }
  }
}
