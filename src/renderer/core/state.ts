/**
 * @file Gerencia o estado global compartilhado e define os valores padrão para os metadados e permissões dos arquivos.
 */

/**
 * Objeto de configuração contendo os valores padrão para metadados de arquivos,
 * caso não estejam presentes no arquivo .md.
 * @type {Object}
 */
export const DEFAULT_TREE_METADATA = {
  humanRead: false,
  humanWrite: false,
  aiRead: false,
  aiWrite: false,
  advanced: false,
  // Permissão de exclusão: null = regra padrão (ver utils/deletePermission.js)
  userDelete: null,
  aiDelete: null,
  title: null, // Será tratado no merge se precisar do nome do arquivo
  description: null,
};

/**
 * Classe responsável por gerenciar o estado global compartilhado da aplicação.
 * @class
 */
export class State {
  declare aiLimits: any;
  declare aiModels: any;
  declare aiProvider: any;
  declare aiSettings: any;
  declare aiUsage: any;
  declare bookList: any;
  declare currentBookMap: any;
  declare currentBookMetadata: any;
  declare currentBookPath: any;
  declare currentFileMetadata: any;
  declare currentFilePath: any;
  declare editor: any;
  declare pendingCreation: any;

  /**
   * Cria uma instância do gerenciador de estado.
   * @constructor
   */
  constructor() {
    /**
     * Lista de todos os livros/projetos
     * @type {Array[Object]}
     */
    this.bookList = [];

    /**
     * Caminho absoluto do livro atualmente selecionado.
     * @type {string|null}
     */
    this.currentBookPath = null;

    /**
     * Dados do config.json do livro
     * @type {Object}
     */
    this.currentBookMetadata = {};

    /**
     * Mapa de metadados de todos os arquivos rastreados.
     * @type {Object}
     */
    this.currentBookMap = {};

    /**
     * Caminho absoluto do arquivo atualmente aberto.
     * @type {string|null}
     */
    this.currentFilePath = null;

    /**
     * Metadados do arquivo atual.
     * @type {Object}
     */
    this.currentFileMetadata = {};

    /**
     * Provedor de IA ativo (nome da pasta em /ai/providers).
     * @type {string}
     */
    this.aiProvider = "claude";

    /**
     * Configurações de IA persistidas: { provider, providers: { [id]: { apiKey } } }
     * @type {Object}
     */
    this.aiSettings = { provider: "claude", providers: {} };

    /**
     * Modelos conhecidos por provider (vindos da API), com janela de contexto.
     * @type {Object<string, Array<{id: string, label: string, contextWindow?: number}>>}
     */
    this.aiModels = {};

    /**
     * Consumo de tokens da sessão atual do chat.
     * @type {{inputTokens: number, outputTokens: number, contextTokens: number}}
     */
    this.aiUsage = { inputTokens: 0, outputTokens: 0, contextTokens: 0 };

    /**
     * Limites de uso conhecidos por "provedor|modelo": restante informado pela API ou bloqueio por cota estourada.
     * @type {Object<string, {kind: "remaining"|"blocked", until?: number, period?: string, message?: string}>}
     */
    this.aiLimits = {};

    /**
     * Criação guiada iniciada pela IA que aguarda a resposta do autor (ver ai/tools/creationTools.js).
     * @type {{kind: string, folder?: string, messageId: number}|null}
     */
    this.pendingCreation = null;

    /**
     * Instância do editor de texto ativo.
     * @type {Object|null}
     */
    this.editor = null;
  }
}
