/**
 * @file Ferramentas de leitura e edição dos arquivos .md do livro, sujeitas às permissões aiRead/aiWrite.
 * Toda escrita vai para o rascunho (.md.temp); o autor sincroniza depois.
 */

import { t } from "../../../shared/i18n.js";
import { uiBus } from "../../events/uiBus.js";
import { normalizePath, TEMPLATE_FILE_KEY } from "../../utils/helpers.js";
import { splitFrontmatter } from "../../utils/markdown.js";
import { assertPermission, hasPermission, locateFile } from "./permissions.js";

const MAX_READ_CHARS = 60000;

const PATH_PARAM = {
  type: "string",
  // getter: a constante é criada na importação do módulo, antes de o idioma ser definido
  get description() {
    return t("Caminho do arquivo relativo à raiz do livro, ex: content/chapter_001/2_draft.md");
  },
};

/**
 * Lê o conteúdo atual (rascunho, se existir) e separa frontmatter e corpo.
 * @param {Object} located
 * @param {Object} ctx
 */
export async function readCurrent(located, ctx) {
  const { content } = await ctx.fileService.readFile(located.originalPath);
  if (content === null) throw new Error(t("Não foi possível ler o arquivo."));
  return splitFrontmatter(content);
}

/**
 * Grava o corpo como rascunho preservando o frontmatter e avisa a interface.
 */
export async function saveDraft(located, frontmatter, body, ctx) {
  const result = await ctx.fileService.saveTempFile(
    located.originalPath,
    frontmatter + body,
    { actor: ctx.changelog?.aiActor() },
  );
  if (!result?.success) {
    throw new Error(t("Falha ao salvar o rascunho: {error}", { error: result?.error }));
  }

  const original = normalizePath(located.originalPath);
  ctx.recordEdit?.(original);
  uiBus.emit("temp-file:saved", original);

  // Aviso "system" no chat (uma vez por arquivo em cada resposta da IA)
  ctx.noticed ??= new Set();
  if (!ctx.noticed.has(original)) {
    ctx.noticed.add(original);
    ctx.notice?.(t('"{title}" - Alterado pela IA (aguardando revisão)', { title: located.title }));
  }

  // Se o arquivo está aberto no editor, recarrega para mostrar o rascunho da IA.
  const open = normalizePath(ctx.state.currentFilePath).replace(/\.temp$/, "");
  if (open === original) uiBus.emit("editor:open-file", { path: original });

  uiBus.emit("toast:show", {
    message: t('A IA alterou "{title}".', { title: located.title }),
    type: "success",
  });
}

/** Percorre a árvore listando os .md que a IA pode ler. */
function collectFiles(node, prefix, out) {
  for (const [key, file] of Object.entries(node.files || {}) as [string, any][]) {
    if (!/\.md(\.temp)?$/i.test(file.originalPath || "")) continue;
    if (key === TEMPLATE_FILE_KEY) continue; // modelos de criação não são conteúdo do livro
    const located = { metadata: file.metadata || {} };
    if (!hasPermission(located, "aiRead")) continue;
    out.push({
      title: file.metadata?.title || key,
      path: `${prefix}${key}.md`,
      canWrite: hasPermission(located, "aiWrite"),
      hasPendingDraft: Boolean(file.isTemp),
    });
  }
  for (const [name, sub] of Object.entries(node.folders || {})) {
    if (name.startsWith(".")) continue;
    collectFiles(sub, `${prefix}${name}/`, out);
  }
}

/**
 * Prepara uma edição: exige que não haja rascunhos pendentes no projeto e trava a tela.
 * Deve ser chamada antes de qualquer leitura-para-escrita, já com a permissão validada.
 */
export async function beginEdit(ctx) {
  if (typeof ctx.beginEdit === "function") await ctx.beginEdit();
}

/**
 * Registra as ferramentas de arquivos do livro.
 * @param {import('./registry.js').ToolRegistry} registry
 */
export function registerBookTools(registry) {
  registry.register({
    name: "list_files",
    description:
      t("Lista os arquivos .md do livro atual que a IA tem permissão de ler, com título, caminho, se pode escrever e se há rascunho pendente. O caminho é só para uso nas ferramentas; ao falar com o autor use o título."),
    parameters: { type: "object", properties: {} },
    async execute(_args, ctx) {
      if (!ctx.state.currentBookPath)
        throw new Error(t("Nenhum livro selecionado."));
      const bookPath = normalizePath(ctx.state.currentBookPath);
      const tree = await window.electronAPI.getTree(bookPath);
      if (!tree) throw new Error(t("Não foi possível ler a estrutura do livro."));
      const files = [];
      collectFiles(tree, "", files);
      // Execução de skill: o mapa já diz quais arquivos não mudaram desde a última vez
      if (ctx.unchanged?.size) {
        for (const f of files) if (ctx.unchanged.has(f.path)) f.status = t("inalterado desde a última execução");
      }
      // Changelog: a listagem é uma leitura da IA sobre o livro inteiro
      await ctx.changelog?.recordBookRead("list_files", {
        count: files.length,
      });
      return files;
    },
  });

  registry.register({
    name: "read_file",
    description:
      t("Lê o conteúdo (corpo Markdown, sem frontmatter) de um arquivo do livro. Requer permissão de leitura da IA."),
    parameters: {
      type: "object",
      properties: { path: PATH_PARAM },
      required: ["path"],
    },
    async execute({ path }, ctx) {
      const located = await locateFile(ctx.state, path);
      assertPermission(located, "aiRead");
      const { body } = await readCurrent(located, ctx);
      await ctx.changelog?.recordAiRead(located.originalPath, "read_file");
      ctx.readFiles?.add(normalizePath(located.originalPath).replace(`${normalizePath(ctx.state.currentBookPath).replace(/\/+$/, "")}/`, ""));
      if (body.length <= MAX_READ_CHARS) return body;
      return `${body.slice(0, MAX_READ_CHARS)}\n\n${t("[... arquivo truncado em {max} caracteres]", { max: MAX_READ_CHARS })}`;
    },
  });

  registry.register({
    name: "write_file",
    description:
      t("Substitui TODO o corpo de um arquivo existente pelo conteúdo informado (o frontmatter é preservado). Salva como rascunho. Requer permissão de escrita da IA."),
    parameters: {
      type: "object",
      properties: {
        path: PATH_PARAM,
        content: {
          type: "string",
          description: t("Novo corpo completo do arquivo em Markdown."),
        },
      },
      required: ["path", "content"],
    },
    async execute({ path, content }, ctx) {
      if (typeof content !== "string")
        throw new Error(t("'content' é obrigatório."));
      const located = await locateFile(ctx.state, path);
      assertPermission(located, "aiWrite");
      await beginEdit(ctx);
      const { frontmatter } = await readCurrent(located, ctx);
      await saveDraft(located, frontmatter, content, ctx);
      return t('Rascunho de "{title}" salvo. O autor irá revisar as alterações.', { title: located.title });
    },
  });

  registry.register({
    name: "append_to_file",
    description:
      t("Acrescenta texto ao final de um arquivo existente. Salva como rascunho. Requer permissão de escrita da IA."),
    parameters: {
      type: "object",
      properties: {
        path: PATH_PARAM,
        text: { type: "string", description: t("Texto Markdown a acrescentar.") },
      },
      required: ["path", "text"],
    },
    async execute({ path, text }, ctx) {
      if (typeof text !== "string") throw new Error(t("'text' é obrigatório."));
      const located = await locateFile(ctx.state, path);
      assertPermission(located, "aiWrite");
      await beginEdit(ctx);
      const { frontmatter, body } = await readCurrent(located, ctx);
      const separator = body.endsWith("\n") ? "\n" : "\n\n";
      await saveDraft(located, frontmatter, body + separator + text, ctx);
      return t('Texto acrescentado ao rascunho de "{title}".', { title: located.title });
    },
  });

  registry.register({
    name: "replace_in_file",
    description:
      t("Substitui um trecho exato do arquivo por outro. O trecho deve ser único, a menos que replace_all seja true. Salva como rascunho. Requer permissão de escrita da IA."),
    parameters: {
      type: "object",
      properties: {
        path: PATH_PARAM,
        old_text: {
          type: "string",
          description: t("Trecho exato a ser substituído."),
        },
        new_text: { type: "string", description: t("Texto que o substituirá.") },
        replace_all: {
          type: "boolean",
          description: t("Substituir todas as ocorrências (padrão: false)."),
        },
      },
      required: ["path", "old_text", "new_text"],
    },
    async execute({ path, old_text, new_text, replace_all }, ctx) {
      if (!old_text) throw new Error(t("'old_text' não pode ser vazio."));
      if (typeof new_text !== "string")
        throw new Error(t("'new_text' é obrigatório."));
      const located = await locateFile(ctx.state, path);
      assertPermission(located, "aiWrite");
      await beginEdit(ctx);
      const { frontmatter, body } = await readCurrent(located, ctx);

      const occurrences = body.split(old_text).length - 1;
      if (occurrences === 0)
        throw new Error(t("Trecho não encontrado no arquivo."));
      if (occurrences > 1 && !replace_all) {
        throw new Error(
          t("O trecho aparece {count} vezes. Informe mais contexto ou use replace_all.", { count: occurrences }),
        );
      }

      const updated = replace_all
        ? body.split(old_text).join(new_text)
        : body.replace(old_text, () => new_text);
      await saveDraft(located, frontmatter, updated, ctx);
      return t('{count} substituição(ões) no rascunho de "{title}".', { count: replace_all ? occurrences : 1, title: located.title });
    },
  });
}
