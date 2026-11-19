// @ts-nocheck
/**
 * @file Skills criadas pelo autor. Cada skill é um arquivo Markdown em `<livro>/.system/skills/<nome>.md` (frontmatter com
 * `name` e `description`, corpo com as instruções). A IA vê o nome e a descrição no prompt e carrega o corpo com `load_skill`.
 */

import { uiBus } from "../events/uiBus.js";
import { normalizePath } from "../utils/helpers.js";
import { parseMarkdown, stringifyFrontmatter } from "../utils/markdown.js";
import { builtinSkillNames, setCustomSkills } from "../ai/skills/index.js";

const SKILLS_DIR = ".system/skills";
const NAME_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;

/**
 * Serviço das skills do livro.
 * @class
 */
export class SkillService {
  /**
   * @param {Object} state - Estado global.
   */
  constructor(state) {
    this.state = state;
    uiBus.on("book:changed", () => this.load());
    uiBus.on("book:cleared", () => setCustomSkills([]));
  }

  /** @returns {string|null} Livro atual. */
  get book() {
    return this.state.currentBookPath ? normalizePath(this.state.currentBookPath).replace(/\/+$/, "") : null;
  }

  /**
   * Carrega as skills do livro atual para o registro usado pela IA.
   * @returns {Promise<Array<{name: string, description: string, body: string}>>}
   */
  async load() {
    if (!this.book) {
      setCustomSkills([]);
      return [];
    }
    const entries = (await window.electronAPI.listDir(`${this.book}/${SKILLS_DIR}`)) || [];
    const list = [];
    for (const entry of entries) {
      if (entry.isDirectory || !/\.md$/i.test(entry.name)) continue;
      const raw = await window.electronAPI.readFile(`${this.book}/${SKILLS_DIR}/${entry.name}`);
      if (!raw) continue;
      const { metadata, body } = parseMarkdown(raw);
      if (!metadata.name) continue;
      list.push({ name: String(metadata.name), description: String(metadata.description || ""), body: body.trim() });
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    setCustomSkills(list);
    this.cache = list;
    return list;
  }

  /**
   * Skills criadas pelo autor no livro atual.
   * @returns {Promise<Array<{name: string, description: string, body: string}>>}
   */
  async list() {
    return this.load();
  }

  /**
   * Cria ou atualiza uma skill.
   * @param {{name: string, description: string, body: string}} skill - Skill.
   * @returns {Promise<void>}
   * @throws {Error} Se o nome é inválido ou conflita com uma skill do app.
   */
  async save({ name, description, body }) {
    if (!this.book) throw new Error("Nenhum livro selecionado.");
    const slug = String(name || "").trim().toLowerCase();
    if (!NAME_RE.test(slug)) {
      throw new Error("O nome da skill deve ter de 3 a 40 caracteres: letras minúsculas, números e hífens (ex.: revisar-dialogos).");
    }
    if (builtinSkillNames().includes(slug)) throw new Error("Já existe uma skill do app com esse nome.");
    if (!String(description || "").trim()) throw new Error("Descreva quando a IA deve usar esta skill.");
    if (!String(body || "").trim()) throw new Error("Escreva as instruções da skill.");

    const content = stringifyFrontmatter({ name: slug, description: String(description).trim() }, `${String(body).trim()}\n`);
    const result = await window.electronAPI.saveFile(`${this.book}/${SKILLS_DIR}/${slug}.md`, content);
    if (!result?.success) throw new Error(result?.error || "Falha ao salvar a skill.");
    await this.load();
  }

  /**
   * Exclui uma skill do livro.
   * @param {string} name - Nome.
   * @returns {Promise<void>}
   */
  async remove(name) {
    if (!this.book) return;
    await window.electronAPI.deleteFile(`${this.book}/${SKILLS_DIR}/${name}.md`);
    await this.load();
  }
}
