/**
 * @file Componente responsável pela renderização estrutural da barra lateral (Sidebar).
 */

import "./styles.css";
import templateHtml from "./templates/main.hbs?raw";
import { t } from "../../../shared/i18n.js";
import { Component } from "../Component.js";
import { DropdownComponent } from "../Dropdown/DropdownComponent.js";

/**
 * Representa o painel lateral esquerdo da aplicação.
 * @class
 */
export class SidebarComponent extends Component {
  declare bookDropdown: any;
  declare state: any;
  declare uiBus: any;

  /**
   * Cria uma instância da classe
   * @param {string} selector - Seletor CSS do elemento do DOM onde será injetada.
   * @param {Object} context - Objeto de contexto e infraestrutura (state, uiBus, domainBus)
   * @param {Object|Array|null} [params=null] - Parâmetros opcionais dinâmicos para a exigência do componente.
   * @param {Component} [parent=null]
   */
  constructor(selector, context, params, parent = null) {
    super(selector, context, templateHtml, params, parent);

    // Seletor de livros: dropdown personalizado com o botão "+ Criar novo livro"
    this.bookDropdown = this.newChild(
      DropdownComponent,
      "#book-dropdown-container",
      context,
      {
        placeholder: t("Clique para selecionar um livro"),
        emptyLabel: t("Nenhum livro encontrado"),
        selectEvent: "book:selected",
        itemEditEvent: "book:edit",
        itemEditTitle: t("Editar este livro (abre a Central do Livro)"),
        actions: [
          {
            label: t("Criar novo livro"),
            icon: "fa-solid fa-plus",
            event: "book:create",
          },
          {
            label: t("Importar livro (.zip)"),
            icon: "fa-solid fa-file-import",
            event: "book:import",
          },
          {
            label: t("Importar de um arquivo (Word, PDF, texto)"),
            icon: "fa-solid fa-file-word",
            event: "book:import-file",
          },
        ],
      },
    );
  }

  /**
   * Configura os ouvintes de eventos da interface da sidebar.
   * @private
   * @returns {void}
   */
  setupListeners() {
    // Sincroniza o dropdown com o livro atualmente selecionado
    this.uiBus.on("book:changed", (bookPath) => {
      this.bookDropdown.setValue(bookPath);
    });

    // Sem livro selecionado o dropdown volta ao texto padrão
    this.uiBus.on("book:cleared", () => {
      this.bookDropdown.setValue(null);
    });

    // Solicita atualização da lista de livros quando o backend notifica mudança
    this.uiBus.on("books:updated", (bookList) => {
      this.updateBookList(bookList);
    });

    // Nome do livro alterado (Central do Livro ou config.json): o seletor passa a mostrar o novo nome
    this.uiBus.on("books:refresh-list", () => {
      this.updateBookList(this.state.bookList);
    });
  }

  /**
   * Atualiza as opções do dropdown de livros.
   * @param {Array[Object]} books - Livros disponíveis (`fullPath`, `book_title`, `folderName`).
   * @returns {void}
   * @private
   */
  updateBookList(books) {
    this.bookDropdown.setItems(
      (books || []).map((book) => ({
        value: book.fullPath,
        label: book.book_title || book.folderName,
      })),
    );
    this.bookDropdown.setValue(this.state.currentBookPath);
  }

  selectLastBook() {
    const lastSelected = this.state.currentBookPath;
    const booksArray = this.state.bookList;

    const bookToLoad =
      booksArray.find((b) => b.fullPath === lastSelected) || booksArray[0];

    if (bookToLoad) {
      this.uiBus.emit("book:selected", bookToLoad.fullPath);
    }
  }
}
