/**
 * @file Ferramentas da IA para os dados (variáveis do frontmatter) das fichas e para o link automático de um arquivo.
 * Fazem o mesmo que o botão de caneta do explorer e o botão "Auto-link" da toolbar. Tudo é salvo como rascunho
 * (`.md.temp`) e passa pela revisão do autor, como qualquer outra edição da IA.
 */

import { uiBus } from "../../events/uiBus.js";
import { domainBus } from "../../events/domainBus.js";
import { normalizePath } from "../../utils/helpers.js";
import { parseTags } from "../../../shared/tags.js";
import { parseMarkdown, stringifyFrontmatter } from "../../utils/markdown.js";
import {
  editableFields,
  flattenVariables,
  replaceFirstHeading,
  setVariableContent,
  TITLE_FIELD_ID,
} from "../../utils/template.js";
import { buildAutoLinkTerms, flattenBookTree } from "../../utils/bookFiles.js";
import { applyAutoLinksToMarkdown } from "../../utils/autoLinkText.js";
import { beginEdit, readCurrent, saveDraft } from "./bookTools.js";
import { assertPermission, locateFile } from "./permissions.js";

const PATH_PARAM = {
  type: "string",
  description:
    "Caminho do arquivo relativo à raiz do livro, ex.: assets/characters/character_001.md",
};

/**
 * Registra as ferramentas de variáveis e de link automático.
 * @param {import('./registry.js').ToolRegistry} registry
 */
export function registerVariableTools(registry) {
  registry.register({
    name: "get_file_variables",
    description:
      "Lista os dados (variáveis) de um arquivo/ficha: id, nome do campo e valor atual. Os ids são usados em set_file_variables. Requer permissão de leitura da IA.",
    parameters: {
      type: "object",
      properties: { path: PATH_PARAM },
      required: ["path"],
    },
    async execute({ path }, ctx) {
      const located = await locateFile(ctx.state, path);
      assertPermission(located, "aiRead");
      const { content } = await ctx.fileService.readFile(located.originalPath);
      const { metadata } = parseMarkdown(content || "");
      await ctx.changelog?.recordAiRead(
        located.originalPath,
        "get_file_variables",
      );

      const fields = editableFields(metadata, {
        title: located.relPath.startsWith("notes/"),
      });
      return {
        title: located.title,
        canWrite: metadata.aiWrite === true,
        tags: parseTags(metadata.tags),
        variables: fields.map(({ id, label, required, value }) => ({
          id,
          label,
          required,
          value,
        })),
      };
    },
  });

  registry.register({
    name: "set_file_variables",
    description:
      "Altera os dados (variáveis) de um arquivo/ficha, como o autor faz pela caneta do explorer. Alterar o nome (`title`) também atualiza o título do arquivo e o título H1 do corpo. Salva como rascunho para o autor revisar. Requer permissão de escrita da IA. Use get_file_variables antes para conhecer os ids.",
    parameters: {
      type: "object",
      properties: {
        path: PATH_PARAM,
        tags: {
          type: "array",
          items: { type: "string" },
          description:
            "Lista COMPLETA de tags do arquivo (substitui as atuais; use [] para remover todas). Letras minúsculas, números e - _ / . apenas.",
        },
        values: {
          type: "array",
          description: "Variáveis a alterar.",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Id da variável (ver get_file_variables).",
              },
              value: { type: "string", description: "Novo valor." },
            },
            required: ["id", "value"],
          },
        },
      },
      required: ["path"],
    },
    async execute({ path, values, tags }, ctx) {
      const hasValues = Array.isArray(values) && values.length > 0;
      if (!hasValues && !Array.isArray(tags)) {
        throw new Error("Informe 'values' (variáveis) e/ou 'tags'.");
      }
      values = hasValues ? values : [];
      const located = await locateFile(ctx.state, path);
      assertPermission(located, "aiWrite");
      await beginEdit(ctx);

      const { content } = await ctx.fileService.readFile(located.originalPath);
      if (content === null) throw new Error("Não foi possível ler o arquivo.");
      const { metadata, body } = parseMarkdown(content);
      metadata.data ??= {};

      const wanted = new Map(
        values.map((v) => [String(v?.id ?? ""), String(v?.value ?? "").trim()]),
      );
      const known = new Set([
        ...flattenVariables(metadata.data).map((v) => v.id),
        TITLE_FIELD_ID,
        "title",
      ]);
      const unknown = [...wanted.keys()].filter((id) => !known.has(id));
      if (unknown.length > 0) {
        throw new Error(
          `Variáveis desconhecidas: ${unknown.join(", ")}. Use get_file_variables para ver os ids.`,
        );
      }

      const changes = [];
      for (const variable of flattenVariables(metadata.data)) {
        if (!wanted.has(variable.id)) continue;
        const next = wanted.get(variable.id);
        if (next !== variable.content) {
          setVariableContent(metadata.data, variable.path, next);
          changes.push({
            id: variable.id,
            previous: variable.content,
            value: next,
          });
        }
      }

      // Arquivos sem a variável `title` (anotações) aceitam renomear pelo campo sintético
      const titleKey = wanted.has(TITLE_FIELD_ID) ? TITLE_FIELD_ID : null;
      if (titleKey) {
        const next = wanted.get(titleKey);
        if (next && next !== metadata.title) {
          changes.push({ id: "title", previous: metadata.title, value: next });
        }
      }

      if (Array.isArray(tags)) {
        const previous = parseTags(metadata.tags);
        const next = parseTags(tags);
        if (previous.join(",") !== next.join(",")) {
          if (next.length > 0) metadata.tags = next;
          else delete metadata.tags;
          changes.push({
            id: "tags",
            previous: previous.join(", "),
            value: next.join(", "),
          });
        }
      }

      if (changes.length === 0)
        return "Nada foi alterado (os valores já eram esses).";

      // Mudou o nome: atualiza o título do arquivo e o H1 do corpo
      const renamed = changes.find((c) => c.id === "title");
      let nextBody = body;
      if (renamed?.value) {
        metadata.title = renamed.value;
        nextBody = replaceFirstHeading(body, renamed.value);
      }

      await saveDraft(
        located,
        "",
        stringifyFrontmatter(metadata, nextBody),
        ctx,
      );

      const payload = {
        path: normalizePath(located.originalPath),
        changes,
        metadata,
      };
      uiBus.emit("file:variables-changed", payload);
      domainBus.emit("file:variables-changed", payload);
      return `${changes.length} variável(is) alterada(s) no rascunho de "${located.title}".`;
    },
  });

  registry.register({
    name: "auto_link_file",
    description:
      "Ativa o link automático em UM arquivo: transforma em links internos as ocorrências de nomes e apelidos das fichas do livro (personagens, locais, sistemas) que a IA pode ler. Não mexe em títulos, código nem em textos que já são links. Salva como rascunho para o autor revisar. Requer permissão de escrita da IA no arquivo.",
    parameters: {
      type: "object",
      properties: { path: PATH_PARAM },
      required: ["path"],
    },
    async execute({ path }, ctx) {
      const located = await locateFile(ctx.state, path);
      assertPermission(located, "aiWrite");
      assertPermission(located, "aiRead");
      await beginEdit(ctx);

      const tree = await window.electronAPI.getTree(
        normalizePath(ctx.state.currentBookPath),
      );
      // A IA só linka fichas que ela mesma pode ler (os nomes das demais não são expostos)
      const files = flattenBookTree(tree, ctx.state.currentBookPath).filter(
        (file) => file.metadata?.aiRead === true,
      );
      const terms = buildAutoLinkTerms(files, located.relPath);
      if (terms.length === 0) {
        return "O livro não tem fichas legíveis pela IA para linkar.";
      }

      const { frontmatter, body } = await readCurrent(located, ctx);
      const result = applyAutoLinksToMarkdown(body, terms);
      if (result.count === 0) {
        return `Nenhum termo novo para linkar em "${located.title}".`;
      }

      await saveDraft(located, frontmatter, result.body, ctx);
      return `${result.count} link(s) automático(s) criado(s) no rascunho de "${located.title}".`;
    },
  });
}
