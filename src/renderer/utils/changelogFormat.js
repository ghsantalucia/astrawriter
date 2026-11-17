/**
 * @file Funções puras de formatação dos registros do changelog e do log de erros para exibição nos modais.
 */

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
      label: "Assistente",
      detail: [actor.provider, actor.model].filter(Boolean).join(" · "),
      className: "actor-ai",
    };
  }
  if (actor?.type === "system") {
    return { label: "Sistema", detail: "", className: "actor-system" };
  }
  return { label: "Usuário", detail: "", className: "actor-user" };
}

/**
 * Nome exibido para o caminho registrado (`.` significa o livro inteiro ou, para configurações, o app).
 * @param {string} path - Caminho relativo ao livro.
 * @param {string} [action] - Ação do registro.
 * @returns {string}
 */
export function displayPath(path, action) {
  if (path !== ".") return path;
  return action === "setting" ? "(configurações)" : "(livro inteiro)";
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
      return `+${meta.added ?? 0} / −${meta.removed ?? 0} linhas`;
    case "delete":
      return `arquivo excluído (${meta.removed ?? 0} linhas guardadas)`;
    case "create":
      return "arquivo criado";
    case "read":
      return meta.tool
        ? `lido por ${meta.tool}${meta.count !== undefined ? ` (${meta.count} arquivos)` : ""}`
        : "arquivo lido";
    case "restore":
      return `voltou à versão #${meta.toEntryId} (${meta.removed ?? 0} registros ficaram sem conteúdo)`;
    case "original":
      return "estado do arquivo antes do primeiro registro do changelog";
    case "autosave":
      return `rascunho salvo ${meta.saves ?? 1}x nesta sessão · +${meta.added ?? 0} / −${meta.removed ?? 0} linhas`;
    case "move":
      return `movido de ${meta.from}`;
    case "setting":
      return meta.setting === "ai.model"
        ? `modelo de IA: ${meta.from} → ${meta.to}`
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
