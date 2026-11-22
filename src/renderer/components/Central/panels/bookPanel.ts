// @ts-nocheck
/**
 * @file Central do Livro: dados do livro (nome, modo da IA), visão geral e exclusão. Os dados ficam no `config.json` do livro.
 */

import { normalizePath } from "../../../utils/helpers.js";
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
    label: "Assistente de escrita",
    description:
      "Você escreve; a IA ajuda quando pedida: sugere, revisa e redige trechos que você aprova.",
  },
  {
    id: "coauthor",
    label: "Co-autor",
    description:
      "A IA propõe e escreve capítulos junto com você, passo a passo, perguntando antes das decisões grandes.",
  },
  {
    id: "autonomous",
    label: "Autônomo",
    description:
      "A IA planeja e escreve capítulo a capítulo a partir de um briefing seu, sem pedir confirmação a cada passo. Tudo ainda passa pela sua revisão.",
  },
];

/**
 * Página "Central do Livro".
 * @class
 */
export class BookPanel {
  /**
   * @param {Object} ctx - Contexto da central.
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.title = "Central do Livro";
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
      { id: "data", label: "Dados do livro", icon: "fa-book" },
      { id: "overview", label: "Visão geral", icon: "fa-chart-simple" },
      { id: "export", label: "Exportar", icon: "fa-file-export" },
      { id: "changelog", label: "Changelog", icon: "fa-list-ul" },
      { separator: true },
      { id: "danger", label: "Excluir livro", icon: "fa-trash-can" },
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
        "Dados do livro",
        "Nome do livro e modo de trabalho da IA. Ficam salvos no config.json do livro.",
      ],
      overview: [
        "Visão geral",
        "Quantos arquivos o livro tem e como está a revisão.",
      ],
      export: [
        "Exportar o livro",
        "Leve o livro para fora do app: o projeto inteiro, os capítulos separados ou um único arquivo com o livro todo.",
      ],
      changelog: [
        "Changelog do livro",
        "Tudo o que foi criado, alterado, excluído, restaurado, analisado e lido pela IA neste livro, do mais recente para o mais antigo.",
      ],
      danger: ["Excluir livro", "Apaga o livro inteiro do computador."],
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
        `<div class="cn-empty"><strong>Nenhum livro selecionado.</strong></div>`,
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
      { id: "single", icon: "fa-book", label: "Livro em um único arquivo", description: "Todos os capítulos, na ordem, unificados em um só documento, cada capítulo começando em página nova." },
      { id: "chapters", icon: "fa-file-zipper", label: "Capítulos separados (zip)", description: "Um arquivo por capítulo, numerados na ordem, dentro de um zip." },
      { id: "project", icon: "fa-box-archive", label: "Projeto completo (zip)", description: "Todos os arquivos do livro: capítulos, fichas, notas e configurações. Serve de cópia de segurança. Rascunhos não sincronizados e dados internos do app não entram." },
    ];
    const formats = [
      { id: "md", label: "Markdown", description: "Texto puro (.md), editável em qualquer editor." },
      { id: "docx", label: "Word", description: "Documento do Word (.docx), com formatação." },
      { id: "pdf", label: "PDF", description: "Pronto para ler ou imprimir (A4)." },
    ];
    const card = (name, o, checked) =>
      `<label class="cn-radio-card"><input type="radio" name="${name}" value="${o.id}" ${checked ? "checked" : ""} data-change="${name}" />
        <strong>${o.icon ? `<i class="fa-solid ${o.icon}"></i> ` : ""}${esc(o.label)}</strong><small>${esc(o.description)}</small></label>`;

    const root = mount(
      el,
      `<section class="cn-section">
         <h4>O que exportar</h4>
         <div class="cn-grid">${kinds.map((k, i) => card("export-kind", k, i === 0)).join("")}</div>
       </section>
       <section class="cn-section" id="export-formats">
         <h4>Formato</h4>
         <div class="cn-grid">${formats.map((f, i) => card("export-format", f, i === 0)).join("")}</div>
         <p class="cn-hint" id="export-formats-note" hidden>O projeto completo é exportado como está (os arquivos continuam em Markdown), então não há formato a escolher.</p>
       </section>
       <div class="cn-row"><button class="cn-btn primary" data-act="export-go"><i class="fa-solid fa-file-export"></i> Exportar</button></div>`,
      {
        "export-kind": () => syncFormats(),
        "export-format": () => {},
        "export-go": async (btn) => {
          const kind = root.querySelector('input[name="export-kind"]:checked')?.value;
          const format = root.querySelector('input[name="export-format"]:checked')?.value;
          btn.disabled = true;
          const label = btn.innerHTML;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exportando…';
          try {
            const result = await exportBook({ kind, format }, book.fullPath, book.book_title || book.folderName);
            if (!result?.canceled) this.ctx.toast("Livro exportado.", "success");
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
      const project = root.querySelector('input[name="export-kind"]:checked')?.value === "project";
      root.querySelector("#export-formats").style.opacity = project ? "0.45" : "";
      root.querySelectorAll('input[name="export-format"]').forEach((i) => (i.disabled = project));
      root.querySelector("#export-formats-note").hidden = !project;
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
      `<div class="cn-stats"><div class="cn-stat" title="Espaço em disco usado pelo changelog e pelo conteúdo guardado para rollback"><strong id="changelog-size">…</strong><span id="changelog-size-label">em disco (changelog e rollback)</span></div></div><div class="cn-changelog">${Handlebars.compile(viewerTpl)({})}</div>`,
      {},
    );
    // O changelog guarda o conteúdo de cada versão (para o rollback), então pode ocupar espaço considerável
    window.electronAPI
      .bookDiskStats(normalizePath(this.book.fullPath))
      .then((stats) => {
        const size = root.querySelector("#changelog-size");
        if (size && stats) {
          size.textContent = formatBytes(stats.changelogBytes);
          root.querySelector("#changelog-size-label").textContent = `em disco (changelog e rollback · ${plural(stats.changelogFiles, "arquivo", "arquivos")})`;
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
         <h4>Nome do livro</h4>
         <div class="cn-row">
           <input class="cn-input" id="book-title-input" style="flex:1;min-width:260px" value="${esc(book.book_title || "")}" maxlength="120" />
           <button class="cn-btn primary" data-act="save-title"><i class="fa-solid fa-check"></i> Salvar nome</button>
         </div>
         <p class="cn-hint">Pasta no computador: <strong>${esc(book.folderName)}</strong> (não muda ao renomear o livro).</p>
       </section>
       <section class="cn-section">
         <h4>Modo da IA</h4>
         <p class="cn-hint">Define como o assistente trabalha neste livro. A permissão de cada arquivo (leitura e escrita da IA) continua valendo em todos os modos.</p>
         <div class="cn-grid">${modes}</div>
         <div class="cn-row" style="margin-top:12px"><button class="cn-btn" data-act="open-ai"><i class="fa-solid fa-robot"></i> Abrir a Central de IA</button></div>
       </section>
       <section class="cn-section">
         <h4>Perfil dos templates</h4>
         <p class="cn-hint">Define o modelo de cada ficha e capítulo novo deste livro (assistente, co-autor, autônomo ou um perfil seu). Trocar o perfil não muda o que já foi escrito. Os templates se editam em Central do Sistema → Templates.</p>
         <div class="cn-row">
           <select class="cn-select" id="book-template-profile">${profiles.map((p) => `<option value="${esc(p.id)}" ${p.id === profileId ? "selected" : ""}>${esc(p.label)}${p.builtin ? "" : " (seu)"}</option>`).join("")}</select>
           <button class="cn-btn" data-act="apply-profile"><i class="fa-solid fa-clone"></i> Aplicar ao livro</button>
         </div>
       </section>`,
      {
        "save-title": async () => {
          const value = root.querySelector("#book-title-input").value.trim();
          if (!value)
            return this.ctx.toast("O livro precisa de um nome.", "error");
          const live = this.book ?? book; // a lista de livros pode ter sido recarregada desde o desenho da aba
          live.book_title = value;
          await this.ctx.services.book.updateConfig(live.fullPath);
          uiBus_titleChanged(this.ctx, value, book.fullPath);
          this.ctx.toast("Nome do livro salvo.", "success");
        },
        "open-ai": () => this.ctx.uiBus.emit("central:open", { central: "ai" }),
        "apply-profile": () => {
          const id = root.querySelector("#book-template-profile").value;
          const label = profiles.find((p) => p.id === id)?.label || id;
          confirmModal(this.ctx.uiBus, {
            title: "Aplicar o perfil de templates?",
            confirmText: "Aplicar",
            html: `<p>Os templates de personagem, ambiente, conceito e evento <strong>deste livro</strong> passam a ser os do perfil <strong>${esc(label)}</strong>, e os próximos capítulos nascem com o esboço e a análise dele. Se você tinha editado os templates deste livro, essas edições serão substituídas. Fichas e capítulos que já existem não mudam.</p>`,
            onConfirm: async () => {
              const count = await this.ctx.services.templates.applyToBook(book.fullPath, id);
              const live = this.book ?? book;
              live.template_profile = id;
              await this.ctx.services.book.updateConfig(live.fullPath);
              this.ctx.toast(`Perfil “${label}” aplicado (${count} templates atualizados).`, "success");
            },
          });
        },
        mode: async (input) => {
          const live = this.book ?? book;
          live.ai_mode = input.value;
          await this.ctx.services.book.updateConfig(live.fullPath);
          this.ctx.toast(
            `Modo da IA: ${AI_MODES.find((m) => m.id === input.value)?.label}.`,
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
        <div class="cn-stat"><strong>${disk.files}</strong><span>arquivos no livro (total)</span></div>
        <div class="cn-stat" title="Sem o changelog (histórico e rollback) e os registros do chat"><strong>${formatBytes(disk.bytes)}</strong><span>em disco</span></div>
      </div>
      <div class="cn-stats">
        <div class="cn-stat"><strong>${chapters}</strong><span>${chapters === 1 ? "capítulo" : "capítulos"}</span></div>
        <div class="cn-stat"><strong>${countAll(assets.characters)}</strong><span>personagens</span></div>
        <div class="cn-stat"><strong>${countAll(assets.places)}</strong><span>ambientes</span></div>
        <div class="cn-stat"><strong>${countAll(assets.elements)}</strong><span>conceitos e sistemas</span></div>
        <div class="cn-stat"><strong>${countAll(assets.events)}</strong><span>eventos</span></div>
        <div class="cn-stat"><strong>${countAll(tree?.folders?.notes)}</strong><span>anotações</span></div>
      </div>
      <div class="cn-stats">
        <div class="cn-stat ${drafts ? "warning" : "success"}"><strong>${drafts}</strong><span>${drafts === 1 ? "arquivo aguardando sincronização" : "arquivos aguardando sincronização"}</span></div>
        <div class="cn-stat ${pending.errors ? "error" : pending.total ? "warning" : "success"}"><strong>${pending.total}</strong><span>pendências na Central de Revisões</span></div>
      </div>
      <div class="cn-row"><button class="cn-btn" data-act="open-review"><i class="fa-solid fa-clipboard-check"></i> Abrir a Central de Revisões</button></div>`,
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
         <h4>Excluir "${esc(book.book_title || book.folderName)}"</h4>
         <p class="cn-hint">Todos os arquivos do livro, o histórico (changelog), o chat e as análises serão apagados do computador. <strong>Não há como desfazer.</strong> Faça uma cópia da pasta <strong>${esc(book.folderName)}</strong> antes, se tiver dúvida.</p>
         <label class="cn-field"><span>Para confirmar, digite o nome da pasta (${esc(book.folderName)})</span>
           <input class="cn-input" id="book-delete-confirm" autocomplete="off" data-input="check" /></label>
         <div class="cn-row"><button class="cn-btn danger" id="book-delete-btn" data-act="delete" disabled><i class="fa-solid fa-trash-can"></i> Excluir livro para sempre</button></div>
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
      title: "Excluir o livro?",
      danger: true,
      confirmText: "Excluir definitivamente",
      html: `<p>O livro <strong>${esc(book.book_title || book.folderName)}</strong> será apagado agora.</p><p>Esta ação não pode ser desfeita.</p>`,
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
            throw new Error("Caminho de livro inválido.");
          }
          const result = await window.electronAPI.deleteFolder(book.fullPath);
          if (!result?.success)
            throw new Error(result?.error || "Falha ao excluir o livro.");

          localStorage.removeItem("last_selected_book");
          this.ctx.close();
          clearBook(this.ctx.state);
          await refreshBookList(this.ctx.state, this.ctx.services.book);
          this.ctx.toast("Livro excluído.", "success");
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
