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
        this.showFileTab(metadata?.title || fileName, canEdit, relativePath);
        this.setHistoryButtonEnabled(true);
        this.setAutolinkButtonEnabled(Boolean(metadata?.humanWrite));
      },
    );

    // Nenhum arquivo aberto: não há variáveis nem histórico
    this.uiBus.on("editor:reseted", () => {
      this._openPath = "";
      this.refreshTabDirty();
      this.showFileTab(null);
      this.setHistoryButtonEnabled(false);
      this.setAutolinkButtonEnabled(false);
    });

    // Título alterado pelas variáveis: a guia acompanha
    this.uiBus.on("file:variables-changed", ({ metadata }) => {
      if (metadata?.title) this.showFileTab(metadata.title);
    });

    // Menu de exportação: abre pelo botão e fecha ao escolher, clicar fora ou apertar Esc
    this.uiBus.on("export:toggle-menu", () => this.toggleExportMenu());
    this.uiBus.on("export:file", () => this.closeExportMenu());
    document.addEventListener("mousedown", (e) => {
      if (!e.target.closest?.(".export-wrap")) this.closeExportMenu();
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
  toggleExportMenu(force) {
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
  showFileTab(title, canEdit, relativePath) {
    const tab = this.element?.querySelector("#file-tab");
    if (!tab) return;
    tab.classList.toggle("hidden", !title);
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
   * Inicializa a animação visual do botão de salvar/sincronizar.
   * @returns {void}
   */
  initAnimations() {
    const btnSave = this.element?.querySelector("#btn-save");
    if (btnSave && typeof initSaveButtonAnimation === "function") {
      if (typeof this.cleanupAnimation === "function") {
        this.cleanupAnimation();
      }
      this.cleanupAnimation = initSaveButtonAnimation(btnSave);
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
