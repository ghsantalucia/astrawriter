// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Gerencia e despacha os eventos de interface (UI) vindos do uiBus para os handlers visuais.
 */

import { uiBus } from "../events/uiBus.js";

import * as book from "./handlers/bookHandler.js";
import * as file from "./handlers/fileHandler.js";
import * as chat from "./handlers/chatHandler.js";
import * as config from "./handlers/configHandler.js";
import * as aiReview from "./handlers/aiReviewHandler.js";
import * as search from "./handlers/searchHandler.js";
import * as creation from "./handlers/creationHandler.js";
import * as importFile from "./handlers/importFileHandler.js";
import * as variables from "./handlers/variablesHandler.js";
import * as history from "./handlers/historyHandler.js";
import * as exporter from "./handlers/exportHandler.js";
import * as links from "./handlers/linkHandler.js";
import * as del from "./handlers/deleteHandler.js";
import * as folderHandler from "./handlers/folderHandler.js";
import * as templateEditor from "./handlers/templateEditorHandler.js";

/**
 * Controller responsável pelas reações visuais da interface.
 * @class
 */
export class UiController {
  /**
   * Cria uma instância do UiController e registra os ouvintes de eventos da UI.
   * @param {ServiceManager} services - Instância centralizada dos serviços.
   */
  constructor(services, state) {
    this.services = services;
    this.state = state;
    this.registerEvents();
  }

  /**
   * Registra todos os escutadores do barramento de UI.
   * @private
   */
  registerEvents() {
    // Evento de inicialização do app
    uiBus.on("app:ready", async () => {
      config.applySavedSpellLanguage();
      // Recupera lista de livros cadastrados
      const bookList = await book.fetchBooks(this.state, this.services.book);
      // Envia para preparar o frontend
      uiBus.emit("books:updated", bookList);
      // Primeira abertura do app instalado: abre o livro "Manual de Uso"
      if (!this.state.currentBookPath) {
        const first = await window.electronAPI.takeFirstRunBook?.();
        if (first && bookList.some((b) => b.fullPath === first)) this.state.currentBookPath = first;
      }
      // Restaura o último livro aberto; sem livro, o app fica vazio aguardando a seleção
      if (!this.state.currentBookPath) {
        book.clearBook(this.state);
        uiBus.emit("editor:reseted");
        return;
      }
      uiBus.emit("book:selected", this.state.currentBookPath);
      // Restaura o último arquivo aberto caso exista
      if (this.state.currentFilePath) {
        uiBus.emit("editor:open-file", { path: this.state.currentFilePath });
      } else {
        uiBus.emit("editor:reseted");
      }
    });

    //==========================================//
    //         Requisições de UI (uiBus)        //
    //==========================================//

    // Solicita lista de livros do backend
    uiBus.onReq("books:fetch-list", (req) => {
      book.onFetchBooksList(req, this.services.book);
    });

    // Intercepta o evento file:get e delega para o fileHandler passando os dados e o state
    uiBus.onReq("file:get", (req) => {
      file.onFileGet(req, this.state, this.services.file);
    });

    //==========================================//
    //             Eventos  de  UI              //
    //==========================================//

    //
    uiBus.on("config:changed", async () => {
      const bookList = await book.fetchBooks(this.state, this.services.book);
      const currentBookConfig = bookList.find(
        (b) => b.fullPath === this.state.currentBookPath,
      );
    });

    // Atualiza estado da árvore de arquivos quando uma pasta é aberta ou fechada
    uiBus.on("folder:toggle", (payload) => {
      book.onFolderToggle(this.state, this.services.book, payload.data);
    });

    // Evento que chama para tela de sincronização de arquivos .temp
    uiBus.on("sync:open-modal", () => {
      file.onSyncOpenModal(this.services.file, this.state);
    });

    // A IA vai editar arquivos: exige a sincronização de todos os rascunhos antes
    uiBus.on("sync:require-all", (payload) => {
      file.onSyncRequireAll(payload, this.services.file, this.state);
    });

    // Abre a janela de comparação das alterações feitas pela IA
    uiBus.on("ai-review:open", (payload) => {
      aiReview.onAiReviewOpen(payload, this.services.file, this.state);
    });

    // Lida com seleção de livro/projeto (vindo do dropdown, o caminho está em data-value)
    uiBus.on("book:selected", (e) => {
      if (e.nativeEvent) {
        book.onBookSelect(
          this.state,
          e.data?.value ?? e.value,
          this.services.book,
        );
      } else {
        book.onBookSelect(this.state, e, this.services.book);
      }
    });

    // Caneta do dropdown: seleciona o livro (se ainda não for o atual) e abre a Central do Livro
    uiBus.on("book:edit", async (e) => {
      const bookPath = e.data?.value;
      if (!bookPath) return;
      if (bookPath !== this.state.currentBookPath) {
        await book.onBookSelect(this.state, bookPath, this.services.book);
      }
      uiBus.emit("central:open", { central: "book" });
    });

    // Lida com troca de livro/projeto
    uiBus.on("book:changed", (bookPath) => {
      book.onBookChange(this.state);
      chat.loadHistory(0, this.services.ai);
      this.services.ai.resetUsage();
      file.handlePendingTempFiles(this.services.file);
      config.onCurrentConfigChanged(this.state, this.state.currentBookMetadata);
    });

    // Nenhum livro selecionado: limpa o chat e o editor
    uiBus.on("book:cleared", () => {
      uiBus.emit("chat:clear");
      uiBus.emit("editor:reset");
    });

    // Lida com editor resetado (nenhum arquivo aberto)
    uiBus.on("editor:reseted", () => {
      file.onEditorReset(this.state);
    });

    // Solicita o salvamento de um arquivo temporário (.temp) via IPC
    uiBus.on("file:save-temp", async ({ path, content, onSaved }) => {
      file.onSaveTemp(path, content, this.services.file, onSaved);
    });

    // Evento disparado quando um arquivo é aberto com sucesso
    uiBus.on("file:opened", (data) => {
      // Trocar de arquivo encerra as sessões de salvamento automático dos demais
      this.services.changelog.endSessionsExcept(data.fullPath);
      file.onFileOpened(this.state, this.services.book, data);
    });

    // Evento disparado quando o modo avançado é alternado
    uiBus.on("advanced-mode:toggle", (payload) => {
      book.onAdvancedModeToggle(this.state, this.services.book, payload);
    });

    // Envia mensagem para IA
    uiBus.on("chat:send-message", (data) => {
      chat.onSendMessage(data, this.services.ai);
    });

    // Liga/desliga a correção ortográfica e gramatical
    uiBus.on("spellcheck:toggle", (payload) => {
      config.onSpellcheckToggled(payload);
    });

    // Idioma da correção ortográfica
    uiBus.on("language:changed", (payload) => {
      config.onSpellLanguageChanged(payload);
    });

    // Salva provider, modelo e chave de API da IA
    uiBus.on("ai-settings:save-requested", (data) => {
      config.onAiSettingsSave(data, this.services.ai);
    });

    // Atualiza a lista de modelos do provider
    uiBus.on("ai-settings:models-requested", (data) => {
      config.onAiModelsRequested(data, this.services.ai);
    });

    // Solicita mais histórico de chat
    uiBus.on("chat:fetch-more-history", ({ offset }) => {
      chat.fetchMoreHistory(offset, this.services.ai);
    });

    // Trata deleção de arquivo temporário
    uiBus.on("temp-file:deleted", async (filePath) => {
      await file.onTempChanged(filePath, this.state, this.services.book);
      file.onTempDeleted(filePath, this.state, this.services.file);
    });
    // Trata sincronização de arquivo temporário
    uiBus.on("temp-file:synced", async (filePath) => {
      await file.onTempChanged(filePath, this.state, this.services.book);
      file.onTempDeleted(filePath, this.state, this.services.file);
    });
    uiBus.on("temp-file:saved", (filePath) => {
      file.onTempChanged(filePath, this.state, this.services.book);
    });

    // Nome/tags alterados pelas variáveis: atualiza o mapa do livro e redesenha o explorer
    uiBus.on("file:variables-changed", async ({ path }) => {
      await file.onTempChanged(path, this.state, this.services.book);
      uiBus.emit("tree:updated");
    });

    //==========================================//
    //        Pesquisa no explorer              //
    //==========================================//

    // Texto da pesquisa alterado (digitação)
    uiBus.on("search:changed", (payload) => {
      search.onSearchChanged(payload, this.state, this.services.search);
    });

    // Botão X da pesquisa
    uiBus.on("search:clear", () => {
      search.onSearchClear();
    });

    //==========================================//
    //   Criação de livros, capítulos e fichas  //
    //==========================================//

    // Intenções de criação (botões do dropdown de livros, do explorer e do chat)
    uiBus.on("book:create", () => this.openCreationWizard("book"));
    // Janela de edição dos templates de um perfil (Central do Sistema → Templates)
    uiBus.on("template-editor:open", (payload) => templateEditor.openTemplateEditor(payload?.data ?? payload));

    // Importar um livro de um zip exportado pelo app
    uiBus.on("book:import", async () => {
      try {
        const result = await window.electronAPI.importBook();
        if (result?.canceled) return;
        if (!result?.success) throw new Error(result?.error || "Falha ao importar o livro.");
        await creation.onBookCreated(this.state, this.services.book);
        uiBus.emit("book:selected", result.bookPath);
        uiBus.emit("toast:show", { message: `Livro "${result.title}" importado (${result.files} arquivos).`, type: "success" });
      } catch (error) {
        uiBus.emit("toast:show", { message: error.message, type: "error" });
      }
    });
    // Importar de um arquivo (docx, odt, pdf, txt, md): revisão dos capítulos extraídos e depois o assistente de livro
    uiBus.on("book:import-file", () => importFile.startImportFromFile(this.state, creation, this.services.creation));
    uiBus.on("chapter:create", () => this.openCreationWizard("chapter"));
    uiBus.on("note:create", (payload) =>
      this.openCreationWizard("note", payload?.data?.folder),
    );
    uiBus.on("entity:create", (payload) =>
      this.openCreationWizard("entity", payload.data?.folder),
    );

    // Envio de um wizard (criação ou edição de variáveis)
    uiBus.on("wizard:submit", (payload) => {
      creation.onWizardSubmit(payload, this.state, this.services);
    });

    // Itens criados (pela UI ou pela IA): mantém lista de livros e árvore de arquivos atualizadas
    uiBus.on("book:created", (payload) => {
      creation.onBookCreated(this.state, this.services.book);
      importFile.finishPendingImport(payload, this.state, this.services.creation);
      chat.onCreationNotice(payload, this.services.ai);
    });
    uiBus.on("chapter:created", (payload) => {
      creation.onTreeChanged(payload, this.state, this.services.book);
      chat.onCreationNotice(payload, this.services.ai);
    });
    uiBus.on("file:created", (payload) => {
      creation.onTreeChanged(payload, this.state, this.services.book);
      chat.onCreationNotice(payload, this.services.ai);
    });

    // Aviso "system" no chat sobre eventos importantes feitos pela IA (ex.: arquivo alterado)
    uiBus.on("chat:system-notice", (payload) => {
      chat.onSystemNotice(payload, this.services.ai);
    });

    // Botão de caneta do explorer (e botão do chat): modal de dados do arquivo, aberto ou não no editor
    uiBus.on("variables:open-modal", (payload) => {
      variables.onVariablesOpen(this.state, this.services.file, payload);
    });
    uiBus.on("file-data:edit", (payload) => {
      variables.onVariablesOpen(this.state, this.services.file, payload);
    });

    // Caixa "Dados do arquivo" do editor
    uiBus.on("variables:inline-save", (payload) => {
      variables.onVariablesInlineSave(payload, this.state, this.services.file);
    });

    //==========================================//
    //   Histórico, changelog e log de erros    //
    //==========================================//

    //==========================================//
    //     Exclusão de arquivos e capítulos     //
    //==========================================//

    // Botões de excluir do explorer (aparecem ao passar o mouse): pedem confirmação antes de apagar
    uiBus.on("file:delete", (payload) => {
      del.onFileDeleteRequest(
        payload,
        this.state,
        this.services.deletion,
        this.services,
      );
    });
    // Pastas do usuário e arrastar e soltar de arquivos
    // Mini toolbar de Anotações: bloqueia/libera a escrita da IA nas anotações (folder.yml de notes)
    uiBus.on("notes:toggle-ai-lock", () => {
      folderHandler.onToggleNotesAiWrite(this.state, this.services);
    });

    uiBus.on("folder:create", (payload) => {
      folderHandler.onFolderCreate(
        payload,
        this.state,
        this.services.folders,
        this.services,
      );
    });
    uiBus.on("folder:rename", (payload) => {
      folderHandler.onFolderRename(
        payload,
        this.state,
        this.services.folders,
        this.services,
      );
    });
    uiBus.on("folder:delete", (payload) => {
      folderHandler.onFolderDelete(
        payload,
        this.state,
        this.services.folders,
        this.services,
      );
    });
    uiBus.on("file:move", (payload) => {
      folderHandler.onFileMove(
        payload,
        this.state,
        this.services.folders,
        this.services,
      );
    });
    // Alterações de estrutura feitas pela IA (criar/mover/excluir pasta ou arquivo, restaurar versão)
    uiBus.on("book:structure-changed", (payload) => {
      del.onStructureChanged(payload, this.state, this.services);
    });
    uiBus.on("folder:move", (payload) => {
      folderHandler.onFolderMove(
        payload,
        this.state,
        this.services.folders,
        this.services,
      );
    });
    uiBus.on("chapter:delete", (payload) => {
      del.onChapterDeleteRequest(
        payload,
        this.state,
        this.services.deletion,
        this.services,
      );
    });

    // Botão da toolbar: cria links internos automáticos para nomes/apelidos de fichas do livro
    uiBus.on("autolink:run", () => {
      links.onAutoLink(this.state);
    });

    // Botão da toolbar: histórico de versões do arquivo aberto (com restauração)
    uiBus.on("history:open-modal", () => {
      history.onHistoryOpen(this.state, this.services.changelog, this.services);
    });

    // Botão da toolbar: exportar o arquivo aberto (Markdown, Word ou PDF)
    uiBus.on("export:file", (payload) => {
      exporter.onExportFile(payload, this.state);
    });

    // Botão de resposta pronta no chat
    uiBus.on("chat:quick-reply", (payload) => {
      chat.onQuickReply(payload, this.services.ai);
    });

    //
    uiBus.on("book:ai-locked", () => {
      book.onAiLock(true);
    });
    //
    uiBus.on("book:ai-unlocked", () => {
      book.onAiLock(false);
    });
  }

  /**
   * Pede ao handler de criação que abra o wizard do tipo informado.
   * @param {"book"|"chapter"|"entity"|"note"} kind - Tipo de criação.
   * @param {string} [folder] - Pasta da ficha, relativa ao livro (apenas `entity`).
   * @returns {void}
   * @private
   */
  openCreationWizard(kind, folder) {
    creation.onCreateRequested(
      { kind, folder },
      this.state,
      this.services.creation,
    );
  }
}
