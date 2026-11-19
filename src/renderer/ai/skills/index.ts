// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Registro de skills: pacotes de instruções em Markdown carregados sob demanda pela IA.
 *
 * Para adicionar uma skill, crie um arquivo `.md` nesta pasta com o frontmatter:
 *   ---
 *   name: nome-da-skill
 *   description: quando usar esta skill
 *   ---
 * O corpo do arquivo são as instruções. O nome e a descrição entram no prompt do
 * sistema; o corpo só é enviado quando a IA chama a ferramenta `load_skill`.
 */

import { parseMarkdown } from "../../utils/markdown.js";

const rawSkills = import.meta.glob("./*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** @type {Map<string, {name: string, description: string, body: string}>} */
const skills = new Map();

for (const raw of Object.values(rawSkills)) {
  const { metadata, body } = parseMarkdown(raw);
  if (!metadata.name) continue;
  skills.set(metadata.name, {
    name: metadata.name,
    description: metadata.description || "",
    body: body.trim(),
  });
}

/** Skills criadas pelo autor para o livro atual (`.system/skills/` do livro), pelo nome. */
let customSkills = new Map();

/**
 * Define as skills do livro atual (chamado pelo SkillService ao trocar de livro ou ao criar/editar/excluir uma skill).
 * @param {Array<{name: string, description: string, body: string}>} list - Skills do livro.
 * @returns {void}
 */
export function setCustomSkills(list) {
  customSkills = new Map(list.map((s) => [s.name, s]));
}

/**
 * Nomes das skills que já vêm com o app.
 * @returns {string[]}
 */
export function builtinSkillNames() {
  return [...skills.keys()];
}

/**
 * Lista as skills disponíveis (sem o corpo): as do app e as criadas pelo autor no livro.
 * @returns {Array<{name: string, description: string, custom?: boolean}>}
 */
export function listSkills() {
  return [
    ...[...skills.values()].map(({ name, description }) => ({
      name,
      description,
    })),
    ...[...customSkills.values()].map(({ name, description }) => ({
      name,
      description,
      custom: true,
    })),
  ];
}

/**
 * Obtém uma skill pelo nome.
 * @param {string} name
 * @returns {{name: string, description: string, body: string}|undefined}
 */
export function getSkill(name) {
  return skills.get(name) || customSkills.get(name);
}
