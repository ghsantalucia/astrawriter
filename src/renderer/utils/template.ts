/**
 * @file Funções puras para interpretar arquivos-modelo (templates) do livro.
 *
 * Um modelo é um arquivo Markdown com:
 *  - `data:` no frontmatter: as variáveis (`placeholder`, `required`, `content`), possivelmente agrupadas;
 *  - corpo com seções `## Título`, cuja descrição/placeholder é a citação (`> texto`) logo abaixo.
 *
 * Estas funções transformam o modelo em passos de formulário (wizard) e, depois, aplicam as respostas
 * gerando o conteúdo final do novo arquivo, sem nunca alterar o modelo original.
 */

import {
  parseMarkdown,
  stringifyFrontmatter,
  splitFrontmatter,
} from "./markdown.js";
import { t } from "../../shared/i18n.js";

/** Prefixo dos ids dos campos que representam seções do corpo. */
export const SECTION_FIELD_PREFIX = "section-";

/**
 * @typedef {Object} TemplateVariable
 * @property {string} id - Caminho completo da variável (ex.: `book.title`), usado como id do campo.
 * @property {string[]} path - Segmentos do caminho dentro de `data`.
 * @property {string} placeholder - Texto de ajuda.
 * @property {boolean} required - Se o preenchimento é obrigatório.
 * @property {string} content - Valor atual/padrão.
 * @property {"text"|"textarea"|"select"|"events"} type - Tipo do campo. `options` (lista) faz dele um `select`;
 *   `type: events` é o campo de eventos (vários nomes separados por vírgula, com sugestões dos eventos cadastrados).
 * @property {Array<{value: string, label: string}>} options - Opções do `select`.
 */

/**
 * @typedef {Object} TemplateSection
 * @property {string} id - Id do campo (`section-<slug>`).
 * @property {string} title - Título da seção (texto do `##`).
 * @property {string} placeholder - Descrição (conteúdo da citação).
 * @property {string} raw - Corpo original da seção (usado se o usuário não preencher).
 */

/**
 * @typedef {Object} ParsedTemplate
 * @property {Object} metadata - Frontmatter completo do modelo.
 * @property {TemplateVariable[]} variables - Variáveis extraídas de `data`.
 * @property {string} preamble - Texto do corpo antes da primeira seção `##`.
 * @property {TemplateSection[]} sections - Seções `##` do corpo.
 */

/**
 * @typedef {Object} WizardField
 * @property {string} id - Id do campo (e do input no DOM).
 * @property {string} label - Rótulo exibido.
 * @property {"text"|"textarea"|"select"|"events"} type - Tipo do campo.
 * @property {Array<{value: string, label: string}>} [options] - Opções (tipo `select`).
 * @property {string[]} [suggestions] - Sugestões de texto (listadas ao digitar).
 * @property {string} [placeholder] - Placeholder do input.
 * @property {string} [hint] - Texto auxiliar abaixo do campo.
 * @property {boolean} required - Se é obrigatório.
 * @property {string} value - Valor inicial.
 * @property {number} [rows] - Linhas (apenas textarea).
 */

/**
 * @typedef {Object} WizardStep
 * @property {string} id - Identificador do passo.
 * @property {string} title - Título do passo.
 * @property {string} [description] - Descrição exibida acima dos campos.
 * @property {WizardField[]} fields - Campos do passo.
 */

/**
 * Gera um slug simples (minúsculo, sem acentos, separado por hífen).
 * @param {string} text - Texto original.
 * @returns {string} Slug.
 */
export function slugify(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Tipos de campo aceitos no `type` de uma variável. */
const FIELD_TYPES = new Set(["text", "textarea", "select", "events"]);

/**
 * Opções de um `select` a partir do frontmatter: cada item é um texto (valor = rótulo) ou `{value, label}`.
 * @param {*} raw - Valor de `options`.
 * @returns {Array<{value: string, label: string}>}
 */
export function normalizeOptions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o) =>
      o && typeof o === "object"
        ? { value: String(o.value ?? o.label ?? ""), label: String(o.label ?? o.value ?? "") }
        : { value: String(o ?? ""), label: String(o ?? "") },
    )
    .filter((o) => o.value !== "");
}

/**
 * Tipo de campo de uma variável: o `type` declarado, ou `select` se houver `options`, ou texto.
 * @param {Object} node - Nó da variável.
 * @returns {"text"|"textarea"|"select"|"events"}
 */
function variableType(node) {
  const declared = String(node.type || "").toLowerCase();
  if (declared === "events") return "events";
  if (Array.isArray(node.options) && node.options.length > 0) return "select";
  return FIELD_TYPES.has(declared) ? declared : "text";
}

/**
 * Indica se um nó de `data` é uma variável (folha) e não um grupo de variáveis.
 * @param {*} node - Nó do objeto `data`.
 * @returns {boolean}
 */
function isVariableLeaf(node) {
  return (
    node !== null &&
    typeof node === "object" &&
    ("placeholder" in node || "required" in node || "content" in node || typeof node.type === "string" || Array.isArray(node.options))
  );
}

/**
 * Achata o objeto `data` em uma lista de variáveis, com o caminho completo como id.
 * @param {Object} [data] - Objeto `data` do frontmatter.
 * @param {string[]} [prefix=[]] - Caminho acumulado (uso interno da recursão).
 * @returns {TemplateVariable[]} Variáveis encontradas, na ordem do arquivo.
 */
export function flattenVariables(data, prefix = []) {
  const variables = [];
  if (!data || typeof data !== "object") return variables;

  for (const [key, node] of Object.entries<any>(data)) {
    const path = [...prefix, key];

    if (isVariableLeaf(node)) {
      variables.push({
        id: path.join("."),
        path,
        placeholder: node.placeholder != null ? String(node.placeholder) : "",
        required: node.required === true || node.required === "true",
        content: node.content != null ? String(node.content) : "",
        type: variableType(node),
        options: normalizeOptions(node.options),
      });
    } else if (node && typeof node === "object") {
      variables.push(...flattenVariables(node, path));
    }
  }

  return variables;
}

/** Id do campo especial das tags (variável `tags` do frontmatter, fora de `data`). */
export const TAGS_FIELD_ID = "__tags";

/** Id do campo sintético "Título" (arquivos sem a variável `title`, como as anotações). */
export const TITLE_FIELD_ID = "__title";

/**
 * Campos editáveis de um arquivo: as variáveis do frontmatter (`data`) e, quando o arquivo não tem a variável
 * `title` mas aceita renomeação, um campo sintético "Título".
 * @param {Object} metadata - Frontmatter do arquivo.
 * @param {{title?: boolean}} [options] - `title: true` inclui o campo Título quando faltar a variável.
 * @returns {Array<{id: string, label: string, placeholder: string, required: boolean, value: string}>}
 */
export function editableFields(metadata, { title = false } = {}) {
  const variables = flattenVariables(metadata?.data);
  const fields: any[] = variables.map((v) => ({
    id: v.id,
    label: v.placeholder || v.id,
    placeholder: v.placeholder,
    required: v.required,
    value: v.content,
    type: v.type,
    options: v.options,
  }));
  if (title && !variables.some((v) => v.id === "title") && metadata?.title) {
    fields.unshift({
      id: TITLE_FIELD_ID,
      label: t("Título"),
      placeholder: t("Título do arquivo"),
      required: true,
      value: String(metadata.title),
    });
  }
  return fields;
}

/**
 * Grava o `content` de uma variável (por caminho) dentro de um objeto `data`, criando a variável se faltar.
 * @param {Object} data - Objeto `data` (modificado no lugar).
 * @param {string[]} path - Segmentos do caminho da variável.
 * @param {string} value - Novo conteúdo.
 * @returns {void}
 */
export function setVariableContent(data, path, value) {
  let node = data;
  for (const key of path) {
    if (!node[key] || typeof node[key] !== "object") node[key] = {};
    node = node[key];
  }
  node.content = value;
}

/**
 * Divide o corpo do modelo em prefácio e seções `##`, ignorando `##` dentro de blocos de código.
 * @param {string} body - Corpo Markdown do modelo.
 * @returns {{preamble: string, sections: TemplateSection[]}}
 */
export function parseSections(body) {
  const lines = String(body ?? "").split(/\r?\n/);
  const preambleLines = [];
  const raw = [];
  let current = null;
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;

    const heading = !inFence && line.match(/^##\s+(?!#)(.+?)\s*#*\s*$/);
    if (heading) {
      current = { title: heading[1].trim(), lines: [] };
      raw.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      preambleLines.push(line);
    }
  }

  const usedIds = new Set();
  const sections = raw.map((section) => {
    const text = section.lines.join("\n").trim();
    const placeholder = section.lines
      .filter((line) => /^\s*>/.test(line))
      .map((line) => line.replace(/^\s*>\s?/, ""))
      .join("\n")
      .trim();

    let id = `${SECTION_FIELD_PREFIX}${slugify(section.title) || "secao"}`;
    for (let n = 2; usedIds.has(id); n++) {
      id = `${SECTION_FIELD_PREFIX}${slugify(section.title) || "secao"}-${n}`;
    }
    usedIds.add(id);

    return { id, title: section.title, placeholder, raw: text };
  });

  return { preamble: preambleLines.join("\n").trim(), sections };
}

/**
 * Interpreta o conteúdo bruto de um arquivo-modelo.
 * @param {string} rawContent - Conteúdo do arquivo `.md` do modelo.
 * @returns {ParsedTemplate}
 */
export function parseTemplate(rawContent) {
  const { metadata, body } = parseMarkdown(rawContent || "");
  const { preamble, sections } = parseSections(body);

  return {
    metadata,
    variables: flattenVariables(metadata.data),
    preamble,
    sections,
  };
}

/**
 * Monta os passos do formulário: primeiro as variáveis, depois uma etapa por seção do corpo.
 * @param {ParsedTemplate} template - Modelo interpretado.
 * @param {Object} [options]
 * @param {string} [options.variablesTitle="Informações básicas"] - Título do passo de variáveis.
 * @returns {WizardStep[]}
 */
export function buildTemplateSteps(
  template,
  { variablesTitle = t("Informações básicas") } = {},
) {
  const steps = [];

  if (template.variables.length > 0) {
    steps.push({
      id: "variables",
      title: variablesTitle,
      description: t("Preencha as informações. Os campos com * são obrigatórios."),
      fields: template.variables.map((variable) => ({
        id: variable.id,
        label: variable.placeholder || variable.id,
        type: variable.type,
        options: variable.options,
        placeholder: variable.placeholder,
        hint: variable.id,
        required: variable.required,
        value: variable.content,
      })),
    });
  }

  template.sections.forEach((section) => {
    steps.push({
      id: section.id,
      title: section.title,
      description: section.placeholder,
      fields: [
        {
          id: section.id,
          label: section.title,
          type: "textarea",
          placeholder: section.placeholder,
          required: false,
          value: "",
          rows: 9,
        },
      ],
    });
  });

  return steps;
}

/**
 * Lista todos os campos (de todos os passos) em uma só lista.
 * @param {WizardStep[]} steps - Passos do formulário.
 * @returns {WizardField[]}
 */
export function allFields(steps) {
  return steps.flatMap((step) => step.fields);
}

/**
 * Retorna os campos obrigatórios que estão vazios nos valores informados.
 * @param {WizardStep[]} steps - Passos do formulário.
 * @param {Object<string, string>} values - Valores por id de campo.
 * @returns {WizardField[]} Campos obrigatórios não preenchidos.
 */
export function findMissingRequired(steps, values) {
  return allFields(steps).filter(
    (field) =>
      field.required && !String(values?.[field.id] ?? field.value ?? "").trim(),
  );
}

/**
 * Descobre o título (de interface) do novo arquivo: variável `title`, senão a primeira variável obrigatória
 * preenchida, senão o título do próprio modelo.
 * @param {ParsedTemplate} template - Modelo interpretado.
 * @param {Object<string, string>} values - Valores por id de campo.
 * @returns {string}
 */
export function resolveTitle(template, values) {
  const read = (id) => String(values?.[id] ?? "").trim();

  const byId = read("title");
  if (byId) return byId;

  for (const variable of template.variables) {
    if (variable.required && read(variable.id)) return read(variable.id);
  }
  return String(template.metadata?.title || "").trim();
}

/**
 * Aplica as respostas ao modelo, produzindo frontmatter e corpo finais (o modelo original não é alterado).
 * - Variáveis: o `content` recebe o valor informado; `placeholder` e `required` são mantidos.
 * - Seções: a resposta substitui a citação-descrição; se vazia, o texto original da seção é mantido.
 * @param {ParsedTemplate} template - Modelo interpretado.
 * @param {Object<string, string>} values - Valores por id de campo.
 * @returns {{metadata: Object, body: string}}
 */
export function applyTemplateValues(template, values) {
  const metadata = JSON.parse(JSON.stringify(template.metadata || {}));

  template.variables.forEach((variable) => {
    if (values && variable.id in values) {
      setVariableContent(
        (metadata.data ??= {}),
        variable.path,
        String(values[variable.id] ?? "").trim(),
      );
    }
  });

  const blocks = [];
  if (template.preamble) blocks.push(template.preamble);

  template.sections.forEach((section) => {
    const answer = String(values?.[section.id] ?? "").trim();
    blocks.push(`## ${section.title}\n\n${answer || section.raw}`.trimEnd());
  });

  return { metadata, body: `${blocks.join("\n\n")}\n` };
}

/**
 * Serializa o resultado de {@link applyTemplateValues} em texto de arquivo (frontmatter + corpo).
 * @param {{metadata: Object, body: string}} result - Metadados e corpo.
 * @returns {string}
 */
export function renderTemplateFile({ metadata, body }) {
  return stringifyFrontmatter(metadata, body);
}

/**
 * Substitui o primeiro título de nível 1 do corpo (ou insere um no topo, se não houver).
 * @param {string} body - Corpo Markdown.
 * @param {string} title - Texto do novo título.
 * @returns {string}
 */
export function replaceFirstHeading(body, title) {
  const heading = `# ${title}`;
  const text = String(body ?? "");

  if (/^#\s+.*$/m.test(text)) return text.replace(/^#\s+.*$/m, heading);
  return `${heading}\n\n${text.trimStart()}`;
}

/**
 * Anexa um texto ao final do corpo de um arquivo, preservando o frontmatter intacto.
 * @param {string} fileContent - Conteúdo completo do arquivo.
 * @param {string} line - Linha/bloco a acrescentar.
 * @returns {string}
 */
export function appendToBody(fileContent, line) {
  const { frontmatter, body } = splitFrontmatter(fileContent);
  const trimmed = body.trimEnd();
  const lastLine = trimmed.split("\n").pop() || "";
  const separator =
    /^[-*]\s/.test(lastLine) && /^[-*]\s/.test(line) ? "\n" : "\n\n";
  return `${frontmatter}${trimmed}${trimmed ? separator : ""}${line}\n`;
}
