/**
 * @file Contém a classe AppContainer, responsável por inicializar, instanciar e gerenciar
 * o ciclo de vida dos serviços e componentes utilizando o padrão de Inversão de Controle (IoC).
 */

import { State } from "./state.js";
import { ThemeManager } from "./themeManager.js";
import { ServiceManager } from "../services/serviceManager.js";
import { UiController } from "../controllers/uiController.js";
import { DomainController } from "../controllers/domainController.js";
import { uiBus } from "../events/uiBus.js";
import { domainBus } from "../events/domainBus.js";

import { setupEscapeKey } from "../utils/escapeKey.js";
import * as ComponentModules from "../components/index.js";

const ComponentClass: any = ComponentModules;

/**
 * Orquestrador principal da aplicação no processo de renderização.
 * Gerencia a inicialização e injeção de dependências das classes de serviços e UI.
 * @class
 */
export class AppContainer {
  declare components: any;
  declare domainController: any;
  declare modalManager: any;
  declare services: any;
  declare state: any;
  declare themeManager: any;
  declare uiController: any;

  /**
   * Cria uma instância do AppContainer e inicializa suas dependências.
   * @constructor
   */
  constructor() {
    // 1. Core e Serviços
    this.state = new State();

    const context: any = {
      uiBus: uiBus,
      domainBus: domainBus,
      state: this.state,
    };
    this.themeManager = new ThemeManager();
    this.modalManager = new ComponentClass.ModalManager(
      "#modal-container",
      context,
    );

    // Tecla Esc: fecha, uma por vez, as camadas abertas (configurações, modais, centrais, chat)
    setupEscapeKey({ modalManager: this.modalManager });

    // 2. Centraliza os serviços em um único lugar
    this.services = new ServiceManager(this.state);
    // As centrais usam os serviços diretamente
    context.services = this.services;
    // Depuração em desenvolvimento (CDP): acesso aos serviços pelo console
    if (import.meta.env?.DEV) window.__services = this.services;

    // 3. Controllers
    this.uiController = new UiController(this.services, this.state);
    this.domainController = new DomainController(this.services, this.state);

    // 4. Agrupamos os componentes de UI em um array/objeto central
    this.components = {};

    this.components.sidebar = new ComponentClass.SidebarComponent(
      "#sidebar-container",
      context,
    );
    this.components.chat = this.components.sidebar.newChild(
      ComponentClass.ChatComponent,
      "#chat-container",
      context,
    );
    this.components.explorer = this.components.sidebar.newChild(
      ComponentClass.ExplorerComponent,
      "#explorer-container",
      context,
    );
    this.components.editor = new ComponentClass.EditorComponent(
      "#editor-container",
      context,
    );
    this.components.editorOverlay = this.components.editor.newChild(
      ComponentClass.EditorOverlayComponent,
      "#editor-overlay-container",
      context,
    );
    this.components.toolbar = new ComponentClass.ToolbarComponent(
      "#toolbar-container",
      context,
    );
    this.components.settings = new ComponentClass.SettingsComponent(
      "#settings-container",
      context,
    );
    this.components.central = new ComponentClass.CentralComponent(
      "#central-container",
      context,
    );
    this.components.toast = new ComponentClass.ToastComponent(
      "#toast-container",
      context,
    );
  }

  /**
   * Inicializa assincronamente todos os módulos, temas, eventos globais e dados iniciais do container.
   * @returns {Promise<void>}
   */
  async init() {
    // Inicializa o estado global da aplicação antes de tudo.
    await this.setupState();

    // Aguarda a inicialização e renderização de todos os componentes principais em paralelo
    const componentPromises = Object.values(this.components).map(
      async (component: any) => {
        if (component && typeof component.init === "function") {
          await component.init();
        }
      },
    );

    await Promise.all(componentPromises);

    // Inicia o tema depois que todos os elementos UI estão renderizados
    this.themeManager.init();
    // Aparência (zoom, tema de cores, modo noturno, fontes), cronômetro e atalhos de teclado
    this.services.appearance.init();
    this.services.productivity.start();
    this.services.shortcuts.init();
    this.services.skillRunner.init();
    this.setupWindowTitle();

    // Define eventos globais
    this.setupGlobalEvents();

    // Emite eventos globais de que a aplicação está pronta para interações
    uiBus.emit("app:ready");
    domainBus.emit("app:ready");

    // Rotina de inicialização (atualização e backup), em segundo plano
    this.services.startup.run().catch((error) => console.error("[STARTUP] Falha na rotina de inicialização:", error));
  }

  /**
   * Inicializa o estado global da aplicação, carregando dados persistidos do localStorage.
   * @private
   */
  async setupState() {
    this.state.currentBookPath =
      localStorage.getItem("last_selected_book") || null;
    this.state.currentFilePath =
      localStorage.getItem("last_opened_file") || null;

    await this.services.ai.loadSettings();

    // Atualiza em segundo plano a lista de modelos (janela de contexto) do provider ativo
    this.services.ai.listModels(this.state.aiProvider).catch(() => {});
  }

  /**
   * Título da janela (aparece na barra de tarefas do Windows): "Nome do Livro - Astra Writer"; sem livro, só "Astra Writer".
   * @returns {void}
   * @private
   */
  setupWindowTitle() {
    const update = (title?: any) => {
      const name = String(title ?? this.state.currentBookMetadata?.book_title ?? "").trim();
      document.title = name ? `${name} - Astra Writer` : "Astra Writer";
    };
    uiBus.on("book:changed", () => update());
    uiBus.on("book:cleared", () => update(""));
    uiBus.on("book:title", (payload) => update(payload?.title));
    update();
  }

  /**
   * Configura ouvintes globais de eventos na janela (arrastar arquivos, restrições de TAB, etc.).
   * @private
   */
  setupGlobalEvents() {
    // Previne comportamento padrão de arrastar elementos na janela
    document.addEventListener(
      "dragstart",
      (e: any) => {
        // Só o explorer permite arrastar (arquivos entre pastas)
        if (e.target.closest?.("[data-draggable='true']")) return;
        e.preventDefault();
      },
      true,
    );

    // Impede que o TAB navegue pelos elementos do app fora do editor
    window.addEventListener(
      "keydown",
      (e: any) => {
        if (e.key === "Tab") {
          const isInsideEditor =
            e.target.closest(".toastui-editor-defaultUI") ||
            e.target.closest(".CodeMirror") ||
            e.target.closest(".ProseMirror");

          if (!isInsideEditor) {
            e.preventDefault();
          }
        }
      },
      true,
    );
  }
}

console.log("[4. APP-CONTAINER.JS]");
