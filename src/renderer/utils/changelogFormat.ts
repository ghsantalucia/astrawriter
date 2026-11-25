/**
 * @file Funções puras de formatação dos registros do changelog e do log de erros para exibição nos modais.
 */

import { t } from "../../shared/i18n.js";

/**
 * Formata uma data ISO como "DD/MM/AAAA HH:MM:SS" (horário local).
 * @param {string|null|undefined} iso - Data em formato ISO.
 * @returns {string} Data formatada ou "—" se inválida.
 */
export function formatDateTime(iso) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

/**
 * Descreve quem realizou uma ação, com a classe de cor correspondente.
 * @param {{type: string, provider?: string, model?: string}|undefined} actor - Autor registrado.
 * @returns {{label: string, detail: string, className: string}} Rótulo, detalhe (provedor/modelo) e classe CSS.
 */
export function describeActor(actor) {
  if (actor?.type === "ai") {
    return {
      label: t("Assistente"),
      detail: [actor.provider, actor.model].filter(Boolean).join(" · "),
      className: "actor-ai",
    };
  }
  if (actor?.type === "system") {
    return { label: t("Sistema"), detail: "", className: "actor-system" };
  }
  return { label: t("Usuário"), detail: "", className: "actor-user" };
}

/**
 * Nome exibido para o caminho registrado (`.` significa o livro inteiro ou, para configurações, o app).
 * @param {string} path - Caminho relativo ao livro.
 * @param {string} [action] - Ação do registro.
 * @returns {string}
 */
export function displayPath(path, action) {
  if (path !== ".") return path;
  return action === "setting" ? t("(configurações)") : t("(livro inteiro)");
}

/**
 * Resumo de um registro da Central de Revisões.
 * @param {Object} meta - Dados do registro.
 * @returns {string}
 */
function summarizeReview(meta) {
  const kinds = Object.entries(meta.types || {})
    .map(([type, n]) => `${n}× ${type}`)
    .join(", ");
  const detail = kinds ? ` (${kinds})` : "";
  switch (meta.kind) {
    case "found":
      return t("{count} issue(s) encontrado(s){detail}", { count: meta.count, detail });
    case "scan":
      return t("varredura: {count} issue(s) em {files} arquivo(s)", { count: meta.count, files: meta.files ?? "?" });
    case "fixed":
      return t("{count} issue(s) corrigido(s){detail}", { count: meta.count, detail });
    case "dismissed":
      return t("{count} issue(s) dispensado(s){detail}", { count: meta.count, detail });
    case "type-dismissed":
      return t("tipo dispensado: {type}", { type: meta.type });
    case "type-restored":
      return t("tipo reativado: {type}", { type: meta.type });
    case "dictionary":
      return t("\"{word}\" adicionada ao dicionário do livro ({removed} issue(s) removido(s))", { word: meta.word, removed: meta.removed ?? 0 });
    case "ai-fix":
      return t("correção pela IA solicitada ({count} issue(s))", { count: meta.count });
    case "analysis":
      return t("análise da IA: {count} arquivo(s), {verified} verificação(ões), {issues} pendência(s) nova(s)", { count: meta.count, verified: meta.verified ?? 0, issues: meta.issues ?? 0 });
    case "registered":
      return t("{count} issue(s) registrado(s){detail}", { count: meta.count, detail });
    case "resolved":
      return t("{count} issue(s) resolvido(s)", { count: meta.count });
    default:
      return meta.kind || t("revisão");
  }
}

/**
 * Resumo curto de um registro (linhas alteradas, ferramenta usada, versão restaurada...).
 * @param {Object} entry - Registro do changelog.
 * @returns {string}
 */
export function summarizeEntry(entry) {
  const meta = entry.meta || {};

  switch (entry.action) {
    case "update":
      return t("+{added} / −{removed} linhas", { added: meta.added ?? 0, removed: meta.removed ?? 0 });
    case "delete":
      return t("arquivo excluído ({removed} linhas guardadas)", { removed: meta.removed ?? 0 });
    case "create":
      return t("arquivo criado");
    case "read":
      if (!meta.tool) return t("arquivo lido");
      return meta.count !== undefined
        ? t("lido por {tool} ({count} arquivos)", { tool: meta.tool, count: meta.count })
        : t("lido por {tool}", { tool: meta.tool });
    case "restore":
      return t("voltou à versão #{id} ({removed} registros ficaram sem conteúdo)", { id: meta.toEntryId, removed: meta.removed ?? 0 });
    case "original":
      return t("estado do arquivo antes do primeiro registro do changelog");
    case "autosave":
      return t("rascunho salvo {saves}x nesta sessão · +{added} / −{removed} linhas", { saves: meta.saves ?? 1, added: meta.added ?? 0, removed: meta.removed ?? 0 });
    case "move":
      return t("movido de {from}", { from: meta.from });
    case "review":
      return summarizeReview(meta);
    case "setting":
      return meta.setting === "ai.model"
        ? t("modelo de IA: {from} → {to}", { from: meta.from, to: meta.to })
        : `${meta.setting}: ${meta.from} → ${meta.to}`;
    default:
      return "";
  }
}

/**
 * Prepara um registro para o template de listagem.
 * @param {Object} entry - Registro do changelog.
 * @returns {Object} Dados prontos para exibição.
 */
export function toViewEntry(entry) {
  const actor = describeActor(entry.actor);
  return {
    id: entry.id,
    action: entry.action,
    time: entry.ts ? formatDateTime(entry.ts) : "—",
    actorLabel: entry.action === "original" ? "" : actor.label,
    actorDetail: actor.detail,
    actorClass: actor.className,
    path: displayPath(entry.path, entry.action),
    // Conteúdo apagado por uma restauração: o registro permanece, mas não permite mais rollback
    purged: Boolean(entry.purged),
    hasContent: Boolean(entry.content) && !entry.purged,
    summary: summarizeEntry(entry),
  };
}
