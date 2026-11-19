// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Utilitário para conversão, parsing e serialização de conteúdos Markdown e metadados Frontmatter YAML.
 * O YAML é interpretado por completo (js-yaml), então objetos aninhados como `data:` sobrevivem a leituras e gravações.
 */

import yaml from "js-yaml";

/** Opções de serialização YAML: sem quebra automática de linhas e ignorando valores não serializáveis. */
const YAML_DUMP_OPTIONS = { lineWidth: -1, skipInvalid: true, noRefs: true };

/**
 * Interpreta um texto YAML simples (chave: valor, uma por linha). Usado como alternativa quando o YAML é inválido.
 * @param {string} yamlText - Texto YAML.
 * @returns {Object} Objeto plano com as chaves encontradas.
 */
function parseSimpleYaml(yamlText) {
  const metadata = {};

  yamlText.split("\n").forEach((line) => {
    const [key, ...valueParts] = line.split(":");
    if (key && valueParts.length > 0) {
      const cleanKey = key.trim();
      let val = valueParts
        .join(":")
        .trim()
        .replace(/^["']|["']$/g, "");

      if (val === "true") val = true;
      else if (val === "false") val = false;

      metadata[cleanKey] = val;
    }
  });

  return metadata;
}

/**
 * Converte um texto YAML em objeto JS, caindo no interpretador simples se o YAML for inválido.
 * @param {string} yamlText - Texto YAML.
 * @returns {Object} Objeto com os dados.
 */
export function parseYaml(yamlText) {
  try {
    const parsed = yaml.safeLoad(yamlText);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return parseSimpleYaml(yamlText);
  }
}

/**
 * Converte um objeto JS em texto YAML.
 * @param {Object} data - Dados a serializar.
 * @returns {string} Texto YAML (termina com quebra de linha).
 */
export function stringifyYaml(data) {
  return yaml.safeDump(data, YAML_DUMP_OPTIONS);
}

/**
 * Converte Frontmatter YAML em Objeto JS e retorna o corpo do Markdown separadamente.
 * @param {string} fileContent Conteúdo bruto do arquivo
 * @param {boolean} isYmlOnly Indica se o arquivo contém apenas metadados YAML (ex: folder.yml)
 * @returns {{ metadata: Object, body: string }}
 */
export function parseMarkdown(fileContent, isYmlOnly = false) {
  let yamlText = "";
  let body = "";

  if (isYmlOnly) {
    yamlText = fileContent;
    body = "";
  } else {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
    const match = fileContent.match(frontmatterRegex);

    if (match) {
      yamlText = match[1];
      body = fileContent.replace(frontmatterRegex, "");
    } else {
      return { metadata: {}, body: fileContent };
    }
  }

  const metadata = parseYaml(yamlText);

  return { metadata, body };
}

/**
 * Separa o bloco de Frontmatter (texto bruto, intacto) do corpo do Markdown.
 * @param {string} fileContent Conteúdo bruto do arquivo
 * @returns {{ frontmatter: string, body: string }} `frontmatter` inclui os delimitadores `---` e a quebra final (ou "" se não houver).
 */
export function splitFrontmatter(fileContent) {
  const match = (fileContent || "").match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!match) return { frontmatter: "", body: fileContent || "" };
  return {
    frontmatter: match[0],
    body: fileContent.slice(match[0].length),
  };
}

/**
 * Reconstrói o bloco Frontmatter YAML e anexa ao corpo em Markdown para salvamento.
 * @param {Object} metadata Objeto de metadados (pode conter objetos aninhados, como `data`)
 * @param {string} body Texto do Markdown
 * @returns {string} Conteúdo formatado pronto para gravação em disco
 */
export function stringifyFrontmatter(metadata, body) {
  if (!metadata || Object.keys(metadata).length === 0) return body;

  return `---\n${stringifyYaml(metadata)}---\n\n${body.trimStart()}`;
}
