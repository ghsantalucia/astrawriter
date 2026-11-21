// @ts-nocheck
/**
 * @file Tools do app para a IA: abrir telas e arquivos, conhecer e alterar configurações, consultar uso e ajuda, buscar no
 * livro e executar skills. Cada ação tem uma classe de risco:
 *
 * - **a** (sem risco ou com revisão posterior): a IA faz sozinha;
 * - **b** (pode perturbar): só com a permissão do autor, numa janela de confirmação;
 * - **c** (delicado): a IA não faz; orienta e abre a tela para o autor clicar.
 *
 * As configurações do app vêm do registro único (`utils/appSettings.ts`), o mesmo da Central do Sistema.
 */

import { uiBus } from "../../events/uiBus.js";
import { appSettings } from "../../utils/appSettings.js";
import { normalizePath, escapeHtml } from "../../utils/helpers.js";
import { getUsageReport } from "../usageTracker.js";
import { locateFile } from "./permissions.js";
import { dayOf } from "../../services/productivityService.js";
import guide from "../../../../docs/guia-do-usuario.md?raw";

/** Abas de cada central (o que `open_central` aceita). */
const CENTRAL_TABS = {
  issues: ["overview", "links", "spelling", "timeline", "contradictions", "tips"],
  book: ["data", "overview", "export", "changelog", "danger"],
  ai: ["model", "fallback", "usage", "analysis", "debug", "errors", "skills"],
  system: ["general", "update", "appearance", "accessibility", "editor", "productivity", "shortcuts", "templates", "backup"],
};

/** Opções que ficam fora do registro simples (a IA as conhece para orientar o usuário, mas só ele as altera ou usa a tela). */
const OTHER_OPTIONS = [
  { label: "Modo da IA do livro (assistente, co-autor, autônomo)", where: "Central do Livro → Dados do livro", central: "book", tab: "data", risk: "c" },
  { label: "Permissões de leitura e escrita da IA em cada arquivo", where: "Dados do arquivo / folder.yml (cadeado no explorer)", central: null, risk: "c" },
  { label: "Contas de IA, chaves de API e modelo", where: "Central de IA → Contas e modelo", central: "ai", tab: "model", risk: "c" },
  { label: "Fallback automático entre contas", where: "Central de IA → Fallback de contas", central: "ai", tab: "fallback", risk: "b" },
  { label: "Perfil de uso da IA (Mínimo...Ultra) e opções por etapa", where: "Central de IA → Perfil e análises", central: "ai", tab: "analysis", risk: "b" },
  { label: "Revisões do sistema (liga/desliga) e correção ortográfica", where: "Central de Revisões → Resumo / Ortografia", central: "issues", tab: "overview", risk: "b" },
  { label: "Excluir o livro", where: "Central do Livro → Excluir livro", central: "book", tab: "danger", risk: "c" },
  { label: "Desinstalar o app", where: "Central do Sistema → Atualização", central: "system", tab: "update", risk: "c" },
  { label: "Exportar o livro (zip, capítulos, arquivo único; Markdown, Word, PDF)", where: "Central do Livro → Exportar", central: "book", tab: "export", risk: "a" },
  { label: "Importar um livro (.zip)", where: "Seletor de livros → Importar livro", central: null, risk: "a" },
  { label: "Temas de cores e fundo do chat", where: "Central do Sistema → Aparência", central: "system", tab: "appearance", risk: "a" },
  { label: "Templates das fichas e capítulos (perfis)", where: "Central do Sistema → Templates", central: "system", tab: "templates", risk: "a" },
  { label: "Atalhos de teclado", where: "Central do Sistema → Atalhos", central: "system", tab: "shortcuts", risk: "a" },
  { label: "Skills (biblioteca, loja, gatilhos)", where: "Central de IA → Skills", central: "ai", tab: "skills", risk: "b" },
];

/**
 * Pede permissão ao autor (classe b) numa janela de confirmação. Resolve `true` se ele permitir.
 * @param {string} title - Título.
 * @param {string} html - Texto da janela (já escapado).
 * @returns {Promise<boolean>}
 */
function askPermission(title, html) {
  return new Promise((resolve) => {
    uiBus.emit("modal:open", {
      id: `ai-permission-${Date.now()}`,
      title,
      content: `<div class="cn-confirm"><p>A IA pediu para fazer isto:</p>${html}</div>`,
      onClose: () => resolve(false),
      buttons: [
        { text: "Negar", class: "btn-secondary", onClick: (modal) => (resolve(false), modal.close()) },
        { text: "Permitir", class: "btn-primary", onClick: (modal) => (resolve(true), modal.close()) },
      ],
    });
  });
}

/**
 * Abre uma central (e a aba) para o autor.
 * @param {string} central - Central.
 * @param {string} [tab] - Aba.
 * @returns {void}
 */
function openCentral(central, tab) {
  uiBus.emit("central:open", { central, tab });
}

/**
 * Seções do guia do usuário (título e texto).
 * @returns {Array<{title: string, text: string}>}
 */
function guideSections() {
  const sections = [];
  let current = null;
  for (const line of String(guide).split(/\r?\n/)) {
    const m = line.match(/^(#{2,3})\s+(.*)$/);
    if (m) {
      if (current) sections.push(current);
      current = { title: m[2].trim(), text: "" };
    } else if (current) current.text += `${line}\n`;
  }
  if (current) sections.push(current);
  return sections;
}

/**
 * @param {import('./registry.js').ToolRegistry} registry
 */
export function registerSystemTools(registry) {
  // ---------- Abrir telas e arquivos (classe a) ----------

  registry.register({
    name: "open_central",
    description: `Abre uma central do app em uma aba específica, para o autor ver ou usar. Centrais e abas: ${Object.entries(CENTRAL_TABS)
      .map(([c, t]) => `${c} (${t.join(", ")})`)
      .join("; ")}. Também serve para orientar: abra a tela onde o autor deve clicar.`,
    parameters: {
      type: "object",
      properties: {
        central: { type: "string", enum: Object.keys(CENTRAL_TABS), description: "issues = Revisões, book = Livro, ai = IA, system = Sistema." },
        tab: { type: "string", description: "Aba da central (opcional)." },
      },
      required: ["central"],
    },
    async execute({ central, tab }) {
      const tabs = CENTRAL_TABS[central];
      if (!tabs) throw new Error(`Central desconhecida: ${central}.`);
      if (tab && !tabs.includes(tab)) throw new Error(`Aba desconhecida em "${central}": ${tab}. Abas: ${tabs.join(", ")}.`);
      openCentral(central, tab);
      return `Central "${central}" aberta${tab ? ` na aba "${tab}"` : ""}.`;
    },
  });

  registry.register({
    name: "open_settings",
    description: "Abre a gaveta de configurações (menu lateral com atalhos das centrais, tema e correção ortográfica).",
    parameters: { type: "object", properties: {} },
    async execute() {
      uiBus.emit("settings:open");
      return "Gaveta de configurações aberta.";
    },
  });

  registry.register({
    name: "open_file_in_editor",
    description: "Abre (seleciona) um arquivo do livro no editor. Use antes de ações que valem para o arquivo aberto, como `open_file_history`.",
    parameters: { type: "object", properties: { path: { type: "string", description: "Caminho relativo à raiz do livro (ex.: content/chapter_001/2_draft.md)." } }, required: ["path"] },
    async execute({ path }, ctx) {
      const located = await locateFile(ctx.state, path);
      uiBus.emit("editor:open-file", { path: normalizePath(located.originalPath).replace(/\.temp$/, "") });
      return `Arquivo "${located.title}" aberto no editor.`;
    },
  });

  registry.register({
    name: "open_file_history",
    description: "Abre a janela de histórico de versões do arquivo que está aberto no editor (com restauração). Para outro arquivo, abra-o antes com `open_file_in_editor`.",
    parameters: { type: "object", properties: {} },
    async execute(_args, ctx) {
      if (!ctx.state.currentFilePath) throw new Error("Nenhum arquivo aberto no editor. Abra um com open_file_in_editor.");
      uiBus.emit("history:open-modal");
      return "Janela de histórico aberta.";
    },
  });

  registry.register({
    name: "request_sync",
    description: "Abre a janela de sincronização para o autor aprovar as alterações pendentes (rascunhos). A IA nunca sincroniza sozinha.",
    parameters: { type: "object", properties: {} },
    async execute(_args, ctx) {
      // Só uma vez por resposta (modelos menores repetiam a chamada em laço)
      if (ctx?.syncRequested) {
        throw new Error("A janela de sincronização já foi aberta nesta resposta. Não chame de novo: aguarde o autor.");
      }
      const pending = (await ctx?.fileService?.getPendingTempFiles?.()) || [];
      // Sem rascunhos não há o que sincronizar (e a janela não abre): dizer a verdade evita que a IA espere por nada
      if (pending.length === 0) {
        return "Não há rascunhos pendentes: nada a sincronizar, e a janela não abriu. Você pode editar arquivos direto, com replace_in_file, append_to_file ou write_file (se a tool não estiver liberada, peça a especificação dela em get_tool_specs).";
      }
      if (ctx) ctx.syncRequested = true;
      uiBus.emit("toolbar:open-sync-modal");
      return `Janela de sincronização aberta: o autor decide o destino de ${pending.length} rascunho(s) pendente(s).`;
    },
  });

  // ---------- Configurações (a/b/c) ----------

  registry.register({
    name: "list_settings",
    description:
      "Lista todas as configurações do app que a IA conhece: id, nome, valor atual, onde ficam e a classe (a: a IA altera; b: só com permissão do autor; c: só o autor altera, a IA orienta). Inclui as opções que a IA não pode alterar, para saber orientar o autor. Use para responder “onde mudo X?”.",
    parameters: { type: "object", properties: {} },
    async execute() {
      const settings = appSettings.defs().map((d) => ({
        id: d.id,
        name: d.label,
        value: d.id === "backup.folder" ? (appSettings.get(d.id) ? "(definida)" : "(vazia)") : appSettings.get(d.id),
        type: d.type,
        ...(d.min !== undefined ? { min: d.min, max: d.max } : {}),
        ...(d.type === "select" && d.options.length < 8 ? { options: d.options.map((o) => o.value) } : {}),
        where: d.where,
        class: d.risk,
        help: d.help,
      }));
      return { settings, otherOptions: OTHER_OPTIONS.map((o) => ({ option: o.label, where: o.where, class: o.risk })) };
    },
  });

  registry.register({
    name: "set_setting",
    description:
      "Altera uma configuração do app pelo id (veja `list_settings`): tema claro/escuro, tamanho da fonte do app, fontes do editor, modo noturno, narrador etc. Classe a: faz na hora; classe b: pede a permissão do autor; classe c: não altera, abre a tela para o autor. Só altere quando o autor pedir.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Id da configuração (ex.: ui.theme, ui.zoom, editor.fontSize)." },
        value: { type: "string", description: "Novo valor (números e sim/não como texto: \"120\", \"true\")." },
      },
      required: ["id", "value"],
    },
    async execute({ id, value }) {
      const def = appSettings.def(id);
      if (!def) throw new Error(`Configuração desconhecida: ${id}. Use list_settings.`);
      if (def.risk === "c") {
        openCentral(def.central || "system", def.tab);
        return `A IA não altera "${def.label}": é uma opção delicada. Abri a tela (${def.where}) para você mudar. ${def.help}`;
      }
      if (def.risk === "b") {
        const ok = await askPermission(`Alterar “${def.label}”?`, `<p><strong>${escapeHtml(def.label)}</strong> passará a ser <strong>${escapeHtml(value)}</strong>.</p><p>${escapeHtml(def.help)}</p>`);
        if (!ok) return "O autor negou a alteração. Nada foi mudado.";
      }
      const result = appSettings.set(id, value);
      return `"${def.label}" agora é ${result}.`;
    },
  });

  registry.register({
    name: "guide_user",
    description:
      "Orienta o autor em ações delicadas que a IA NÃO faz sozinha (classe c): trocar o modo da IA do livro, mudar permissões de arquivos, contas e chaves de API, excluir livro, desinstalar, escolher pasta de backup. Abre a tela certa e devolve o passo a passo para você explicar.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["change-ai-mode", "change-file-permissions", "manage-api-keys", "delete-book", "uninstall", "backup-folder", "change-usage-profile"], description: "Ação que o autor quer fazer." },
      },
      required: ["action"],
    },
    async execute({ action }) {
      const steps = {
        "change-ai-mode": ["book", "data", "Central do Livro → Dados do livro → Modo da IA: escolha assistente, co-autor ou autônomo."],
        "change-file-permissions": [null, null, "As permissões de cada arquivo ficam no próprio arquivo (variáveis humanRead, humanWrite, aiRead, aiWrite). O cadeado no explorer mostra arquivos somente leitura; a IA nunca altera as próprias permissões."],
        "manage-api-keys": ["ai", "model", "Central de IA → Contas e modelo: adicione uma conta, cole a chave de API (ela nunca é exibida por inteiro) e escolha o modelo."],
        "delete-book": ["book", "danger", "Central do Livro → Excluir livro: a exclusão é permanente e pede confirmação."],
        uninstall: ["system", "update", "Central do Sistema → Atualização → Desinstalar. Os livros ficam na pasta de livros; dá para exportar uma cópia antes."],
        "backup-folder": ["system", "backup", "Central do Sistema → Backup → Escolher pasta. Pode ser uma pasta do Google Drive, OneDrive ou Dropbox instalados."],
        "change-usage-profile": ["ai", "analysis", "Central de IA → Perfil e análises: escolha Mínimo, Econômico, Equilibrado, Completo ou Ultra (ou ajuste cada opção)."],
      }[action];
      if (!steps) throw new Error(`Ação desconhecida: ${action}.`);
      if (steps[0]) openCentral(steps[0], steps[1]);
      return `${steps[2]}${steps[0] ? " Abri a tela para você." : ""}`;
    },
  });

  // ---------- Consultas (classe a) ----------

  registry.register({
    name: "get_usage_by_model",
    description: "Uso de tokens e requisições da IA por modelo nos últimos dias (somente leitura).",
    parameters: { type: "object", properties: { days: { type: "number", description: "Quantos dias (padrão 7)." } } },
    async execute({ days }) {
      return getUsageReport(Math.min(60, Math.max(1, Number(days) || 7)));
    },
  });

  registry.register({
    name: "get_fallback_info",
    description: "Mostra a configuração do fallback automático entre contas de IA (ligado/desligado e a ordem das contas). Somente informação: para alterar, o autor usa Central de IA → Fallback de contas.",
    parameters: { type: "object", properties: {} },
    async execute(_args, ctx) {
      const settings = ctx.state.aiSettings || {};
      const fb = settings.fallback || {};
      const nick = (id) => (settings.accounts || []).find((a) => a.id === id)?.nickname || id;
      return { enabled: Boolean(fb.enabled), order: (fb.order || []).map(nick), activeAccount: nick(settings.activeAccount) };
    },
  });

  registry.register({
    name: "get_productivity",
    description: "Cronômetro de produtividade: tempo de escrita de hoje, dos últimos 7 dias e total por dia (somente leitura).",
    parameters: { type: "object", properties: {} },
    async execute(_args, ctx) {
      const service = ctx.productivity;
      if (!service) throw new Error("O cronômetro não está disponível.");
      const days = service.dailyTotals();
      const minutes = (ms) => Math.round(ms / 60000);
      return {
        today: minutes(days.find((d) => d.day === dayOf(Date.now()))?.ms || 0),
        unit: "minutos",
        byDay: days.slice(-14).map((d) => ({ day: d.day, minutes: minutes(d.ms) })),
        totalMinutes: minutes(days.reduce((s, d) => s + d.ms, 0)),
      };
    },
  });

  registry.register({
    name: "search_book",
    description: "Procura um texto nos arquivos do livro (título e conteúdo) e devolve os arquivos encontrados com um trecho. Só os arquivos que a IA pode ler.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Texto a procurar." } }, required: ["query"] },
    async execute({ query }, ctx) {
      if (!ctx.state.currentBookPath) throw new Error("Nenhum livro selecionado.");
      const results = (await window.electronAPI.searchBook(ctx.state.currentBookPath, String(query))) || [];
      // Só arquivos que a IA pode ler
      const { flattenBookTree } = await import("../../utils/bookFiles.js");
      const tree = await window.electronAPI.getTree(normalizePath(ctx.state.currentBookPath));
      const readable = new Set(flattenBookTree(tree, ctx.state.currentBookPath).filter((f) => f.metadata?.aiRead === true).map((f) => f.relPath.toLowerCase()));
      return results
        .filter((r) => readable.has(String(r.relativePath || "").toLowerCase().replace(/^[^/]+\//, "")) || readable.has(String(r.relativePath || "").toLowerCase()))
        .slice(0, 20)
        .map((r) => ({ path: r.relativePath, title: r.title, match: r.matchType, snippet: String(r.snippet || "").replace(/<[^>]+>/g, "").slice(0, 160) }));
    },
  });

  registry.register({
    name: "get_app_help",
    description: "Consulta o guia do usuário do app. Sem `topic`, lista os assuntos; com `topic`, devolve as seções mais relacionadas (palavras-chave). Use para explicar como algo funciona ou onde fica na interface.",
    parameters: { type: "object", properties: { topic: { type: "string", description: "Assunto ou palavras-chave (ex.: exportar livro, atalhos, templates)." } } },
    async execute({ topic }) {
      const sections = guideSections();
      if (!topic) return sections.map((s) => s.title);
      const words = String(topic).toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const scored = sections
        .map((s) => ({ s, score: words.reduce((n, w) => n + (s.title.toLowerCase().includes(w) ? 5 : 0) + (s.text.toLowerCase().split(w).length - 1), 0) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      if (!scored.length) return "Nada encontrado no guia para esse assunto. Assuntos disponíveis: " + sections.map((s) => s.title).join("; ");
      return scored.map(({ s }) => `## ${s.title}\n${s.text.trim().slice(0, 1800)}`).join("\n\n");
    },
  });

  // ---------- Ações com permissão (classe b) ----------

  registry.register({
    name: "auto_link_book",
    description: "Faz o link automático em TODOS os arquivos de texto do livro que a IA pode ler e editar (capítulos e fichas), como rascunho para o autor revisar. Pede a permissão do autor.",
    parameters: { type: "object", properties: {} },
    async execute(_args, ctx) {
      if (!ctx.state.currentBookPath) throw new Error("Nenhum livro selecionado.");
      const ok = await askPermission("Link automático em todo o livro?", "<p>A IA vai criar links entre os nomes de fichas encontrados em <strong>todos os arquivos que pode editar</strong>. As alterações vão para rascunho e passam pela sua revisão.</p>");
      if (!ok) return "O autor negou. Nada foi alterado.";
      const { flattenBookTree } = await import("../../utils/bookFiles.js");
      const tree = await window.electronAPI.getTree(normalizePath(ctx.state.currentBookPath));
      const files = flattenBookTree(tree, ctx.state.currentBookPath).filter((f) => f.metadata?.aiRead === true && f.metadata?.aiWrite === true && /^(content|assets|notes)\//.test(f.relPath) && !/(^|\/)(index|template|timeline)\.md$/i.test(f.relPath));
      let changed = 0;
      const lines = [];
      for (const f of files.slice(0, 80)) {
        const result = await registry.execute("auto_link_file", { path: f.relPath }, ctx);
        if (!result.isError && /link/i.test(result.output) && !/Nenhum termo/.test(result.output)) changed += 1;
        if (result.isError) lines.push(`${f.relPath}: ${result.output}`);
      }
      return `Link automático feito: ${changed} arquivo(s) com novos links (em rascunho).${lines.length ? ` Avisos: ${lines.slice(0, 5).join(" | ")}` : ""}`;
    },
  });

  registry.register({
    name: "run_analysis",
    description: "Roda a análise do livro (resumos dos arquivos para achar contradições). Gasta tokens: pede a permissão do autor mostrando a estimativa.",
    parameters: { type: "object", properties: {} },
    async execute(_args, ctx) {
      const analysis = ctx.analysis;
      if (!analysis) throw new Error("A análise não está disponível.");
      const pending = await analysis.pending();
      if (pending.files.length === 0) return "Tudo em dia: nenhum arquivo aguarda análise.";
      const ok = await askPermission("Analisar o livro com a IA?", `<p><strong>${pending.files.length}</strong> arquivo(s) serão lidos pela IA (custo estimado: <strong>~${pending.tokens.toLocaleString("pt-BR")} tokens</strong>).</p>`);
      if (!ok) return "O autor negou. Nada foi analisado.";
      analysis.runWithToasts().catch(() => {});
      return "Análise iniciada em segundo plano; o autor acompanha o progresso na Central de Revisões.";
    },
  });

  registry.register({
    name: "set_review_options",
    description: "Liga ou desliga as revisões do sistema deste livro (pendências na Central de Revisões e contador do rodapé) e/ou a correção ortográfica do editor. Pede a permissão do autor.",
    parameters: {
      type: "object",
      properties: {
        reviews: { type: "boolean", description: "Revisões do sistema ligadas?" },
        spelling: { type: "boolean", description: "Correção ortográfica ligada?" },
      },
    },
    async execute({ reviews, spelling }, ctx) {
      const changes = [];
      if (typeof reviews === "boolean") changes.push(`revisões do sistema ${reviews ? "ligadas" : "desligadas"}`);
      if (typeof spelling === "boolean") changes.push(`correção ortográfica ${spelling ? "ligada" : "desligada"}`);
      if (!changes.length) throw new Error("Informe `reviews` e/ou `spelling`.");
      const ok = await askPermission("Alterar as revisões?", `<p>${escapeHtml(changes.join(" e "))}.</p>`);
      if (!ok) return "O autor negou. Nada foi alterado.";
      if (typeof reviews === "boolean") await ctx.issues.setEnabled(reviews);
      if (typeof spelling === "boolean") uiBus.emit("spellcheck:toggle", { value: spelling });
      return `Feito: ${changes.join(" e ")}.`;
    },
  });

  registry.register({
    name: "backup_now",
    description: "Faz um backup dos livros agora, na pasta de backup configurada (Central do Sistema → Backup). Pede a permissão do autor.",
    parameters: { type: "object", properties: {} },
    async execute(_args, ctx) {
      if (!ctx.backup?.configured) {
        openCentral("system", "backup");
        return "Ainda não há pasta de backup. Abri a tela de Backup para o autor escolher uma.";
      }
      const ok = await askPermission("Fazer backup agora?", "<p>Os livros serão copiados (um zip por livro) para a pasta de backup.</p>");
      if (!ok) return "O autor negou. Nenhum backup foi feito.";
      const result = await ctx.backup.runNow();
      return result.success ? `Backup concluído: ${result.count} livro(s).` : `Falha no backup: ${result.error}`;
    },
  });

  // ---------- Skills ----------

  registry.register({
    name: "list_skills",
    description: "Lista as skills disponíveis na biblioteca do autor, cada uma com nome (identificador), título, DESCRIÇÃO (quando usar), tipo (uso único ou recorrente), gatilhos, se é nativa, se pede informações ao autor antes de executar e quantas vezes rodou. Use para escolher a skill certa antes de run_skill.",
    parameters: { type: "object", properties: {} },
    async execute(_args, ctx) {
      const skills = ctx.skills;
      if (!skills) throw new Error("A biblioteca de skills não está disponível.");
      return skills.installed().map((s) => ({ name: s.slug, title: s.title, description: s.description, kind: s.kind, native: Boolean(s.native), triggers: s.triggers, modes: s.modes || [], active: s.kind === "recurring" ? s.enabled : true, asksAuthorForInfo: Boolean(s.inputs?.length), autoRun: s.kind === "recurring" && s.enabled && !s.askBefore, runs: skills.runs(s.slug).length }));
    },
  });

  registry.register({
    name: "run_skill",
    description:
      "Pede para executar uma skill da biblioteca (veja list_skills). A execução começa quando você terminar esta resposta e SEMPRE depende da autorização do autor (uma janela com as tools e a estimativa de tokens), exceto skills recorrentes que ele já configurou para rodar sozinhas. Se a skill pede informações ao autor (asksAuthorForInfo), uma janela mostra os campos para ele preencher: não pergunte você. Não repita o pedido.",
    parameters: { type: "object", properties: { name: { type: "string", description: "Identificador da skill (veja list_skills)." } }, required: ["name"] },
    async execute({ name }, ctx) {
      const skill = ctx.skills?.get(name);
      if (!skill) throw new Error(`Skill "${name}" não existe na biblioteca. Use list_skills.`);
      ctx.skillRunner.requestFromAi(skill);
      return `A skill “${skill.title}” foi pedida: ela roda quando esta resposta terminar, com a autorização do autor.`;
    },
  });
}
