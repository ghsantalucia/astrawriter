/**
 * @file Perfis de template: o corpo dos templates de fichas e de capítulos muda conforme o perfil (assistente, co-autor,
 * autônomo ou um criado pelo usuário); as variáveis (frontmatter) são sempre as do template base e nunca mudam. Este
 * serviço junta o corpo do perfil com o frontmatter do arquivo e aplica os templates ao livro.
 */

import { TEMPLATE_KINDS, PROFILE_FOR_AI_MODE } from "../../shared/templateKinds.js";
import { normalizePath } from "../utils/helpers.js";
import { splitFrontmatter } from "../utils/markdown.js";

/**
 * Junta o frontmatter de um arquivo ao corpo de um template.
 * @param {string} existing - Conteúdo atual do arquivo (de onde vem o frontmatter).
 * @param {string} body - Corpo do template do perfil.
 * @returns {string}
 */
export function mergeTemplate(existing, body) {
  const { frontmatter } = splitFrontmatter(existing || "");
  const text = String(body || "").replace(/^\s+/, "");
  return `${frontmatter}\n${text.endsWith("\n") ? text : `${text}\n`}`;
}

/**
 * Serviço dos perfis de template.
 * @class
 */
export class TemplateService {
  /** @returns {Array<Object>} Tipos de template. */
  get kinds() {
    return TEMPLATE_KINDS;
  }

  /**
   * Perfis disponíveis (do app e do usuário).
   * @returns {Promise<Array<Object>>}
   */
  profiles() {
    return window.electronAPI.templates.profiles();
  }

  /**
   * Perfil padrão de um modo da IA.
   * @param {string} aiMode - `assistant`, `coauthor` ou `autonomous`.
   * @returns {string}
   */
  profileForMode(aiMode) {
    return PROFILE_FOR_AI_MODE[aiMode] || "assistant";
  }

  /**
   * Corpo de um template em um perfil (vazio se o perfil não tiver).
   * @param {string} profileId - Perfil.
   * @param {string} kind - Tipo.
   * @returns {Promise<string|null>}
   */
  async body(profileId, kind) {
    const found = await window.electronAPI.templates.read(profileId, kind);
    return found ? found.body : null;
  }

  /**
   * Perfil de template de um livro (o do `config.json`, ou o assistente).
   * @param {string} bookPath - Caminho do livro.
   * @returns {Promise<string>}
   */
  async profileOfBook(bookPath) {
    try {
      const config = JSON.parse((await window.electronAPI.readFile(`${normalizePath(bookPath)}/config.json`)) || "{}");
      return config.template_profile || "assistant";
    } catch {
      return "assistant";
    }
  }

  /**
   * Troca o corpo dos templates das fichas do livro (personagem, ambiente, conceito e evento) pelos do perfil. Fichas já
   * criadas não mudam. Quem chama guarda o perfil no `config.json` do livro (`template_profile`).
   * @param {string} bookPath - Caminho do livro.
   * @param {string} profileId - Perfil.
   * @returns {Promise<number>} Quantos templates foram aplicados.
   */
  async applyToBook(bookPath, profileId) {
    const book = normalizePath(bookPath).replace(/\/+$/, "");
    let applied = 0;
    for (const kind of TEMPLATE_KINDS.filter((k) => k.bookFile)) {
      const body = await this.body(profileId, kind.id);
      const file = `${book}/${kind.bookFile}`;
      const existing = await window.electronAPI.readFile(file);
      if (body === null || existing === null) continue;
      const merged = mergeTemplate(existing, body);
      if (merged !== existing) {
        await window.electronAPI.saveFile(file, merged);
        applied += 1;
      }
    }
    return applied;
  }
}
