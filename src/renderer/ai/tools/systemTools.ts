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

import { t } from "../../../shared/i18n.js";
import { uiBus } from "../../events/uiBus.js";
import { appSettings } from "../../utils/appSettings.js";
import { normalizePath, escapeHtml } from "../../utils/helpers.js";
import { getUsageReport } from "../usageTracker.js";
import { locateFile } from "./permissions.js";
import { dayOf } from "../../services/productivityService.js";
import guide from "../../../../docs/guia-do-usuario.md?raw";
import guideEn from "../../../../docs/user-guide.en.md?raw";
import { getLanguage } from "../../../shared/i18n.js";

/** Abas de cada central (o que `open_central` aceita). */
const CENTRAL_TABS = {
  issues: ["overview", "links", "spelling", "timeline", "contradictions", "tips"],
  book: ["data", "overview", "export", "changelog", "danger"],
  ai: ["model", "fallback", "usage", "analysis", "debug", "errors", "skills"],
  system: ["general", "update", "appearance", "accessibility", "editor", "productivity", "shortcuts", "templates", "backup"],
};

/**
 * Opções que ficam fora do registro simples (a IA as conhece para orientar o usuário, mas só ele as altera ou usa a tela).
 * Função (e não constante) para traduzir no idioma ativo na hora do uso.
 */
const otherOptions = () => [
  { label: t("Modo da IA do livro (assistente, co-autor, autônomo)"), where: t("Central do Livro → Dados do livro"), central: "book", tab: "data", risk: "c" },
  { label: t("Permissões de leitura e escrita da IA em cada arquivo"), where: t("Dados do arquivo / folder.yml (cadeado no explorer)"), central: null, risk: "c" },
  { label: t("Contas de IA, chaves de API e modelo"), where: t("Central de IA → Contas e modelo"), central: "ai", tab: "model", risk: "c" },
  { label: t("Fallback automático entre contas"), where: t("Central de IA → Fallback de contas"), central: "ai", tab: "fallback", risk: "b" },
  { label: t("Perfil de uso da IA (Mínimo...Ultra) e opções por etapa"), where: t("Central de IA → Perfil e análises"), central: "ai", tab: "analysis", risk: "b" },
  { label: t("Revisões do sistema (liga/desliga) e correção ortográfica"), where: t("Central de Revisões → Resumo / Ortografia"), central: "issues", tab: "overview", risk: "b" },
  { label: t("Excluir o livro"), where: t("Central do Livro → Excluir livro"), central: "book", tab: "danger", risk: "c" },
  { label: t("Desinstalar o app"), where: t("Central do Sistema → Atualização"), central: "system", tab: "update", risk: "c" },
  { label: t("Exportar o livro (zip, capítulos, arquivo único; Markdown, Word, PDF)"), where: t("Central do Livro → Exportar"), central: "book", tab: "export", risk: "a" },
  { label: t("Importar um livro (.zip)"), where: t("Seletor de livros → Importar livro"), central: null, risk: "a" },
  { label: t("Temas de cores e fundo do chat"), where: t("Central do Sistema → Aparência"), central: "system", tab: "appearance", risk: "a" },
  { label: t("Templates das fichas e capítulos (perfis)"), where: t("Central do Sistema → Templates"), central: "system", tab: "templates", risk: "a" },
  { label: t("Atalhos de teclado"), where: t("Central do Sistema → Atalhos"), central: "system", tab: "shortcuts", risk: "a" },
  { label: t("Skills (biblioteca, loja, gatilhos)"), where: t("Central de IA → Skills"), central: "ai", tab: "skills", risk: "b" },
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
      content: `<div class="cn-confirm"><p>${t("A IA pediu para fazer isto:")}</p>${html}</div>`,
      onClose: () => resolve(false),
      buttons: [
        { text: t("Negar"), class: "btn-secondary", onClick: (modal) => (resolve(false), modal.close()) },
        { text: t("Permitir"), class: "btn-primary", onClick: (modal) => (resolve(true), modal.close()) },
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
  for (const line of String(getLanguage() === "en" ? guideEn : guide).split(/\r?\n/)) {
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
    description: t("Abre uma central do app em uma aba específica, para o autor ver ou usar. Centrais e abas: {centrals}. Também serve para orientar: abra a tela onde o autor deve clicar.", {
      centrals: Object.entries(CENTRAL_TABS)
        .map(([central, tabs]) => `${central} (${tabs.join(", ")})`)
        .join("; "),
    }),
    parameters: {
      type: "object",
      properties: {
        central: { type: "string", enum: Object.keys(CENTRAL_TABS), description: t("issues = Revisões, book = Livro, ai = IA, system = Sistema.") },
        tab: { type: "string", description: t("Aba da central (opcional).") },
      },
      required: ["central"],
    },
    async execute({ central, tab }) {
      const tabs = CENTRAL_TABS[central];
      if (!tabs) throw new Error(t("Central desconhecida: {central}.", { central }));
      if (tab && !tabs.includes(tab)) throw new Error(t('Aba desconhecida em "{central}": {tab}. Abas: {tabs}.', { central, tab, tabs: tabs.join(", ") }));
      openCentral(central, tab);
      return tab
        ? t('Central "{central}" aberta na aba "{tab}".', { central, tab })
        : t('Central "{central}" aberta.', { central });
    },
  });

  registry.register({
    name: "open_settings",
    description: t("Abre a gaveta de configurações (menu lateral com atalhos das centrais, tema e correção ortográfica)."),
    parameters: { type: "object", properties: {} },
    async execute() {
      uiBus.emit("settings:open");
      return t("Gaveta de configurações aberta.");
    },
  });

  registry.register({
    name: "open_file_in_editor",
    description: t("Abre (seleciona) um arquivo do livro no editor. Use antes de ações que valem para o arquivo aberto, como `open_file_history`."),
    parameters: { type: "object", properties: { path: { type: "string", description: t("Caminho relativo à raiz do livro (ex.: content/chapter_001/2_draft.md).") } }, required: ["path"] },
    async execute({ path }, ctx) {
      const located = await locateFile(ctx.state, path);
      uiBus.emit("editor:open-file", { path: normalizePath(located.originalPath).replace(/\.temp$/, "") });
      return t('Arquivo "{title}" aberto no editor.', { title: located.title });
    },
  });

  registry.register({
    name: "open_file_history",
    description: t("Abre a janela de histórico de versões do arquivo que está aberto no editor (com restauração). Para outro arquivo, abra-o antes com `open_file_in_editor`."),
    parameters: { type: "object", properties: {} },
    async execute(_args, ctx) {
      if (!ctx.state.currentFilePath) throw new Error(t("Nenhum arquivo aberto no editor. Abra um com open_file_in_editor."));
      uiBus.emit("history:open-modal");
      return t("Janela de histórico aberta.");
    },
  });

  registry.register({
    name: "request_sync",
    description: t("Abre a janela de sincronização para o autor aprovar as alterações pendentes (rascunhos). A IA nunca sincroniza sozinha."),
    parameters: { type: "object", properties: {} },
    async execute(_args, ctx) {
      // Só uma vez por resposta (modelos menores repetiam a chamada em laço)
      if (ctx?.syncRequested) {
        throw new Error(t("A janela de sincronização já foi aberta nesta resposta. Não chame de novo: aguarde o autor."));
      }
      const pending = (await ctx?.fileService?.getPendingTempFiles?.()) || [];
      // Sem rascunhos não há o que sincronizar (e a janela não abre): dizer a verdade evita que a IA espere por nada
      if (pending.length === 0) {
        return t("Não há rascunhos pendentes: nada a sincronizar, e a janela não abriu. Você pode editar arquivos direto, com replace_in_file, append_to_file ou write_file (se a tool não estiver liberada, peça a especificação dela em get_tool_specs).");
      }
      if (ctx) ctx.syncRequested = true;
      uiBus.emit("toolbar:open-sync-modal");
      return t("Janela de sincronização aberta: o autor decide o destino de {count} rascunho(s) pendente(s).", { count: pending.length });
    },
  });

  // ---------- Configurações (a/b/c) ----------

  registry.register({
    name: "list_settings",
    description:
      t("Lista todas as configurações do app que a IA conhece: id, nome, valor atual, onde ficam e a classe (a: a IA altera; b: só com permissão do autor; c: só o autor altera, a IA orienta). Inclui as opções que a IA não pode alterar, para saber orientar o autor. Use para responder “onde mudo X?”."),
    parameters: { type: "object", properties: {} },
    async execute() {
      const settings = appSettings.defs().map((d) => ({
        id: d.id,
        name: d.label,
        value: d.id === "backup.folder" ? (appSettings.get(d.id) ? t("(definida)") : t("(vazia)")) : appSettings.get(d.id),
        type: d.type,
        ...(d.min !== undefined ? { min: d.min, max: d.max } : {}),
        ...(d.type === "select" && d.options.length < 8 ? { options: d.options.map((o) => o.value) } : {}),
        where: d.where,
        class: d.risk,
        help: d.help,
      }));
      return { settings, otherOptions: otherOptions().map((o) => ({ option: o.label, where: o.where, class: o.risk })) };
    },
  });

  registry.register({
    name: "set_setting",
    description:
      t("Altera uma configuração do app pelo id (veja `list_settings`): tema claro/escuro, tamanho da fonte do app, fontes do editor, modo noturno, narrador etc. Classe a: faz na hora; classe b: pede a permissão do autor; classe c: não altera, abre a tela para o autor. Só altere quando o autor pedir."),
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: t("Id da configuração (ex.: ui.theme, ui.zoom, editor.fontSize).") },
        value: { type: "string", description: t('Novo valor (números e sim/não como texto: "120", "true").') },
      },
      required: ["id", "value"],
    },
    async execute({ id, value }) {
      const def = appSettings.def(id);
      if (!def) throw new Error(t("Configuração desconhecida: {id}. Use list_settings.", { id }));
      if (def.risk === "c") {
        openCentral(def.central || "system", def.tab);
        return t('A IA não altera "{label}": é uma opção delicada. Abri a tela ({where}) para você mudar. {help}', { label: def.label, where: def.where, help: def.help });
      }
      if (def.risk === "b") {
        const ok = await askPermission(
          t("Alterar “{label}”?", { label: def.label }),
          `<p>${t("{label} passará a ser {value}.", { label: `<strong>${escapeHtml(def.label)}</strong>`, value: `<strong>${escapeHtml(value)}</strong>` })}</p><p>${escapeHtml(def.help)}</p>`,
        );
        if (!ok) return t("O autor negou a alteração. Nada foi mudado.");
      }
      const result = appSettings.set(id, value);
      return t('"{label}" agora é {result}.', { label: def.label, result });
    },
  });

  registry.register({
    name: "guide_user",
    description:
      t("Orienta o autor em ações delicadas que a IA NÃO faz sozinha (classe c): trocar o modo da IA do livro, mudar permissões de arquivos, contas e chaves de API, excluir livro, desinstalar, escolher pasta de backup. Abre a tela certa e devolve o passo a passo para você explicar."),
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["change-ai-mode", "change-file-permissions", "manage-api-keys", "delete-book", "uninstall", "backup-folder", "change-usage-profile"], description: t("Ação que o autor quer fazer.") },
      },
      required: ["action"],
    },
    async execute({ action }) {
      const steps = {
        "change-ai-mode": ["book", "data", t("Central do Livro → Dados do livro → Modo da IA: escolha assistente, co-autor ou autônomo.")],
        "change-file-permissions": [null, null, t("As permissões de cada arquivo ficam no próprio arquivo (variáveis humanRead, humanWrite, aiRead, aiWrite). O cadeado no explorer mostra arquivos somente leitura; a IA nunca altera as próprias permissões.")],
        "manage-api-keys": ["ai", "model", t("Central de IA → Contas e modelo: adicione uma conta, cole a chave de API (ela nunca é exibida por inteiro) e escolha o modelo.")],
        "delete-book": ["book", "danger", t("Central do Livro → Excluir livro: a exclusão é permanente e pede confirmação.")],
        uninstall: ["system", "update", t("Central do Sistema → Atualização → Desinstalar. Os livros ficam na pasta de livros; dá para exportar uma cópia antes.")],
        "backup-folder": ["system", "backup", t("Central do Sistema → Backup → Escolher pasta. Pode ser uma pasta do Google Drive, OneDrive ou Dropbox instalados.")],
        "change-usage-profile": ["ai", "analysis", t("Central de IA → Perfil e análises: escolha Mínimo, Econômico, Equilibrado, Completo ou Ultra (ou ajuste cada opção).")],
      }[action];
      if (!steps) throw new Error(t("Ação desconhecida: {action}.", { action }));
      if (steps[0]) openCentral(steps[0], steps[1]);
      return steps[0] ? `${steps[2]} ${t("Abri a tela para você.")}` : steps[2];
    },
  });

  // ---------- Consultas (classe a) ----------

  registry.register({
    name: "get_usage_by_model",
    description: t("Uso de tokens e requisições da IA por modelo nos últimos dias (somente leitura)."),
    parameters: { type: "object", properties: { days: { type: "number", description: t("Quantos dias (padrão 7).") } } },
    async execute({ days }) {
      return getUsageReport(Math.min(60, Math.max(1, Number(days) || 7)));
    },
  });

  registry.register({
    name: "get_fallback_info",
    description: t("Mostra a configuração do fallback automático entre contas de IA (ligado/desligado e a ordem das contas). Somente informação: para alterar, o autor usa Central de IA → Fallback de contas."),
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
    description: t("Cronômetro de produtividade: tempo de escrita de hoje, dos últimos 7 dias e total por dia (somente leitura)."),
    parameters: { type: "object", properties: {} },
    async execute(_args, ctx) {
      const service = ctx.productivity;
      if (!service) throw new Error(t("O cronômetro não está disponível."));
      const days = service.dailyTotals();
      const minutes = (ms) => Math.round(ms / 60000);
      return {
        today: minutes(days.find((d) => d.day === dayOf(Date.now()))?.ms || 0),
        unit: t("minutos"),
        byDay: days.slice(-14).map((d) => ({ day: d.day, minutes: minutes(d.ms) })),
        totalMinutes: minutes(days.reduce((s, d) => s + d.ms, 0)),
      };
    },
  });

  registry.register({
    name: "search_book",
    description: t("Procura um texto nos arquivos do livro (título e conteúdo) e devolve os arquivos encontrados com um trecho. Só os arquivos que a IA pode ler."),
    parameters: { type: "object", properties: { query: { type: "string", description: t("Texto a procurar.") } }, required: ["query"] },
    async execute({ query }, ctx) {
      if (!ctx.state.currentBookPath) throw new Error(t("Nenhum livro selecionado."));
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
    description: t("Consulta o guia do usuário do app. Sem `topic`, lista os assuntos; com `topic`, devolve as seções mais relacionadas (palavras-chave). Use para explicar como algo funciona ou onde fica na interface."),
    parameters: { type: "object", properties: { topic: { type: "string", description: t("Assunto ou palavras-chave (ex.: exportar livro, atalhos, templates).") } } },
    async execute({ topic }) {
      const sections = guideSections();
      if (!topic) return sections.map((s) => s.title);
      const words = String(topic).toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const scored = sections
        .map((s) => ({ s, score: words.reduce((n, w) => n + (s.title.toLowerCase().includes(w) ? 5 : 0) + (s.text.toLowerCase().split(w).length - 1), 0) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      if (!scored.length) return t("Nada encontrado no guia para esse assunto. Assuntos disponíveis: {topics}", { topics: sections.map((s) => s.title).join("; ") });
      return scored.map(({ s }) => `## ${s.title}\n${s.text.trim().slice(0, 1800)}`).join("\n\n");
    },
  });

  // ---------- Ações com permissão (classe b) ----------

  registry.register({
    name: "auto_link_book",
    description: t("Faz o link automático em TODOS os arquivos de texto do livro que a IA pode ler e editar (capítulos e fichas), como rascunho para o autor revisar. Pede a permissão do autor."),
    parameters: { type: "object", properties: {} },
    async execute(_args, ctx) {
      if (!ctx.state.currentBookPath) throw new Error(t("Nenhum livro selecionado."));
      const ok = await askPermission(t("Link automático em todo o livro?"), t("<p>A IA vai criar links entre os nomes de fichas encontrados em <strong>todos os arquivos que pode editar</strong>. As alterações vão para rascunho e passam pela sua revisão.</p>"));
      if (!ok) return t("O autor negou. Nada foi alterado.");
      const { flattenBookTree } = await import("../../utils/bookFiles.js");
      const tree = await window.electronAPI.getTree(normalizePath(ctx.state.currentBookPath));
      const files = flattenBookTree(tree, ctx.state.currentBookPath).filter((f) => f.metadata?.aiRead === true && f.metadata?.aiWrite === true && /^(content|assets|notes)\//.test(f.relPath) && !/(^|\/)(index|template|timeline)\.md$/i.test(f.relPath));
      let changed = 0;
      const lines = [];
      for (const f of files.slice(0, 80)) {
        const result = await registry.execute("auto_link_file", { path: f.relPath }, ctx);
        if (!result.isError && /link/i.test(result.output) && !/Nenhum termo|No new term/.test(result.output)) changed += 1;
        if (result.isError) lines.push(`${f.relPath}: ${result.output}`);
      }
      const done = t("Link automático feito: {count} arquivo(s) com novos links (em rascunho).", { count: changed });
      return lines.length ? `${done} ${t("Avisos: {warnings}", { warnings: lines.slice(0, 5).join(" | ") })}` : done;
    },
  });

  registry.register({
    name: "run_analysis",
    description: t("Roda a análise do livro (resumos dos arquivos para achar contradições). Gasta tokens: pede a permissão do autor mostrando a estimativa."),
    parameters: { type: "object", properties: {} },
    async execute(_args, ctx) {
      const analysis = ctx.analysis;
      if (!analysis) throw new Error(t("A análise não está disponível."));
      const pending = await analysis.pending();
      if (pending.files.length === 0) return t("Tudo em dia: nenhum arquivo aguarda análise.");
      const tokens = pending.tokens.toLocaleString(getLanguage() === "en" ? "en-US" : "pt-BR");
      const ok = await askPermission(t("Analisar o livro com a IA?"), t("<p><strong>{count}</strong> arquivo(s) serão lidos pela IA (custo estimado: <strong>~{tokens} tokens</strong>).</p>", { count: pending.files.length, tokens }));
      if (!ok) return t("O autor negou. Nada foi analisado.");
      analysis.runWithToasts().catch(() => {});
      return t("Análise iniciada em segundo plano; o autor acompanha o progresso na Central de Revisões.");
    },
  });

  registry.register({
    name: "set_review_options",
    description: t("Liga ou desliga as revisões do sistema deste livro (pendências na Central de Revisões e contador do rodapé) e/ou a correção ortográfica do editor. Pede a permissão do autor."),
    parameters: {
      type: "object",
      properties: {
        reviews: { type: "boolean", description: t("Revisões do sistema ligadas?") },
        spelling: { type: "boolean", description: t("Correção ortográfica ligada?") },
      },
    },
    async execute({ reviews, spelling }, ctx) {
      const changes = [];
      if (typeof reviews === "boolean") changes.push(reviews ? t("revisões do sistema ligadas") : t("revisões do sistema desligadas"));
      if (typeof spelling === "boolean") changes.push(spelling ? t("correção ortográfica ligada") : t("correção ortográfica desligada"));
      if (!changes.length) throw new Error(t("Informe `reviews` e/ou `spelling`."));
      const summary = changes.length === 2 ? t("{first} e {second}", { first: changes[0], second: changes[1] }) : changes[0];
      const ok = await askPermission(t("Alterar as revisões?"), `<p>${escapeHtml(summary)}.</p>`);
      if (!ok) return t("O autor negou. Nada foi alterado.");
      if (typeof reviews === "boolean") await ctx.issues.setEnabled(reviews);
      if (typeof spelling === "boolean") uiBus.emit("spellcheck:toggle", { value: spelling });
      return t("Feito: {summary}.", { summary });
    },
  });

  registry.register({
    name: "backup_now",
    description: t("Faz um backup dos livros agora, na pasta de backup configurada (Central do Sistema → Backup). Pede a permissão do autor."),
    parameters: { type: "object", properties: {} },
    async execute(_args, ctx) {
      if (!ctx.backup?.configured) {
        openCentral("system", "backup");
        return t("Ainda não há pasta de backup. Abri a tela de Backup para o autor escolher uma.");
      }
      const ok = await askPermission(t("Fazer backup agora?"), t("<p>Os livros serão copiados (um zip por livro) para a pasta de backup.</p>"));
      if (!ok) return t("O autor negou. Nenhum backup foi feito.");
      const result = await ctx.backup.runNow();
      return result.success ? t("Backup concluído: {count} livro(s).", { count: result.count }) : t("Falha no backup: {error}", { error: result.error });
    },
  });

  // ---------- Skills ----------

  registry.register({
    name: "list_skills",
    description: t("Lista as skills disponíveis na biblioteca do autor, cada uma com nome (identificador), título, DESCRIÇÃO (quando usar), tipo (uso único ou recorrente), gatilhos, se é nativa, se pede informações ao autor antes de executar e quantas vezes rodou. Use para escolher a skill certa antes de run_skill."),
    parameters: { type: "object", properties: {} },
    async execute(_args, ctx) {
      const skills = ctx.skills;
      if (!skills) throw new Error(t("A biblioteca de skills não está disponível."));
      return skills.installed().map((s) => ({ name: s.slug, title: s.title, description: s.description, kind: s.kind, native: Boolean(s.native), triggers: s.triggers, modes: s.modes || [], active: s.kind === "recurring" ? s.enabled : true, asksAuthorForInfo: Boolean(s.inputs?.length), autoRun: s.kind === "recurring" && s.enabled && !s.askBefore, runs: skills.runs(s.slug).length }));
    },
  });

  registry.register({
    name: "run_skill",
    description:
      t("Pede para executar uma skill da biblioteca (veja list_skills). A execução começa quando você terminar esta resposta e SEMPRE depende da autorização do autor (uma janela com as tools e a estimativa de tokens), exceto skills recorrentes que ele já configurou para rodar sozinhas. Se a skill pede informações ao autor (asksAuthorForInfo), uma janela mostra os campos para ele preencher: não pergunte você. Não repita o pedido."),
    parameters: { type: "object", properties: { name: { type: "string", description: t("Identificador da skill (veja list_skills).") } }, required: ["name"] },
    async execute({ name }, ctx) {
      const skill = ctx.skills?.get(name);
      if (!skill) throw new Error(t('Skill "{name}" não existe na biblioteca. Use list_skills.', { name }));
      ctx.skillRunner.requestFromAi(skill);
      return t("A skill “{title}” foi pedida: ela roda quando esta resposta terminar, com a autorização do autor.", { title: skill.title });
    },
  });
}
