/**
 * @file Ferramentas da IA para a Central de Revisões: registrar o que ela encontrou (contradições, problemas
 * temporais, gramática, dicas), consultar a lista de pendências e marcar como resolvidas as que ela corrigiu.
 * Registrar um issue não altera nenhum arquivo do livro (só `.system/review/`), por isso exige apenas `aiRead`.
 */

import { ISSUE_TYPES } from "../../review/issueTypes.js";
import { assertPermission, locateFile } from "./permissions.js";

/** Tipos que a IA pode registrar (os determinísticos são do sistema). */
const AI_TYPES = Object.entries(ISSUE_TYPES)
  .filter(([, info]) => info.source === "ai")
  .map(([id]) => id);

/**
 * @param {import('./registry.js').ToolRegistry} registry
 */
export function registerIssueTools(registry) {
  registry.register({
    name: "register_issues",
    description:
      "Registra na Central de Revisões os problemas que você encontrou no livro (contradições entre arquivos, erros de linha do tempo, " +
      "problemas gramaticais, sugestões de sinônimo e dicas de melhoria). Cada item é um issue separado, com o trecho EXATO do arquivo. " +
      "Use depois de analisar; o autor vê, corrige ou dispensa na Central. Não repita issues que já estão em list_issues e respeite os " +
      "tipos dispensados pelo autor. Não altera nenhum arquivo do livro.",
    parameters: {
      type: "object",
      properties: {
        issues: {
          type: "array",
          description: "Issues a registrar (até 30 por chamada).",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: AI_TYPES,
                description:
                  "Tipo: grammar, synonym, timeline-conflict, fact-conflict (contradição certa), possible-conflict (talvez), e as dicas (sempre amarelas): style-tip, clarity-tip, verbose-tip (trecho prolixo), pacing-tip (ritmo), missing-entity-tip (ficha ausente), grounding-tip (época/mundo real).",
              },
              file: { type: "string", description: "Arquivo (relativo à raiz do livro) onde está o problema principal." },
              excerpt: {
                type: "string",
                description: "Trecho exato do arquivo (copiado sem alterações, curto: uma frase ou menos). Obrigatório para o autor chegar ao ponto.",
              },
              occurrence: { type: "integer", description: "Se o trecho aparece mais de uma vez no arquivo, qual ocorrência (1 = primeira)." },
              message: { type: "string", description: "Explicação objetiva do problema, em português." },
              severity: {
                type: "string",
                enum: ["error", "warning"],
                description: "error = confirmado; warning = possível erro ou sugestão. Dicas de melhoria são sempre warning.",
              },
              replacement: {
                type: "string",
                description: "Texto que deve substituir o trecho (habilita o botão Corrigir). Use \"\" para remover. Omita se não há correção segura.",
              },
              related: {
                type: "array",
                description: "Outros trechos envolvidos (ex.: o outro lado de uma contradição).",
                items: {
                  type: "object",
                  properties: { file: { type: "string" }, excerpt: { type: "string" } },
                  required: ["file"],
                },
              },
            },
            required: ["type", "file", "message"],
          },
        },
      },
      required: ["issues"],
    },
    async execute({ issues }, ctx) {
      if (!Array.isArray(issues) || issues.length === 0) throw new Error("Informe ao menos um issue.");
      const items = issues.slice(0, 30);
      const denied = [];
      const allowed = [];
      for (let index = 0; index < items.length; index++) {
        try {
          const located = await locateFile(ctx.state, items[index]?.file);
          assertPermission(located, "aiRead");
          allowed.push({ ...items[index], file: located.relPath });
          for (const rel of items[index].related || []) {
            const other = await locateFile(ctx.state, rel.file);
            assertPermission(other, "aiRead");
          }
        } catch (error) {
          denied.push({ index, reason: error.message });
        }
      }
      const result = await ctx.issues.register(allowed, ctx.changelog.aiActor());
      return {
        registered: result.registered,
        skipped: [...denied, ...result.skipped],
        note:
          result.registered > 0
            ? "Registrado na Central de Revisões. O botão do rodapé do editor já mostra as pendências."
            : "Nada foi registrado.",
      };
    },
  });

  registry.register({
    name: "list_issues",
    description:
      "Lista as pendências da Central de Revisões (links quebrados, ortografia, linha do tempo, contradições e dicas), incluindo as que o " +
      "sistema encontrou sozinho. Use para saber o que já foi reportado antes de registrar algo novo ou para corrigir pendências. " +
      "Devolve versões compactas (id, tipo, arquivo, linha, trecho, mensagem e a correção sugerida, se houver).",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["links", "spelling", "timeline", "contradictions", "tips"], description: "Filtra por categoria." },
        type: { type: "string", description: "Filtra por tipo (ex.: typo, broken-link, fact-conflict)." },
        file: { type: "string", description: "Filtra por arquivo (relativo à raiz do livro)." },
        severity: { type: "string", enum: ["error", "warning"], description: "Filtra por severidade." },
        limit: { type: "integer", description: "Máximo de itens (padrão 40, máximo 100)." },
      },
    },
    async execute(args, ctx) {
      const limit = Math.min(Math.max(Number(args.limit) || 40, 1), 100);
      const filter = { ...args };
      delete filter.limit;
      if (filter.file) filter.file = String(filter.file).replace(/^\/+/, "");
      const all = ctx.issues.list(filter);
      const summary = ctx.issues.summary();
      await ctx.changelog?.recordBookRead("list_issues", { count: all.length });
      return {
        total: all.length,
        errors: summary.errors,
        warnings: summary.warnings,
        dismissedTypes: ctx.issues.dismissedTypes().map((d) => d.type),
        items: all.slice(0, limit).map((i) => ctx.issues.brief(i)),
        truncated: all.length > limit,
      };
    },
  });

  registry.register({
    name: "resolve_issues",
    description:
      "Marca como resolvidas (remove da Central) pendências registradas por você que já foram corrigidas. As pendências do sistema (links, " +
      "ortografia) somem sozinhas quando o texto é corrigido. Informe os ids de list_issues.",
    parameters: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "Ids dos issues resolvidos." },
      },
      required: ["ids"],
    },
    async execute({ ids }, ctx) {
      const removed = await ctx.issues.resolve(ids || [], ctx.changelog.aiActor());
      return { resolved: removed, note: "Pendências do sistema somem sozinhas depois que o texto é corrigido e sincronizado." };
    },
  });
}
