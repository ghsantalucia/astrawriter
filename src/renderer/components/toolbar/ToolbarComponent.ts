/**
 * @file Componente responsável pela estrutura e lógica reativa da Barra de Ferramentas (Toolbar).
 */

import "./styles.css";
import templateHtml from "./templates/main.hbs?raw";
import { Component } from "../Component.js";
import { initSaveButtonAnimation } from "./animations.js";
import { editableFields } from "../../utils/template.js";
import { normalizePath } from "../../utils/helpers.js";

/**
 * Representa a barra de ferramentas do editor.
 * @class
 * @extends Component
 */
export class ToolbarComponent extends Component {
  declare _chapterMode: any;
  declare _hasPendingChanges: any;
  declare _openPath: any;
  declare _tabPath: any;
  declare _tempListReady: any;
  declare _tempPaths: any;
  declare aiChanges: any;
  declare cleanupAnimation: any;
  declare element: any;
  declare state: any;
  declare uiBus: any;

  /**
   * Cria uma instância do ToolbarComponent.
   * @param {string} selector - Seletor CSS do container alvo no DOM.
   * @param {Object} context - Objeto de infraestrutura (state, uiBus, domainBus).
   * @param {Object|Array|null} [params=null] - Parâmetros dinâmicos opcionais.
   * @param {Component|null} [parent=null] - Componente pai opcional.
   */
  constructor(selector, context, params = null, parent = null) {
    super(selector, context, templateHtml, params, parent);
    this.cleanupAnimation = null;
    /** Arquivos com rascunho (.temp) e arquivo aberto, para o asterisco da guia. */
    this._tempPaths = new Set();
    this._openPath = "";
    /** Arquivos alterados pela IA no modo autônomo (a bolinha das guias do capítulo). */
    this.aiChanges = context.services?.aiChanges;
  }

  /**
   * Inicialização do componente executada após a renderização no DOM.
   * @returns {void}
   */
  onInit() {
    this.initAnimations();
  }

  /**
   * Configura os ouvintes de eventos da UI (`uiBus`) e de interações do usuário no DOM.
   * @returns {void}
   */
  setupListeners() {
    if (!this.uiBus) return;

    //
    this.uiBus.on("book:selected", () => {
      this._tempListReady = false;
      this._hasPendingChanges = false;
    });

    // Trata atualização da lista de temp files
    this.uiBus.on("temp-files:pending-list", (list) => {
      this._tempPaths = new Set(list.map((f) => this.cleanPath(f.path)));
      this.refreshTabDirty();
      this._hasPendingChanges = list.length > 0;
      this._tempListReady = true;
      this.refreshSaveButtonState();
    });

    // Trata atualização da lista de temp files
    this.uiBus.on("temp-file:saved", (path) => {
      this._tempPaths.add(this.cleanPath(path));
      this.refreshTabDirty();
      this._hasPendingChanges = true;
      this.refreshSaveButtonState();
    });

    // O botão de variáveis só fica ativo quando o arquivo aberto possui variáveis (frontmatter `data`);
    // o de histórico, sempre que há um arquivo aberto
    this.uiBus.on("temp-file:deleted", (path) => {
      this._tempPaths.delete(this.cleanPath(path));
      this.refreshTabDirty();
    });
    this.uiBus.on("temp-file:synced", (path) => {
      this._tempPaths.delete(this.cleanPath(path));
      this.refreshTabDirty();
    });

    this.uiBus.on(
      "file:opened",
      ({ metadata, fileName, relativePath, fullPath }) => {
        this._openPath = this.cleanPath(fullPath);
        this.refreshTabDirty();
        const fileRel = String(relativePath || "")
          .split("/")
          .slice(1)
          .join("/");
        // A caneta só aparece se o arquivo tem algo editável (nome ou variáveis) e não é somente leitura
        const canEdit =
          metadata?.humanWrite === true &&
          editableFields(metadata, { title: fileRel.startsWith("notes/") })
            .length > 0;
        if (!this.showChapterTabs(relativePath, fullPath, canEdit)) {
          this.showFileTab(metadata?.title || fileName, canEdit, relativePath);
        }
        this.setHistoryButtonEnabled(true);
        this.setAutolinkButtonEnabled(Boolean(metadata?.humanWrite));
        this.setNarratorEnabled(true);
      },
    );

    // Narrador: o botão mostra ouvir, pausar ou continuar conforme o estado
    this.uiBus.on("narrator:status", ({ status }) => this.setNarratorStatus(status));

    // Arquivos alterados pela IA mudaram (gravação no modo autônomo ou arquivo aberto): as bolinhas das guias acompanham
    this.uiBus.on("ai-changed:updated", () => this.refreshTabDirty());

    // Nenhum arquivo aberto: não há variáveis nem histórico
    this.uiBus.on("editor:reseted", () => {
      this._openPath = "";
      this.refreshTabDirty();
      this.showChapterTabs(null);
      this.showFileTab(null);
      this.setHistoryButtonEnabled(false);
      this.setAutolinkButtonEnabled(false);
      this.setNarratorEnabled(false);
    });

    // Título alterado pelas variáveis: a guia acompanha
    this.uiBus.on("file:variables-changed", ({ metadata }) => {
      if (metadata?.title && !this._chapterMode) this.showFileTab(metadata.title);
    });

    // Menu de exportação: abre pelo botão e fecha ao escolher, clicar fora ou apertar Esc
    this.uiBus.on("export:toggle-menu", () => this.toggleExportMenu());
    this.uiBus.on("export:file", () => this.closeExportMenu());
    document.addEventListener("mousedown", (e) => {
      if (!(e.target as Element).closest?.(".export-wrap")) this.closeExportMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.closeExportMenu();
    });

    // Exibe status de salvamento do arquivo aberto no editor
    this.uiBus.on("toolbar:save-status", (status) => {
      this.setSaveStatus(status);
    });

    //
    this.uiBus.on("book:ai-locked", () => {
      if (this._tempListReady) this.refreshSaveButtonState();
    });
    //
    this.uiBus.on("book:ai-unlocked", () => {
      if (this._tempListReady) this.refreshSaveButtonState();
    });

    // Evento do botão de sincronização/salvamento na barra de ferramentas
    const btnSave = this.element?.querySelector("#btn-save");
    if (btnSave) {
      btnSave.addEventListener("click", () => {
        if (!btnSave.disabled) {
          this.handleSyncClick();
        }
      });
    }
  }

  /**
   * Habilita ou desabilita o botão do narrador (precisa de um arquivo aberto).
   * @param {boolean} enabled - Se há arquivo aberto.
   * @returns {void}
   */
  setNarratorEnabled(enabled) {
    const btn = this.element?.querySelector("#btn-narrator");
    if (btn) btn.disabled = !enabled;
  }

  /**
   * Atualiza o rótulo e o ícone do botão do narrador.
   * @param {"stopped"|"playing"|"paused"} status - Estado da leitura.
   * @returns {void}
   */
  setNarratorStatus(status) {
    const icon = this.element?.querySelector("#narrator-icon");
    const btn = this.element?.querySelector("#btn-narrator");
    if (!icon || !btn) return;
    icon.className = `fa-solid ${status === "playing" ? "fa-pause" : status === "paused" ? "fa-play" : "fa-volume-high"}`;
    // Só o ícone na barra; o que ele faz aparece na dica
    const text = status === "playing" ? "Pausar a leitura" : status === "paused" ? "Continuar a leitura" : "Ouvir o arquivo aberto em voz alta (Ctrl+Shift+O)";
    btn.title = text;
    btn.setAttribute("aria-label", text);
    this.element.querySelector("#btn-narrator-stop")?.classList.toggle("hidden", status === "stopped");
  }

  /**
   * Habilita ou desabilita o botão de link automático (exige um arquivo editável aberto).
   * @param {boolean} enabled - Se o arquivo aberto aceita edição.
   * @returns {void}
   */
  setAutolinkButtonEnabled(enabled) {
    const btn = this.element?.querySelector("#btn-autolink");
    if (btn) btn.disabled = !enabled;
  }

  /**
   * Habilita ou desabilita o botão de histórico de versões.
   * @param {boolean} enabled - Se há um arquivo aberto.
   * @returns {void}
   */
  setHistoryButtonEnabled(enabled) {
    const btn = this.element?.querySelector("#btn-history");
    if (btn) btn.disabled = !enabled;
    // O botão de exportar segue o mesmo estado (exige um arquivo aberto)
    const exportBtn = this.element?.querySelector("#btn-export");
    if (exportBtn) exportBtn.disabled = !enabled;
    if (!enabled) this.closeExportMenu();
  }

  /**
   * Abre ou fecha o menu de exportação.
   * @param {boolean} [force] - Estado desejado (padrão: alterna).
   * @returns {void}
   */
  toggleExportMenu(force?) {
    const menu = this.element?.querySelector("#export-menu");
    const btn = this.element?.querySelector("#btn-export");
    if (!menu || !btn || btn.disabled) return;
    const open = force ?? menu.classList.contains("hidden");
    menu.classList.toggle("hidden", !open);
    btn.setAttribute("aria-expanded", String(open));
  }

  /**
   * Fecha o menu de exportação.
   * @returns {void}
   */
  closeExportMenu() {
    this.toggleExportMenu(false);
  }

  /**
   * Caminho do arquivo oficial (normalizado, sem `.temp`) para comparar rascunhos.
   * @param {string} path - Caminho.
   * @returns {string}
   * @private
   */
  cleanPath(path) {
    return normalizePath(path || "")
      .replace(/\.temp$/, "")
      .toLowerCase();
  }

  /**
   * Mostra o asterisco na guia quando o arquivo aberto tem rascunho (como no explorer).
   * @returns {void}
   */
  refreshTabDirty() {
    // Arquivos alterados pela IA (modo autônomo), em caminho absoluto minúsculo para comparar com as guias
    const book = String(this.state?.currentBookPath || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    const aiChanged = new Set((this.aiChanges?.list() || []).map((rel) => `${book}/${rel}`.toLowerCase()));
    // Guias do capítulo: cada uma mostra o asterisco do próprio arquivo e a bolinha de "alterado pela IA"
    this.element?.querySelectorAll(".chapter-tab").forEach((tab) => {
      const path = this.cleanPath(tab.dataset.absolutePath);
      tab
        .querySelector(".file-tab-dirty")
        ?.classList.toggle("hidden", !(path && this._tempPaths.has(path)));
      tab.querySelector(".ai-dot")?.classList.toggle("hidden", !(path && aiChanged.has(path)));
    });
    const mark = this.element?.querySelector("#file-tab-dirty");
    mark?.classList.toggle(
      "hidden",
      !(this._openPath && this._tempPaths.has(this._openPath)),
    );
  }

  /**
   * Mostra (ou esconde) a guia do arquivo aberto. O nome é o mesmo exibido no explorer e é cortado com reticências
   * quando não cabe (a largura da guia é fixa).
   * @param {string|null} title - Nome do arquivo; null esconde a guia.
   * @param {boolean} [canEdit] - Se a caneta (editar dados) deve aparecer; omitido mantém o estado atual.
   * @param {string} [relativePath] - Caminho relativo do arquivo no disco (dica ao passar o mouse); omitido mantém o atual.
   * @returns {void}
   */
  showFileTab(title, canEdit?, relativePath?) {
    const tab = this.element?.querySelector("#file-tab");
    if (!tab) return;
    tab.classList.toggle("hidden", !title || this._chapterMode);
    if (!title) return;
    if (canEdit !== undefined) {
      this.element
        .querySelector("#file-tab-edit")
        ?.classList.toggle("hidden", !canEdit);
    }
    const name = this.element.querySelector("#file-tab-name");
    name.textContent = title;
    // Ao passar o mouse: caminho relativo do arquivo real no disco (o nome exibido pode ser diferente do arquivo)
    if (relativePath !== undefined) this._tabPath = relativePath;
    tab.title = this._tabPath || title;
  }

  /**
   * Mostra as guias do capítulo (Manuscrito, Esboço e Análise) quando o arquivo aberto é um dos três arquivos de um
   * capítulo. A guia do arquivo aberto fica expandida (nome e caneta) e as outras encolhem para só o ícone.
   * @param {string|null} relativePath - Caminho do arquivo aberto relativo à pasta dos livros; null esconde as guias.
   * @param {string} [fullPath] - Caminho absoluto do arquivo aberto.
   * @param {boolean} [canEdit] - Se a caneta (editar dados) deve aparecer na guia ativa.
   * @returns {boolean} Se o arquivo é de um capítulo (e as guias foram mostradas).
   */
  showChapterTabs(relativePath, fullPath?, canEdit?) {
    const box = this.element?.querySelector("#chapter-tabs");
    if (!box) return false;
    const match = String(relativePath || "").match(/(?:^|\/)content\/chapter_\d+\/(1_outline|2_draft|3_analysis)\.md$/i);
    this._chapterMode = Boolean(match);
    box.classList.toggle("hidden", !match);
    if (!match) return false;

    this.element.querySelector("#file-tab")?.classList.add("hidden");
    const full = normalizePath(fullPath || "").replace(/\.temp$/, "");
    const dir = full.split("/").slice(0, -1).join("/");
    const relDir = String(relativePath).split("/").slice(0, -1).join("/");
    const active = match[1].toLowerCase();
    box.querySelectorAll(".chapter-tab").forEach((tab) => {
      const isActive = tab.dataset.file.toLowerCase() === `${active}.md`;
      tab.dataset.absolutePath = `${dir}/${tab.dataset.file}`;
      tab.dataset.path = `${relDir}/${tab.dataset.file}`;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
      tab.querySelector(".chapter-tab-edit")?.classList.toggle("hidden", !(isActive && canEdit));
    });
    this.refreshTabDirty();
    return true;
  }

  /**
   * Inicializa a animação visual do botão de salvar/sincronizar.
   * @returns {void}
   */
  initAnimations() {
    const btnSave = this.element?.querySelector("#btn-save");
    if (btnSave && typeof initSaveButtonAnimation === "function") {
      if (typeof this.cleanupAnimation === "function") {
        this.cleanupAnimation();
      }
      this.cleanupAnimation = (initSaveButtonAnimation as any)(btnSave);
    }
  }

  /**
   * Dispara a solicitação para abertura do modal de sincronização de alterações pendentes.
   * @returns {void}
   */
  handleSyncClick() {
    this.uiBus.emit("toolbar:open-sync-modal");
  }

  /**
   * Centraliza a regra de ativação/desativação do botão Salvar/Sincronizar.
   * @returns {void}
   */
  refreshSaveButtonState() {
    const btnSave = this.element?.querySelector("#btn-save");
    if (!btnSave) return;

    // Verifica se o arquivo atualmente focado no editor é somente leitura
    const isReadOnly = this.state?.currentFileMetadata
      ? !this.state.currentFileMetadata.humanWrite
      : false;

    // Habilita o botão apenas se o editor permitir escrita E houver arquivos .temp no projeto
    btnSave.disabled =
      isReadOnly ||
      !this._hasPendingChanges ||
      this.state.currentBookMetadata?.ai_lock;
  }

  /**
   * Atualiza o status do salvamento automático, exibido no rodapé do editor (um ponto colorido e um texto discreto).
   * @param {"unsaved"|"saving"|"saved"|"synced"|"hidden"} status - O estado atual do salvamento.
   * @returns {void}
   */
  setSaveStatus(status) {
    const statusEl = document.getElementById("save-status-indicator");
    if (!statusEl) return;

    const texts = {
      unsaved: "Alterações pendentes…",
      saving: "Salvando rascunho…",
      saved: "Rascunho salvo",
      synced: "Sincronizado",
      hidden: "",
    };

    statusEl.className = `save-status ${status}`;
    const textEl = statusEl.querySelector(".status-text");
    if (textEl) textEl.textContent = texts[status] ?? "";
  }
}
