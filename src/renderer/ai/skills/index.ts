/**
 * @file Catálogo de skills: pacotes de instruções (texto + metadados) que a IA executa usando as tools.
 *
 * - **do app** (`./*.md`): vêm instaladas e não podem ser excluídas (só editadas, o que cria uma cópia "editada");
 * - **catálogo** (`./market/*.md`): o "loja" offline do app; o usuário inclui na biblioteca as que quiser.
 *
 * O frontmatter de cada arquivo traz `name` (identificador), `title`, `description`, `author`, `version`, `kind`
 * (`once` ou `recurring`), `triggers`, `tools`, `tags`, `details` (descrição completa em Markdown) e `tokens`
 * (`bookTokens` e `spent`: tamanho do livro do teste do autor e tokens gastos nele, para estimar o custo). O corpo é o
 * texto das instruções. O nome e a descrição das skills instaladas entram no prompt do sistema; o corpo só é enviado
 * quando a IA chama `load_skill`.
 */

import { parseMarkdown } from "../../utils/markdown.js";
import { tagColorIndex } from "../../../shared/tags.js";

/**
 * Cor sugerida para uma skill, calculada do nome (sempre a mesma), com o mesmo método das cores das tags.
 * @param {string} key - Identificador ou nome da skill.
 * @returns {string} Cor `#rrggbb`.
 */
export function autoSkillColor(key) {
  const i = tagColorIndex(String(key || "skill"));
  const h = (4 + 9 * i) % 360;
  const sat = [68, 82, 54][i % 3] / 100;
  const l = 0.48;
  const a = sat * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const rawBuiltin = import.meta.glob("./*.md", { query: "?raw", import: "default", eager: true });
const rawMarket = import.meta.glob("./market/*.md", { query: "?raw", import: "default", eager: true });

/**
 * Converte o texto de um arquivo de skill no objeto da skill.
 * @param {string} raw - Conteúdo do arquivo.
 * @param {string} origin - `builtin`, `market` ou `user`.
 * @returns {Object|null}
 */
export function parseSkill(raw, origin) {
  const { metadata: m, body } = parseMarkdown(raw);
  if (!m.name) return null;
  const list = (v) => (Array.isArray(v) ? v.map(String) : []);
  return {
    slug: String(m.name),
    id: String(m.id || m.name),
    title: String(m.title || m.name),
    description: String(m.description || ""),
    details: String(m.details || ""),
    author: String(m.author || "Desconhecido"),
    version: String(m.version || "1.0.0"),
    kind: m.kind === "recurring" ? "recurring" : "once",
    triggers: list(m.triggers),
    tools: list(m.tools),
    tags: list(m.tags),
    tokens: m.tokens && typeof m.tokens === "object" ? { bookTokens: Number(m.tokens.bookTokens) || 0, spent: Number(m.tokens.spent) || 0 } : null,
    // Otimizar as instruções quando o perfil de uso pede (desligue em skills com amostras de escrita ou textos exatos)
    compact: m.compact !== false,
    // Nativa: já vem instalada e o sistema depende dela (não pode ser removida; pode ser editada, com aviso)
    native: m.native === true,
    // Permite que a IA pesquise na internet (busca nativa do provedor, onde existir)
    web: m.web === true,
    // Informações que a skill pede ao autor antes de executar (uma pergunta por item; janela com um campo para cada)
    // Itens com ": " no meio, sem aspas, viram objeto no YAML: junta de volta em texto
    inputs: (Array.isArray(m.inputs) ? m.inputs : []).map((q) => (q && typeof q === "object" ? Object.entries(q).map(([k, v]) => `${k}: ${v}`).join(" ") : String(q))).filter(Boolean),
    // Modos do livro em que os gatilhos automáticos valem (vazio = todos); execução manual e pedida pela IA sempre podem
    modes: list(m.modes),
    edited: m.edited === true,
    sourceSlug: m.sourceSlug ? String(m.sourceSlug) : null,
    origin: m.origin ? String(m.origin) : origin,
    body: body.trim(),
  };
}

/** Skills que vêm com o app (instaladas). @type {Map<string, Object>} */
const builtin = new Map();
for (const raw of Object.values(rawBuiltin)) {
  const skill = parseSkill(raw, "builtin");
  if (skill) builtin.set(skill.slug, skill);
}

/** Skills do catálogo (loja offline). @type {Map<string, Object>} */
const market = new Map();
for (const raw of Object.values(rawMarket)) {
  const skill = parseSkill(raw, "market");
  if (skill) market.set(skill.slug, skill);
}

/** Skills instaladas na biblioteca do usuário (todas as que a IA enxerga), pelo nome. */
let library = new Map();

/**
 * Define as skills da biblioteca (chamado pelo SkillService ao carregar e a cada mudança).
 * @param {Array<Object>} list - Skills instaladas (já com a escolha entre original e cópia editada).
 * @returns {void}
 */
export function setCustomSkills(list) {
  library = new Map(list.map((s) => [s.slug, s]));
}

/** @returns {Object[]} Skills que vêm com o app. */
export function builtinSkills() {
  return [...builtin.values()];
}

/** @returns {Object[]} Skills do catálogo. */
export function marketSkills() {
  return [...market.values()];
}

/**
 * Nomes das skills que já vêm com o app.
 * @returns {string[]}
 */
export function builtinSkillNames() {
  return [...builtin.keys()];
}

/**
 * Lista as skills disponíveis para a IA (sem o corpo): as instaladas na biblioteca.
 * @returns {Array<{name: string, description: string, custom?: boolean}>}
 */
export function listSkills() {
  const names = new Set([...(library.size ? [] : builtin.keys())]);
  const out = [];
  for (const s of library.values()) {
    out.push({ name: s.slug, description: s.description, custom: s.origin !== "builtin" });
    names.add(s.slug);
  }
  // Antes da biblioteca carregar, valem as do app
  for (const s of builtin.values()) if (!library.has(s.slug) && !library.size) out.push({ name: s.slug, description: s.description });
  return out;
}

/**
 * Obtém uma skill pelo nome (a instalada; antes da biblioteca carregar, a do app).
 * @param {string} name - Nome (identificador).
 * @returns {Object|undefined}
 */
export function getSkill(name) {
  return library.get(name) || (library.size ? undefined : builtin.get(name));
}
