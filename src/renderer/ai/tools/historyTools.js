/**
 * @file Ferramentas de consulta do histórico (versões dos arquivos, changelog do livro e log de erros da IA) e de
 * restauração de versões. A restauração sempre pede a confirmação do autor, com a comparação lado a lado, antes de
 * alterar qualquer coisa.
 */

import Handlebars from "handlebars";
import { uiBus } from "../../events/uiBus.js";
import { normalizePath } from "../../utils/helpers.js";
import { buildComparison } from "../../utils/historyCompare.js";
import {
  displayPath,
  formatDateTime,
  toViewEntry,
} from "../../utils/changelogFormat.js";
import { splitFrontmatter } from "../../utils/markdown.js";
import compareTpl from "../../components/Modal/templates/historyCompare.hbs?raw";
import { beginEdit } from "./bookTools.js";
import { assertPermission, locateFile } from "./permissions.js";
import { announceStructureChange } from "./structureTools.js";

const MAX_READ_CHARS = 60000;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const PATH_PARAM = {
  type: "string",
  description:
    "Caminho do arquivo relativo à raiz do livro, ex.: content/chapter_001/1_script.md",
};

/**
 * Limita a quantidade de itens pedida pela IA.
 * @param {number|undefined} limit - Valor informado.
 * @returns {number}
 */
function clampLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/**
 * Remove de um texto qualquer chave de API (as salvas nas configurações e padrões comuns de URL/cabeçalho).
 * @param {string} text - Texto.
 * @param {Object} state - Estado global (contém as chaves salvas).
 * @returns {string}
 */
function redactSecrets(text, state) {
  let clean = String(text ?? "");
  for (const config of Object.values(state.aiSettings?.providers || {})) {
    const key = config?.apiKey;
    if (key && key.length >= 8) clean = clean.split(key).join("[chave oculta]");
  }
  return clean
    .replace(/([?&](?:key|api_key|apikey)=)[^&\s"']+/gi, "$1[chave oculta]")
    .replace(/(x-api-key["':\s]+)[^\s"',]+/gi, "$1[chave oculta]");
}

/**
 * Pede a confirmação do autor para restaurar uma versão, mostrando a comparação lado a lado.
 * @param {Object} params
 * @param {string} params.fileTitle - Título do arquivo.
 * @param {Object} params.comparison - Resultado de `buildComparison`.
 * @param {Object} params.view - Dados de exibição da versão (`time`, `action`, `actorLabel`, `actorClass`).
 * @param {boolean} params.hasDraft - Se o arquivo tem rascunho pendente.
 * @returns {Promise<boolean>} Verdadeiro se o autor confirmou.
 */
function confirmRestore({ fileTitle, comparison, view, hasDraft }) {
  return new Promise((resolve) => {
    let decided = false;
    const decide = (value) => {
      if (decided) return;
      decided = true;
      resolve(value);
    };

    uiBus.emit("modal:open", {
      id: "ai-restore-confirm-modal",
      title: `A IA quer restaurar — ${fileTitle}`,
      content: Handlebars.compile(compareTpl)({
        ...comparison,
        versionTitle:
          view.action === "original"
            ? "Versão original (antes do primeiro registro)"
            : `Versão de ${view.time}`,
        actorLabel: view.actorLabel,
        actorClass: view.actorClass,
        hasDraft,
      }),
      windowClass: "modal-wide",
      onClose: () => decide(false),
      buttons: [
        { text: "Recusar", class: "btn-secondary" },
        {
          text: "Restaurar esta versão",
          class: "btn-danger",
          onClick: (modal) => {
            decide(true);
            modal.close();
          },
        },
      ],
    });
  });
}

/**
 * Registra as ferramentas de histórico e logs.
 * @param {import('./registry.js').ToolRegistry} registry
 */
export function registerHistoryTools(registry) {
  registry.register({
    name: "list_file_history",
    description:
      "Lista as versões do histórico de um arquivo (mais recente primeiro): id, data, autor, ação e se a versão ainda pode ser restaurada. Requer permissão de leitura da IA no arquivo.",
    parameters: {
      type: "object",
      properties: { path: PATH_PARAM },
      required: ["path"],
    },
    async execute({ path }, ctx) {
      const located = await locateFile(ctx.state, path);
      assertPermission(located, "aiRead");
      const abs = normalizePath(located.originalPath).replace(/\.temp$/, "");
      const history = await ctx.changelog.getFileHistory(abs);

      const entries = (history.entries || [])
        .filter((e) => e.action !== "read")
        .map((entry) => ({
          ...toViewEntry(entry),
          isCurrent: Boolean(entry.isCurrent) && entry.action !== "delete",
        }))
        .map((v) => ({
          id: v.id,
          time: v.time,
          action: v.action,
          author: [v.actorLabel, v.actorDetail].filter(Boolean).join(" · "),
          summary: v.summary,
          isCurrent: v.isCurrent,
          canRestore: !v.isCurrent && !v.purged && v.action !== "delete",
        }));

      await ctx.changelog.recordAiRead(abs, "list_file_history");
      return { title: located.title, versions: entries };
    },
  });

  registry.register({
    name: "read_file_version",
    description:
      "Lê o conteúdo (corpo Markdown) de uma versão antiga de um arquivo, pelo id retornado em list_file_history. Requer permissão de leitura da IA.",
    parameters: {
      type: "object",
      properties: {
        path: PATH_PARAM,
        entry_id: { type: "number", description: "Id da versão." },
      },
      required: ["path", "entry_id"],
    },
    async execute({ path, entry_id }, ctx) {
      const located = await locateFile(ctx.state, path);
      assertPermission(located, "aiRead");
      const abs = normalizePath(located.originalPath).replace(/\.temp$/, "");
      const preview = await ctx.changelog.preview(abs, Number(entry_id));
      if (!preview?.success) {
        throw new Error(preview?.error || "Versão não encontrada.");
      }
      if (preview.content == null) {
        throw new Error("O conteúdo desta versão não está mais guardado.");
      }
      await ctx.changelog.recordAiRead(abs, "read_file_version");

      const { body } = splitFrontmatter(preview.content);
      if (body.length <= MAX_READ_CHARS) return body;
      return `${body.slice(0, MAX_READ_CHARS)}\n\n[... versão truncada em ${MAX_READ_CHARS} caracteres]`;
    },
  });

  registry.register({
    name: "restore_file_version",
    description:
      "Restaura um arquivo para uma versão antiga do histórico. O AUTOR precisa confirmar em uma janela com a comparação lado a lado; se ele recusar, nada é alterado. Restaurar apaga o conteúdo guardado das versões posteriores. Requer permissão de escrita da IA. Use list_file_history antes para conhecer os ids.",
    parameters: {
      type: "object",
      properties: {
        path: PATH_PARAM,
        entry_id: {
          type: "number",
          description: "Id da versão a restaurar (ver list_file_history).",
        },
      },
      required: ["path", "entry_id"],
    },
    async execute({ path, entry_id }, ctx) {
      const located = await locateFile(ctx.state, path);
      assertPermission(located, "aiWrite");
      const abs = normalizePath(located.originalPath).replace(/\.temp$/, "");
      const entryId = Number(entry_id);

      const history = await ctx.changelog.getFileHistory(abs);
      const entry = (history.entries || []).find((e) => e.id === entryId);
      if (!entry) throw new Error("Versão não encontrada no histórico.");
      const view = toViewEntry(entry);
      if (entry.isCurrent || entry.action === "delete" || view.purged) {
        throw new Error(
          "Esta versão não pode ser restaurada (já é a atual, é uma exclusão ou teve o conteúdo apagado por uma restauração anterior).",
        );
      }

      const preview = await ctx.changelog.preview(abs, entryId);
      if (!preview?.success) {
        throw new Error(preview?.error || "Não foi possível ler a versão.");
      }

      // O rascunho pendente só existe se o autor ainda não sincronizou; a confirmação avisa
      const hasDraft =
        (await window.electronAPI.readFile(`${abs}.temp`)) !== null;
      const confirmed = await confirmRestore({
        fileTitle: located.title,
        comparison: buildComparison(preview.current, preview.content),
        view,
        hasDraft,
      });
      if (!confirmed) {
        return `O autor recusou a restauração de "${located.title}". Nada foi alterado.`;
      }

      await beginEdit(ctx);
      const result = await ctx.changelog.restore(
        abs,
        entryId,
        ctx.changelog.aiActor(),
      );
      if (!result?.success) {
        throw new Error(result?.error || "Falha ao restaurar a versão.");
      }
      announceStructureChange({ restoredPath: abs });
      ctx.notice?.(`"${located.title}" - Versão restaurada pela IA`);
      const which =
        view.action === "original"
          ? "a versão original"
          : `a versão de ${view.time}`;
      return `"${located.title}" restaurado para ${which}.`;
    },
  });

  registry.register({
    name: "read_changelog",
    description:
      "Consulta o changelog do livro (quem alterou o quê e quando), do mais recente ao mais antigo. Retorna só os metadados dos registros (sem o conteúdo dos arquivos); registros de arquivos que a IA não pode ler são omitidos. Use `older` retornado para continuar a leitura em registros mais antigos.",
    parameters: {
      type: "object",
      properties: {
        file: {
          type: "string",
          description:
            "Arquivo de log a ler (valor `older` da chamada anterior). Omita para começar pelo mais recente.",
        },
        path: {
          type: "string",
          description:
            "Filtro opcional: só registros cujo caminho contém este texto.",
        },
        limit: {
          type: "number",
          description: `Máximo de registros (padrão ${DEFAULT_LIMIT}, máximo ${MAX_LIMIT}).`,
        },
      },
    },
    async execute({ file, path, limit }, ctx) {
      if (!ctx.state.currentBookPath)
        throw new Error("Nenhum livro selecionado.");

      const page = await ctx.changelog.getPage(file || null);
      const tree = await window.electronAPI.getTree(
        normalizePath(ctx.state.currentBookPath),
      );
      const blocked = new Set();
      const walk = (node, prefix) => {
        for (const [key, f] of Object.entries(node?.files || {})) {
          if (f.metadata?.aiRead !== true) blocked.add(`${prefix}${key}.md`);
        }
        for (const [name, sub] of Object.entries(node?.folders || {})) {
          walk(sub, `${prefix}${name}/`);
        }
      };
      walk(tree, "");

      const filter = String(path || "").toLowerCase();
      const entries = (page.entries || [])
        .filter((e) => !blocked.has(e.path))
        .filter((e) => !filter || String(e.path).toLowerCase().includes(filter))
        .slice(0, clampLimit(limit))
        .map((entry) => {
          const v = toViewEntry(entry);
          return {
            id: entry.id,
            time: v.time,
            action: entry.action,
            author: [v.actorLabel, v.actorDetail].filter(Boolean).join(" · "),
            path: displayPath(entry.path, entry.action),
            summary: v.summary,
          };
        });

      await ctx.changelog.recordBookRead("read_changelog", {
        count: entries.length,
      });
      return { file: page.file, older: page.older, entries };
    },
  });

  registry.register({
    name: "read_ai_error_log",
    description:
      "Consulta o log de erros da IA (falhas de API, limites de uso, etc.), do mais recente ao mais antigo. As chaves de API nunca aparecem.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: `Máximo de registros (padrão ${DEFAULT_LIMIT}, máximo ${MAX_LIMIT}).`,
        },
      },
    },
    async execute({ limit }, ctx) {
      const log = (await window.electronAPI.readAiErrorLog()) || [];
      const list = Array.isArray(log) ? log : log.entries || [];
      return list.slice(0, clampLimit(limit)).map((e) => ({
        time: formatDateTime(e.ts),
        provider: e.provider,
        model: e.model,
        status: e.status,
        book: e.book,
        message: redactSecrets(e.message, ctx.state).slice(0, 600),
      }));
    },
  });
}
