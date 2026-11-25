/**
 * @file Central do Livro: dados do livro (nome, modo da IA), visão geral e exclusão. Os dados ficam no `config.json` do livro.
 */

import { normalizePath } from "../../../utils/helpers.js";
import { t } from "../../../../shared/i18n.js";
import {
  refreshBookList,
  clearBook,
} from "../../../controllers/handlers/bookHandler.js";
import Handlebars from "handlebars";
import viewerTpl from "../../Modal/templates/changelogViewer.hbs?raw";
import { mountChangelogList } from "../../../controllers/handlers/logViewerHandler.js";
import { confirmModal, esc, formatBytes, mount, plural } from "./panelKit.js";
import { exportBook } from "../../../controllers/handlers/exportHandler.js";

/** Modos de trabalho da IA no livro. */
export const AI_MODES = [
  {
    id: "assistant",
    label: t("Assistente de escrita"),
    description:
      t("Você escreve; a IA ajuda quando pedida: sugere, revisa e redige trechos que você aprova."),
  },
  {
    id: "coauthor",
    label: t("Co-autor"),
    description:
      t("A IA propõe e escreve capítulos junto com você, passo a passo, perguntando antes das decisões grandes."),
  },
  {
    id: "autonomous",
    label: t("Autônomo"),
    description:
      t("A IA planeja e escreve capítulo a capítulo a partir de um briefing seu, sem pedir confirmação a cada passo. Tudo ainda passa pela sua revisão."),
  },
];

/**
 * Página "Central do Livro".
 * @class
 */
export class BookPanel {
  declare ctx: any;
  declare title: any;

  /**
   * @param {Object} ctx - Contexto da central.
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.title = t("Central do Livro");
  }

  /** @returns {Object|undefined} Livro atual na lista de livros (config.json + pasta). */
  get book() {
    const path = normalizePath(this.ctx.state.currentBookPath || "");
    return (this.ctx.state.bookList || []).find(
      (b) => normalizePath(b.fullPath) === path,
    );
  }

  /**
   * Abas laterais.
   * @returns {Array<Object>}
   */
  getTabs() {
    return [
      { id: "data", label: t("Dados do livro"), icon: "fa-book" },
      { id: "overview", label: t("Visão geral"), icon: "fa-chart-simple" },
      { id: "export", label: t("Exportar"), icon: "fa-file-export" },
      { id: "changelog", label: t("Changelog"), icon: "fa-list-ul" },
      { separator: true },
      { id: "danger", label: t("Excluir livro"), icon: "fa-trash-can" },
    ];
  }

  /**
   * Subtítulo e texto de apoio.
   * @param {string} tab - Aba.
   * @returns {{subtitle: string, lead: string}}
   */
  getHeader(tab) {
    const titles = {
      data: [
        t("Dados do livro"),
        t("Nome do livro e modo de trabalho da IA. Ficam salvos no config.json do livro."),
      ],
      overview: [
        t("Visão geral"),
        t("Quantos arquivos o livro tem e como está a revisão."),
      ],
      export: [
        t("Exportar o livro"),
        t("Leve o livro para fora do app: o projeto inteiro, os capítulos separados ou um único arquivo com o livro todo."),
      ],
      changelog: [
        t("Changelog do livro"),
        t("Tudo o que foi criado, alterado, excluído, restaurado, analisado e lido pela IA neste livro, do mais recente para o mais antigo."),
      ],
      danger: [t("Excluir livro"), t("Apaga o livro inteiro do computador.")],
    };
    const [subtitle, lead] = titles[tab] || ["", ""];
    return { subtitle, lead };
  }

  /**
   * Desenha a aba.
   * @param {string} tab - Aba.
   * @param {HTMLElement} el - Contêiner.
   * @returns {Promise<void>}
   */
  async render(tab, el) {
    if (!this.book) {
      mount(
        el,
        `<div class="cn-empty"><strong>${t("Nenhum livro selecionado.")}</strong></div>`,
      );
      return;
    }
    if (tab === "data") return this.renderData(el);
    if (tab === "overview") return this.renderOverview(el);
    if (tab === "changelog") return this.renderChangelog(el);
    if (tab === "export") return this.renderExport(el);
    if (tab === "danger") return this.renderDanger(el);
  }

  /**
   * Exportação do livro: o que exportar (projeto, capítulos ou arquivo único) e em que formato.
   * @param {HTMLElement} el - Contêiner.
   * @returns {void}
   * @private
   */
  renderExport(el) {
    const book = this.book;
    const kinds = [
      { id: "single", icon: "fa-book", label: t("Livro em um único arquivo"), description: t("Todos os capítulos, na ordem, unificados em um só documento, cada capítulo começando em página nova.") },
      { id: "chapters", icon: "fa-file-zipper", label: t("Capítulos separados (zip)"), description: t("Um arquivo por capítulo, numerados na ordem, dentro de um zip.") },
      { id: "project", icon: "fa-box-archive", label: t("Projeto completo (zip)"), description: t("Todos os arquivos do livro: capítulos, fichas, notas e configurações. Serve de cópia de segurança. Rascunhos não sincronizados e dados internos do app não entram.") },
    ];
    const formats = [
      { id: "md", label: "Markdown", description: t("Texto puro (.md), editável em qualquer editor.") },
      { id: "docx", label: "Word", description: t("Documento do Word (.docx), com formatação.") },
      { id: "pdf", label: "PDF", description: t("Pronto para ler ou imprimir (A4).") },
    ];
    const card = (name, o, checked) =>
      `<label class="cn-radio-card"><input type="radio" name="${name}" value="${o.id}" ${checked ? "checked" : ""} data-change="${name}" />
        <strong>${o.icon ? `<i class="fa-solid ${o.icon}"></i> ` : ""}${esc(o.label)}</strong><small>${esc(o.description)}</small></label>`;

    const root = mount(
      el,
      `<section class="cn-section">
         <h4>${t("O que exportar")}</h4>
         <div class="cn-grid">${kinds.map((k, i) => card("export-kind", k, i === 0)).join("")}</div>
       </section>
       <section class="cn-section" id="export-formats">
         <h4>${t("Formato")}</h4>
         <div class="cn-grid">${formats.map((f, i) => card("export-format", f, i === 0)).join("")}</div>
         <p class="cn-hint" id="export-formats-note" hidden>${t("O projeto completo é exportado como está (os arquivos continuam em Markdown), então não há formato a escolher.")}</p>
       </section>
       <div class="cn-row"><button class="cn-btn primary" data-act="export-go"><i class="fa-solid fa-file-export"></i> ${t("Exportar")}</button></div>`,
      {
        "export-kind": () => syncFormats(),
        "export-format": () => {},
        "export-go": async (btn) => {
          const kind = (root.querySelector('input[name="export-kind"]:checked') as HTMLInputElement | null)?.value;
          const format = (root.querySelector('input[name="export-format"]:checked') as HTMLInputElement | null)?.value;
          btn.disabled = true;
          const label = btn.innerHTML;
          btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${t("Exportando…")}`;
          try {
            const result = await exportBook({ kind, format }, book.fullPath, book.book_title || book.folderName);
            if (!result?.canceled) this.ctx.toast(t("Livro exportado."), "success");
          } catch (error) {
            this.ctx.toast(error.message, "error");
          } finally {
            btn.disabled = false;
            btn.innerHTML = label;
          }
        },
      },
    );
    // O projeto completo não tem formato: a seção fica desativada
    const syncFormats = () => {
      const project = (root.querySelector('input[name="export-kind"]:checked') as HTMLInputElement | null)?.value === "project";
      (root.querySelector("#export-formats") as HTMLInputElement).style.opacity = project ? "0.45" : "";
      root.querySelectorAll<HTMLInputElement>('input[name="export-format"]').forEach((i) => (i.disabled = project));
      (root.querySelector("#export-formats-note") as HTMLInputElement).hidden = !project;
    };
  }

  /**
   * Changelog do livro (a mesma lista corrida das Configurações, com rolagem infinita).
   * @param {HTMLElement} el - Contêiner.
   * @returns {void}
   * @private
   */
  renderChangelog(el) {
    const root = mount(
      el,
      `<div class="cn-stats"><div class="cn-stat" title="${t("Espaço em disco usado pelo changelog e pelo conteúdo guardado para rollback")}"><strong id="changelog-size">…</strong><span id="changelog-size-label">${t("em disco (changelog e rollback)")}</span></div></div><div class="cn-changelog">${Handlebars.compile(viewerTpl)({})}</div>`,
      {},
    );
    // O changelog guarda o conteúdo de cada versão (para o rollback), então pode ocupar espaço considerável
    window.electronAPI
      .bookDiskStats(normalizePath(this.book.fullPath))
      .then((stats) => {
        const size = root.querySelector("#changelog-size");
        if (size && stats) {
          size.textContent = formatBytes(stats.changelogBytes);
          root.querySelector("#changelog-size-label").textContent = t("em disco (changelog e rollback · {files})", { files: plural(stats.changelogFiles, "arquivo", "arquivos") });
        }
      });
    // A lista rola dentro da própria área (o carregamento do próximo arquivo de log depende dessa rolagem)
    mountChangelogList(root, this.ctx.services.changelog);
  }

  /**
   * Nome e modo da IA.
   * @param {HTMLElement} el - Contêiner.
   * @returns {void}
   * @private
   */
  async renderData(el) {
    const book = this.book;
    const mode = book.ai_mode || "assistant";
    const profiles = await window.electronAPI.templates.profiles().catch(() => []);
    if (this.ctx.currentTab() !== "data") return;
    const profileId = book.template_profile || "assistant";
    const modes = AI_MODES.map(
      (m) => `<label class="cn-radio-card">
        <input type="radio" name="ai-mode" value="${m.id}" ${m.id === mode ? "checked" : ""} data-change="mode" />
        <strong>${esc(m.label)}</strong><small>${esc(m.description)}</small></label>`,
    ).join("");

    const root = mount(
      el,
      `<section class="cn-section">
         <h4>${t("Nome do livro")}</h4>
         <div class="cn-row">
           <input class="cn-input" id="book-title-input" style="flex:1;min-width:260px" value="${esc(book.book_title || "")}" maxlength="120" />
           <button class="cn-btn primary" data-act="save-title"><i class="fa-solid fa-check"></i> ${t("Salvar nome")}</button>
         </div>
         <p class="cn-hint">${t("Pasta no computador: <strong>{folder}</strong> (não muda ao renomear o livro).", { folder: esc(book.folderName) })}</p>
       </section>
       <section class="cn-section">
         <h4>${t("Modo da IA")}</h4>
         <p class="cn-hint">${t("Define como o assistente trabalha neste livro. A permissão de cada arquivo (leitura e escrita da IA) continua valendo em todos os modos.")}</p>
         <div class="cn-grid">${modes}</div>
         <div class="cn-row" style="margin-top:12px"><button class="cn-btn" data-act="open-ai"><i class="fa-solid fa-robot"></i> ${t("Abrir a Central de IA")}</button></div>
       </section>
       <section class="cn-section">
         <h4>${t("Perfil dos templates")}</h4>
         <p class="cn-hint">${t("Define o modelo de cada ficha e capítulo novo deste livro (assistente, co-autor, autônomo ou um perfil seu). Trocar o perfil não muda o que já foi escrito. Para editar os modelos, use o botão ao lado.")}</p>
         <div class="cn-row">
           <select class="cn-select" id="book-template-profile">${profiles.map((p) => `<option value="${esc(p.id)}" ${p.id === profileId ? "selected" : ""}>${esc(p.label)}${p.builtin ? "" : ` ${t("(seu)")}`}</option>`).join("")}</select>
           <button class="cn-btn" data-act="apply-profile"><i class="fa-solid fa-clone"></i> ${t("Aplicar ao livro")}</button>
           <button class="cn-btn" data-act="open-templates"><i class="fa-solid fa-pen-ruler"></i> ${t("Editar os templates")}</button>
         </div>
       </section>`,
      {
        "save-title": async () => {
          const value = (root.querySelector("#book-title-input") as HTMLInputElement).value.trim();
          if (!value)
            return this.ctx.toast(t("O livro precisa de um nome."), "error");
          const live = this.book ?? book; // a lista de livros pode ter sido recarregada desde o desenho da aba
          live.book_title = value;
          await this.ctx.services.book.updateConfig(live.fullPath);
          uiBus_titleChanged(this.ctx, value, book.fullPath);
          this.ctx.toast(t("Nome do livro salvo."), "success");
        },
        "open-templates": () => this.ctx.uiBus.emit("central:open", { central: "system", tab: "templates" }),
        "open-ai": () => this.ctx.uiBus.emit("central:open", { central: "ai" }),
        "apply-profile": () => {
          const id = (root.querySelector("#book-template-profile") as HTMLInputElement).value;
          const label = profiles.find((p) => p.id === id)?.label || id;
          confirmModal(this.ctx.uiBus, {
            title: t("Aplicar o perfil de templates?"),
            confirmText: t("Aplicar"),
            html: `<p>${t("Os templates de personagem, ambiente, conceito e evento <strong>deste livro</strong> passam a ser os do perfil <strong>{label}</strong>, e os próximos capítulos nascem com o esboço e a análise dele. Se você tinha editado os templates deste livro, essas edições serão substituídas. Fichas e capítulos que já existem não mudam.", { label: esc(label) })}</p>`,
            onConfirm: async () => {
              const count = await this.ctx.services.templates.applyToBook(book.fullPath, id);
              const live = this.book ?? book;
              live.template_profile = id;
              await this.ctx.services.book.updateConfig(live.fullPath);
              this.ctx.toast(t("Perfil “{label}” aplicado ({count} templates atualizados).", { label, count }), "success");
            },
          });
        },
        mode: async (input) => {
          const live = this.book ?? book;
          live.ai_mode = input.value;
          await this.ctx.services.book.updateConfig(live.fullPath);
          this.ctx.toast(
            t("Modo da IA: {mode}.", { mode: AI_MODES.find((m) => m.id === input.value)?.label }),
            "success",
          );
        },
      },
    );
  }

  /**
   * Números do livro.
   * @param {HTMLElement} el - Contêiner.
   * @returns {Promise<void>}
   * @private
   */
  async renderOverview(el) {
    const tree = await window.electronAPI.getTree(
      normalizePath(this.book.fullPath),
    );
    const count = (node) =>
      Object.keys(node?.files || {}).filter(
        (k) => k !== "index" && k !== "template",
      ).length;
    const countAll = (node) =>
      count(node) +
      Object.entries(node?.folders || {}).reduce(
        (sum, [n, f]) => (n.startsWith(".") ? sum : sum + countAll(f)),
        0,
      );
    const chapters = Object.keys(tree?.folders?.content?.folders || {}).filter(
      (n) => /^chapter_/i.test(n),
    ).length;
    const assets = tree?.folders?.assets?.folders || {};
    const pending = this.ctx.services.issues.summary();
    const drafts = (await this.ctx.services.file.getPendingTempFiles()).length;
    const disk = (await window.electronAPI.bookDiskStats(
      normalizePath(this.book.fullPath),
    )) || { files: 0, bytes: 0, chatlogBytes: 0 };

    mount(
      el,
      `<div class="cn-stats">
        <div class="cn-stat"><strong>${disk.files}</strong><span>${t("arquivos no livro (total)")}</span></div>
        <div class="cn-stat" title="${t("Sem o changelog (histórico e rollback) e os registros do chat")}"><strong>${formatBytes(disk.bytes)}</strong><span>${t("em disco")}</span></div>
      </div>
      <div class="cn-stats">
        <div class="cn-stat"><strong>${chapters}</strong><span>${chapters === 1 ? t("capítulo") : t("capítulos")}</span></div>
        <div class="cn-stat"><strong>${countAll(assets.characters)}</strong><span>${t("personagens")}</span></div>
        <div class="cn-stat"><strong>${countAll(assets.places)}</strong><span>${t("ambientes")}</span></div>
        <div class="cn-stat"><strong>${countAll(assets.elements)}</strong><span>${t("conceitos e sistemas")}</span></div>
        <div class="cn-stat"><strong>${countAll(assets.events)}</strong><span>${t("eventos")}</span></div>
        <div class="cn-stat"><strong>${countAll(tree?.folders?.notes)}</strong><span>${t("anotações")}</span></div>
      </div>
      <div class="cn-stats">
        <div class="cn-stat ${drafts ? "warning" : "success"}"><strong>${drafts}</strong><span>${drafts === 1 ? t("arquivo aguardando sincronização") : t("arquivos aguardando sincronização")}</span></div>
        <div class="cn-stat ${pending.errors ? "error" : pending.total ? "warning" : "success"}"><strong>${pending.total}</strong><span>${t("pendências na Central de Revisões")}</span></div>
      </div>
      <div class="cn-row"><button class="cn-btn" data-act="open-review"><i class="fa-solid fa-clipboard-check"></i> ${t("Abrir a Central de Revisões")}</button></div>`,
      {
        "open-review": () =>
          this.ctx.uiBus.emit("central:open", { central: "issues" }),
      },
    );
  }

  /**
   * Exclusão do livro.
   * @param {HTMLElement} el - Contêiner.
   * @returns {void}
   * @private
   */
  renderDanger(el) {
    const book = this.book;
    mount(
      el,
      `<section class="cn-section cn-danger-zone">
         <h4>${t("Excluir \"{name}\"", { name: esc(book.book_title || book.folderName) })}</h4>
         <p class="cn-hint">${t("Todos os arquivos do livro, o histórico (changelog), o chat e as análises serão apagados do computador. <strong>Não há como desfazer.</strong> Faça uma cópia da pasta <strong>{folder}</strong> antes, se tiver dúvida.", { folder: esc(book.folderName) })}</p>
         <label class="cn-field"><span>${t("Para confirmar, digite o nome da pasta ({folder})", { folder: esc(book.folderName) })}</span>
           <input class="cn-input" id="book-delete-confirm" autocomplete="off" data-input="check" /></label>
         <div class="cn-row"><button class="cn-btn danger" id="book-delete-btn" data-act="delete" disabled><i class="fa-solid fa-trash-can"></i> ${t("Excluir livro para sempre")}</button></div>
       </section>`,
      {
        check: (input) => {
          el.querySelector("#book-delete-btn").disabled =
            input.value.trim() !== book.folderName;
        },
        delete: () => this.askDelete(book),
      },
    );
  }

  /**
   * Última confirmação e exclusão do livro.
   * @param {Object} book - Livro.
   * @returns {void}
   * @private
   */
  askDelete(book) {
    confirmModal(this.ctx.uiBus, {
      title: t("Excluir o livro?"),
      danger: true,
      confirmText: t("Excluir definitivamente"),
      html: `<p>${t("O livro <strong>{name}</strong> será apagado agora.", { name: esc(book.book_title || book.folderName) })}</p><p>${t("Esta ação não pode ser desfeita.")}</p>`,
      onConfirm: async () => {
        try {
          const paths = await window.electronAPI.getPaths();
          const books = normalizePath(paths.booksDir).replace(/\/+$/, "");
          const target = normalizePath(book.fullPath).replace(/\/+$/, "");
          // Só apaga pastas que estão diretamente dentro da pasta de livros
          if (
            target.slice(0, books.length + 1).toLowerCase() !==
              `${books}/`.toLowerCase() ||
            target.slice(books.length + 1).includes("/")
          ) {
            throw new Error(t("Caminho de livro inválido."));
          }
          const result = await window.electronAPI.deleteFolder(book.fullPath);
          if (!result?.success)
            throw new Error(result?.error || t("Falha ao excluir o livro."));

          localStorage.removeItem("last_selected_book");
          this.ctx.close();
          clearBook(this.ctx.state);
          await refreshBookList(this.ctx.state, this.ctx.services.book);
          this.ctx.toast(t("Livro excluído."), "success");
        } catch (error) {
          this.ctx.toast(error.message, "error");
        }
      },
    });
  }
}

/**
 * Avisa a interface que o nome do livro mudou.
 * @param {Object} ctx - Contexto da central.
 * @param {string} title - Novo nome.
 * @param {string} path - Caminho do livro.
 * @returns {void}
 */
function uiBus_titleChanged(ctx, title, path) {
  ctx.uiBus.emit("book:title", { title, filePath: path });
  ctx.uiBus.emit("books:refresh-list");
}
