// @ts-nocheck
/**
 * @file Biblioteca de skills do usuário. As skills são compartilhadas entre os livros (ficam na pasta de dados do app).
 * Cada skill é um texto de instruções com metadados (autor, versão, tags, gatilhos, tools permitidas), que a IA executa
 * usando as tools. A biblioteca junta as skills do app (sempre instaladas), as incluídas do catálogo (o "loja",
 * por enquanto offline) e as criadas pelo usuário.
 *
 * - Editar o **texto** de uma skill do app ou do catálogo cria uma cópia com ID novo e o selo "editado" (dá para restaurar);
 * - gatilhos, tools permitidas e "pedir permissão" são preferências do usuário e não mudam a skill;
 * - cada execução (sucesso ou falha, com os tokens usados) fica registrada, e a estimativa de tokens melhora a cada uso.
 */

import { uiBus } from "../events/uiBus.js";
import { normalizePath } from "../utils/helpers.js";
import { appSettings } from "../utils/appSettings.js";
import { stringifyFrontmatter } from "../utils/markdown.js";
import { autoSkillColor, builtinSkills, marketSkills, parseSkill, setCustomSkills } from "../ai/skills/index.js";

const NAME_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;

/**
 * Gatilhos: as ocasiões do app em que uma skill recorrente pode rodar sozinha.
 * Os de ficha existem em três momentos (criada, atualizada, excluída) para cada tipo de arquivo.
 */
export const FILE_TYPES = [
  { id: "chapter", label: "capítulo" },
  { id: "character", label: "personagem" },
  { id: "place", label: "ambiente" },
  { id: "element", label: "conceito/sistema" },
  { id: "event", label: "evento" },
  { id: "note", label: "anotação" },
  { id: "file", label: "qualquer arquivo" },
];
export const TRIGGER_GROUPS = [
  {
    group: "App e livro",
    triggers: [
      { id: "app-start", label: "Ao abrir o app" },
      { id: "book-open", label: "Ao abrir um livro" },
    ],
  },
  {
    group: "Escrita",
    triggers: [
      { id: "sync", label: "Ao sincronizar" },
      { id: "chapter-sync", label: "Ao sincronizar o manuscrito de um capítulo" },
      { id: "file-open", label: "Ao abrir um arquivo no editor" },
      { id: "file-save", label: "Ao salvar um arquivo (rascunho automático)" },
      { id: "export", label: "Ao exportar" },
      { id: "analysis-done", label: "Depois da análise do livro" },
    ],
  },
  ...[
    ["created", "Quando criado"],
    ["updated", "Quando atualizado (sincronizado)"],
    ["deleted", "Quando excluído"],
  ].map(([when, label]) => ({
    group: label.replace("Quando ", "Arquivos ").replace("criado", "criados").replace("atualizado (sincronizado)", "atualizados").replace("excluído", "excluídos"),
    triggers: FILE_TYPES.map((t) => ({ id: `${when}:${t.id}`, label: `${label}: ${t.label}` })),
  })),
];
/** Todos os gatilhos, por id. */
export const TRIGGERS = new Map(TRIGGER_GROUPS.flatMap((g) => g.triggers).map((t) => [t.id, t]));

/**
 * Serviço da biblioteca de skills.
 * @class
 */
export class SkillService {
  /**
   * @param {Object} state - Estado global.
   */
  constructor(state) {
    this.state = state;
    /** Arquivos do usuário (já lidos). @type {Array<Object>} */
    this.files = [];
    this.ready = this.load();
  }

  // ========== Carga ========== //

  /**
   * Lê as skills do usuário e atualiza o que a IA enxerga.
   * @returns {Promise<void>}
   */
  async load() {
    const raw = (await window.electronAPI.skills.list()) || [];
    this.files = raw
      .map(({ file, content }) => {
        const skill = parseSkill(content, "user");
        return skill ? { ...skill, file, content } : null;
      })
      .filter(Boolean);
    await this.migrateBookSkills();
    setCustomSkills(this.installed());
    uiBus.emit("skills:changed");
  }

  /**
   * Skills que o autor tinha criado dentro de um livro (`.system/skills/`) passam para a biblioteca, que vale para todos os livros.
   * @returns {Promise<void>}
   * @private
   */
  async migrateBookSkills() {
    const book = this.state?.currentBookPath ? normalizePath(this.state.currentBookPath).replace(/\/+$/, "") : null;
    if (!book) return;
    const dir = `${book}/.system/skills`;
    const entries = (await window.electronAPI.listDir(dir)) || [];
    for (const entry of entries) {
      if (entry.isDirectory || !/\.md$/i.test(entry.name)) continue;
      const raw = await window.electronAPI.readFile(`${dir}/${entry.name}`);
      const skill = raw ? parseSkill(raw, "user") : null;
      if (!skill || this.files.some((f) => f.slug === skill.slug) || builtinSkills().some((b) => b.slug === skill.slug)) continue;
      await this.writeFile({ ...skill, id: `u-${skill.slug}`, origin: "user", author: skill.author === "Desconhecido" ? "Você" : skill.author });
      // A cópia antiga do livro deixa de ser a referência
      await window.electronAPI.deleteFile(`${dir}/${entry.name}`);
    }
  }

  // ========== Consulta ========== //

  /**
   * Skills instaladas (as do app, as incluídas do catálogo e as do usuário), cada uma já com a versão em uso (a copia
   * editada, se houver) e as preferências do usuário aplicadas.
   * @returns {Array<Object>}
   */
  installed() {
    const slugs = new Set([...builtinSkills().map((s) => s.slug), ...this.files.map((f) => f.slug)]);
    const out = [];
    for (const slug of slugs) {
      const base = builtinSkills().find((s) => s.slug === slug);
      const mine = this.files.filter((f) => f.slug === slug);
      const edited = mine.find((f) => f.edited);
      const own = mine.find((f) => !f.edited);
      const effective = edited || own || base;
      if (!effective) continue;
      const prefs = this.prefs(slug);
      out.push({
        ...effective,
        triggers: prefs.triggers ?? effective.triggers,
        tools: prefs.tools ?? effective.tools,
        askBefore: prefs.askBefore ?? true,
        enabled: prefs.enabled ?? true,
        color: prefs.color || autoSkillColor(slug),
        compact: prefs.compact ?? effective.compact !== false,
        web: prefs.web ?? effective.web === true,
        // Segue o original/catálogo quando o texto foi editado: base para "restaurar" e para comparar versões
        original: base || own || null,
        hasEditedCopy: Boolean(edited),
        removable: !base,
      });
    }
    return out.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  }

  /**
   * Skill instalada por identificador.
   * @param {string} slug - Identificador.
   * @returns {Object|undefined}
   */
  get(slug) {
    return this.installed().find((s) => s.slug === slug);
  }

  /**
   * Catálogo (loja) com o estado de instalação de cada skill.
   * @returns {Array<Object>}
   */
  market() {
    const installed = this.installed();
    return marketSkills().map((m) => {
      const mine = installed.find((s) => s.slug === m.slug);
      return { ...m, color: this.prefs(m.slug).color || autoSkillColor(m.slug), installed: Boolean(mine), hasUpdate: Boolean(mine && mine.origin === "market" && compareVersions(m.version, mine.version) > 0) };
    });
  }

  // ========== Preferências ========== //

  /**
   * Preferências do usuário de uma skill.
   * @param {string} slug - Identificador.
   * @returns {{triggers?: string[], tools?: string[], askBefore?: boolean, enabled?: boolean}}
   */
  prefs(slug) {
    return (appSettings.get("skills.prefs") || {})[slug] || {};
  }

  /**
   * Altera preferências de uma skill (gatilhos, tools, permissão, ativa).
   * @param {string} slug - Identificador.
   * @param {Object} patch - Campos a alterar.
   * @returns {void}
   */
  setPrefs(slug, patch) {
    const all = { ...(appSettings.get("skills.prefs") || {}) };
    all[slug] = { ...(all[slug] || {}), ...patch };
    appSettings.set("skills.prefs", all);
    setCustomSkills(this.installed());
    uiBus.emit("skills:changed");
  }

  /**
   * Todas as skills pedem permissão? (opção geral, ou obrigatório nos perfis Mínimo e Econômico; ao voltar para outro
   * perfil, vale de novo o que o usuário tinha escolhido).
   * @returns {{value: boolean, forced: boolean}}
   */
  askAlways() {
    const profile = this.state?.aiSettings?.analysis?.profile;
    const forced = profile === "minimal" || profile === "economic";
    return { value: forced || Boolean(appSettings.get("skills.askAlways")), forced };
  }

  // ========== Estatísticas e estimativa ========== //

  /**
   * Execuções registradas de uma skill.
   * @param {string} slug - Identificador.
   * @returns {Array<{at: string, ok: boolean, tokens: number, trigger: string, bookTokens: number, error?: string}>}
   */
  runs(slug) {
    return ((appSettings.get("skills.stats") || {})[slug]?.runs || []).slice().reverse();
  }

  /**
   * Total de tokens gastos por uma skill (ou por todas).
   * @param {string} [slug] - Identificador (omitido: todas).
   * @returns {number}
   */
  totalTokens(slug) {
    const stats = appSettings.get("skills.stats") || {};
    return Object.entries(stats)
      .filter(([s]) => !slug || s === slug)
      .reduce((sum, [, v]) => sum + (v.runs || []).reduce((n, r) => n + (r.tokens || 0), 0), 0);
  }

  /**
   * Registra uma execução.
   * @param {string} slug - Identificador.
   * @param {{ok: boolean, tokens: number, trigger: string, bookTokens: number, error?: string}} run - Dados da execução.
   * @returns {void}
   */
  recordRun(slug, run) {
    const all = { ...(appSettings.get("skills.stats") || {}) };
    const runs = [...(all[slug]?.runs || []), { at: new Date().toISOString(), ...run }].slice(-100);
    all[slug] = { runs };
    appSettings.set("skills.stats", all);
    uiBus.emit("skills:changed");
  }

  /**
   * Estimativa de tokens de uma execução neste livro. Com execuções suas bem-sucedidas, usa a média do seu gasto por token de
   * livro; sem elas, usa a proporção medida pelo autor da skill (livro de teste × tokens gastos).
   * @param {Object} skill - Skill.
   * @param {number} bookTokens - Tamanho do livro atual em tokens.
   * @returns {{tokens: number, basis: "suas execuções"|"o teste do autor"|null}}
   */
  estimate(skill, bookTokens) {
    const mine = this.runs(skill.slug).filter((r) => r.ok && r.tokens > 0 && r.bookTokens > 0);
    if (mine.length) {
      const ratio = mine.reduce((s, r) => s + r.tokens / r.bookTokens, 0) / mine.length;
      return { tokens: Math.round(ratio * bookTokens), basis: "suas execuções" };
    }
    if (skill.tokens?.bookTokens > 0 && skill.tokens?.spent > 0) {
      return { tokens: Math.round((skill.tokens.spent / skill.tokens.bookTokens) * bookTokens), basis: "o teste do autor" };
    }
    return { tokens: 0, basis: null };
  }

  /**
   * Tamanho aproximado do livro atual em tokens (todo o texto do livro, sem o histórico e os registros).
   * @returns {Promise<number>}
   */
  async bookTokens() {
    if (!this.state?.currentBookPath) return 0;
    const stats = await window.electronAPI.bookDiskStats(normalizePath(this.state.currentBookPath));
    return Math.round((stats?.bytes || 0) / 3.8);
  }

  // ========== Alterações ========== //

  /**
   * Grava o arquivo de uma skill do usuário.
   * @param {Object} skill - Skill (com `id`).
   * @returns {Promise<void>}
   * @private
   */
  async writeFile(skill) {
    const front = {
      id: skill.id,
      name: skill.slug,
      title: skill.title,
      description: skill.description,
      details: skill.details,
      author: skill.author,
      version: skill.version,
      kind: skill.kind,
      triggers: skill.triggers,
      tools: skill.tools,
      tags: skill.tags,
      tokens: skill.tokens || undefined,
      origin: skill.origin,
      edited: skill.edited || undefined,
      sourceSlug: skill.sourceSlug || undefined,
      compact: skill.compact === false ? false : undefined,
      native: skill.native ? true : undefined,
      web: skill.web ? true : undefined,
      inputs: skill.inputs?.length ? skill.inputs : undefined,
      modes: skill.modes?.length ? skill.modes : undefined,
    };
    const content = stringifyFrontmatter(front, `${String(skill.body).trim()}\n`);
    const file = `${skill.id}.md`;
    const result = await window.electronAPI.skills.save(file, content);
    if (!result?.success) throw new Error(result?.error || "Falha ao salvar a skill.");
  }

  /**
   * Inclui uma skill do catálogo na biblioteca.
   * @param {string} slug - Identificador.
   * @returns {Promise<void>}
   */
  async install(slug) {
    const entry = marketSkills().find((s) => s.slug === slug);
    if (!entry) throw new Error("Skill não encontrada no catálogo.");
    await this.writeFile({ ...entry, id: `m-${slug}`, origin: "market" });
    await this.load();
  }

  /**
   * Atualiza uma skill do catálogo para a versão mais recente (mantém as suas preferências e o histórico de execuções).
   * @param {string} slug - Identificador.
   * @returns {Promise<void>}
   */
  async update(slug) {
    await this.install(slug);
  }

  /**
   * Cria ou salva uma skill. Skill criada pelo usuário é regravada normalmente; editar o texto de uma skill do app ou do
   * catálogo cria uma cópia com ID novo, marcada como "editada".
   * @param {Object} input - Dados da skill (`slug`, `title`, `description`, `details`, `body`, `kind`, `tags`, `triggers`, `tools`).
   * @param {{slug?: string}} [options] - `slug`: skill em edição.
   * @returns {Promise<string>} Identificador da skill.
   */
  async save(input, { slug } = {}) {
    const name = String(input.slug || slug || "").trim().toLowerCase();
    if (!NAME_RE.test(name)) throw new Error("O nome da skill deve ter de 3 a 40 caracteres: letras minúsculas, números e hífens (ex.: revisar-dialogos).");
    if (!String(input.description || "").trim()) throw new Error("Descreva quando a IA deve usar esta skill.");
    if (!String(input.body || "").trim()) throw new Error("Escreva as instruções da skill.");
    const base = {
      slug: name,
      title: String(input.title || name).trim(),
      description: String(input.description).trim(),
      details: String(input.details || "").trim(),
      body: String(input.body).trim(),
      kind: input.kind === "recurring" ? "recurring" : "once",
      tags: (input.tags || []).map(String),
      inputs: (input.inputs || []).map((q) => String(q).trim()).filter(Boolean),
      triggers: input.triggers || [],
      tools: input.tools || [],
      tokens: null,
    };

    if (slug) {
      const current = this.get(slug);
      if (!current) throw new Error("Skill não encontrada.");
      // Skill do app ou do catálogo: o texto editado vira uma cópia com ID novo
      if (current.origin === "builtin" || current.origin === "market" || current.hasEditedCopy) {
        const existing = this.files.find((f) => f.slug === slug && f.edited);
        const id = existing?.id || `e-${slug}-${Date.now().toString(36)}`;
        await this.writeFile({ ...current, ...base, id, origin: current.origin === "market" ? "market" : "builtin", edited: true, sourceSlug: slug, author: current.author, version: current.version, tokens: current.tokens });
      } else {
        await this.writeFile({ ...current, ...base, id: current.id, origin: "user" });
      }
    } else {
      if (this.get(name)) throw new Error("Já existe uma skill com esse nome.");
      await this.writeFile({ ...base, id: `u-${name}`, origin: "user", author: "Você", version: "1.0.0", edited: false, sourceSlug: null });
    }
    await this.load();
    return name;
  }

  /**
   * Volta uma skill editada ao texto original (descarta a cópia editada).
   * @param {string} slug - Identificador.
   * @returns {Promise<void>}
   */
  async restore(slug) {
    for (const f of this.files.filter((x) => x.slug === slug && x.edited)) await window.electronAPI.skills.delete(f.file);
    await this.load();
  }

  /**
   * Remove da biblioteca uma skill do usuário ou do catálogo (as do app não saem).
   * @param {string} slug - Identificador.
   * @returns {Promise<void>}
   */
  async remove(slug) {
    for (const f of this.files.filter((x) => x.slug === slug)) await window.electronAPI.skills.delete(f.file);
    await this.load();
  }
}

/**
 * Compara versões `1.2.3`.
 * @param {string} a - Versão A.
 * @param {string} b - Versão B.
 * @returns {number}
 */
export function compareVersions(a, b) {
  const p = (v) => String(v || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const x = p(a);
  const y = p(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}
