/**
 * @file Serviço responsável pela comunicação, intermediação com o gateway de IA e gestão dos logs de chat do projeto.
 */

import { normalizePath } from "../utils/helpers.js";
import { uiBus } from "../events/uiBus.js";
import { domainBus } from "../events/domainBus.js";
import * as ai from "../ai/aiGateway.js";
import { DEFAULT_AI_PROVIDER, getProviderInfo } from "../ai/providers/index.js";
import {
  addDailyUsage,
  getDailyUsage,
  getDailyQuota,
  learnDailyQuota,
} from "../ai/usageTracker.js";

const MAX_MESSAGES_PER_FILE = 50;

const SYNC_DENIED_MESSAGE =
  "Existem rascunhos (.temp) não sincronizados no projeto e o autor não os sincronizou. Nenhuma alteração foi feita. Avise o autor que é obrigatório sincronizar tudo antes de a IA editar arquivos.";

/**
 * Obtém a data atual formatada como YYYY-MM-DD para nomear a sessão do chat.
 * @returns {string} Data formatada.
 */
function getTodaySessionDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Classe de serviço da Inteligência Artificial.
 * @class
 */
export class AiService {
  /**
   * Cria uma instância do AiService.
   * @param {Object} state - Instância do gerenciador de estado global da aplicação.
   * @param {import('./fileService.js').FileService} fileService - Serviço de arquivos.
   * @param {import('./creationService.js').CreationService} creationService - Serviço de criação de livros, capítulos e fichas.
   * @param {import('./changelogService.js').ChangelogService} changelogService - Serviço do changelog (autoria e registros).
   * @param {Object} [extra] - Serviços extras usados pelas tools de estrutura e de projeto.
   * @param {import('./folderService.js').FolderService} [extra.folders] - Pastas e movimentação.
   * @param {import('./deletionService.js').DeletionService} [extra.deletion] - Exclusão de arquivos e capítulos.
   * @param {import('./bookService.js').BookService} [extra.bookService] - Livros e config.json.
   */
  constructor(
    state,
    fileService,
    creationService,
    changelogService,
    extra = {},
  ) {
    this.state = state;
    this.fileService = fileService;
    this.creationService = creationService;
    this.changelogService = changelogService;
    this.folders = extra.folders;
    this.deletion = extra.deletion;
    this.bookService = extra.bookService;
    /** Fila que serializa a gravação do log do chat (evita duas gravações simultâneas no mesmo arquivo). */
    this.saveQueue = Promise.resolve();
    /** Contador de mensagens enviadas (identifica em qual mensagem uma criação foi iniciada). */
    this.messageSeq = 0;
  }

  /**
   * Carrega do disco as configurações de IA (provider, modelo e chave de cada provider) para o state.
   * @returns {Promise<void>}
   */
  async loadSettings() {
    const saved = await window.electronAPI.getAiSettings();
    if (!saved || typeof saved !== "object") return;

    const provider = getProviderInfo(saved.provider)
      ? saved.provider
      : DEFAULT_AI_PROVIDER;

    this.state.aiSettings = { provider, providers: saved.providers || {} };
    this.state.aiProvider = provider;
  }

  /**
   * Atualiza o provider ativo e/ou a chave e o modelo dele, persistindo no arquivo JSON.
   * @param {Object} params
   * @param {string} params.provider - ID do provider selecionado.
   * @param {string} [params.apiKey] - Chave de API do provider.
   * @param {string} [params.model] - Modelo escolhido para o provider.
   * @param {Object} [params.actor] - Quem alterou (padrão: usuário; o futuro fallback automático usa o Sistema).
   * @returns {Promise<boolean>} Verdadeiro se salvou com sucesso.
   */
  async saveSettings({ provider, apiKey, model, actor }) {
    const previous = {
      provider: this.state.aiProvider,
      model: this.getActiveModel(),
    };

    const providers = { ...this.state.aiSettings.providers };
    const current = { ...providers[provider] };
    if (apiKey !== undefined) current.apiKey = apiKey.trim();
    if (model) current.model = model;
    providers[provider] = current;

    const settings = { provider, providers };
    const result = await window.electronAPI.saveAiSettings(settings);
    if (!result?.success) return false;

    this.state.aiSettings = settings;
    this.state.aiProvider = provider;
    this.publishUsage();

    // Troca de provedor ou de modelo vai para o changelog (nunca a chave de API)
    const next = { provider, model: this.getActiveModel() };
    if (next.provider !== previous.provider || next.model !== previous.model) {
      this.changelogService?.recordSetting(
        {
          setting: "ai.model",
          from: `${previous.provider} · ${previous.model}`,
          to: `${next.provider} · ${next.model}`,
        },
        actor,
      );
    }
    return true;
  }

  /**
   * Busca na API do provider a lista de modelos disponíveis para a chave salva.
   * @param {string} provider - ID do provider.
   * @returns {Promise<Array<{id: string, label: string}>|null>} Null se não houver chave ou suporte.
   */
  async listModels(provider) {
    const config = this.state.aiSettings.providers?.[provider];
    if (!config?.apiKey || !getProviderInfo(provider)) return null;

    const providerModule = await import(`../ai/providers/${provider}/index.js`);
    if (typeof providerModule.listModels !== "function") return null;

    const models = await providerModule.listModels(config);
    if (models.length === 0) return null;

    this.state.aiModels[provider] = models;
    this.publishUsage();
    return models;
  }

  /**
   * Monta o caminho completo do arquivo de log da sessão atual.
   * @param {number} sessionIndex - Índice sequencial da sessão no dia.
   * @returns {string|null} Caminho do arquivo .json ou null se não houver livro ativo.
   */
  getCurrentChatLogFilePath(sessionIndex = 1) {
    if (!this.state.currentBookPath) return null;
    const dateStr = getTodaySessionDate();
    const indexStr = String(sessionIndex).padStart(3, "0");
    const normalizedPath = this.state.currentBookPath.replace(/\\/g, "/");
    return `${normalizedPath}/.system/chatlog/session_${dateStr}_${indexStr}.json`;
  }

  /**
   * Modelo ativo do provedor selecionado (o salvo nas configurações ou o padrão).
   * @returns {string}
   */
  getActiveModel() {
    const provider = this.state.aiProvider;
    return (
      this.state.aiSettings.providers?.[provider]?.model ||
      getProviderInfo(provider)?.defaultModel ||
      ""
    );
  }

  /**
   * Janela de contexto do modelo ativo (da lista da API ou do catálogo padrão), se conhecida.
   * @returns {number|null}
   */
  getContextWindow() {
    const provider = this.state.aiProvider;
    const info = getProviderInfo(provider);
    const model = this.getActiveModel();
    const known = [
      ...(this.state.aiModels[provider] || []),
      ...(info?.models || []),
    ];
    return known.find((m) => m.id === model)?.contextWindow || null;
  }

  /**
   * Publica o consumo de tokens atual (e a janela de contexto) para a interface.
   */
  publishUsage() {
    const provider = this.state.aiProvider;
    const model = this.getActiveModel();
    const limit = this.state.aiLimits?.[`${provider}|${model}`] || null;

    domainBus.emit("ai:usage-updated", {
      ...this.state.aiUsage,
      contextWindow: this.getContextWindow(),
      provider,
      model,
      // Limite informado pela API (Claude: restante; qualquer provedor: bloqueio por cota estourada)
      limit: limit && limit.until && limit.until < Date.now() ? null : limit,
      // Contagem local do dia (a API do Gemini não informa a cota restante)
      daily: getDailyUsage(provider, model),
      // Cota diária de requisições já descoberta (informada pela API ao estourar o limite)
      dailyQuota: getDailyQuota(provider, model),
    });
  }

  /**
   * Guarda (ou limpa) o limite de uso conhecido do provedor/modelo ativo.
   * @param {string} provider - Provedor.
   * @param {string} model - Modelo.
   * @param {Object|null} limit - Dados do limite ou null para limpar.
   * @returns {void}
   * @private
   */
  setLimit(provider, model, limit) {
    this.state.aiLimits ??= {};
    if (limit) this.state.aiLimits[`${provider}|${model}`] = limit;
    else delete this.state.aiLimits[`${provider}|${model}`];
  }

  /**
   * Trata um erro da IA: grava no log de erros e, se for limite de cota, memoriza o bloqueio para a barra de uso.
   * @param {Error & {provider?: string, model?: string, status?: number, details?: *, retryAfterMs?: number, isRateLimit?: boolean}} error - Erro ocorrido.
   * @returns {Promise<void>}
   * @private
   */
  async handleError(error) {
    const provider = error.provider || this.state.aiProvider;
    const model = error.model || this.getActiveModel();

    if (
      error.isRateLimit &&
      error.quotaPeriod === "day" &&
      error.quotaValue &&
      /request/i.test(error.quotaMetric || "request")
    ) {
      learnDailyQuota(provider, model, error.quotaValue);
    }

    if (error.isRateLimit) {
      this.setLimit(provider, model, {
        kind: "blocked",
        until: Date.now() + (error.retryAfterMs || 60_000),
        period: error.quotaPeriod,
        message: error.message,
      });
      this.publishUsage();
    }

    try {
      const book = this.state.currentBookPath
        ? this.state.currentBookPath.replace(/\\/g, "/").split("/").pop()
        : undefined;
      await window.electronAPI.logAiError({
        provider,
        model,
        status: error.status,
        message: error.message,
        details: error.details ?? error.stack,
        book,
      });
    } catch (logError) {
      console.error("[AiService] Falha ao gravar o log de erros:", logError);
    }
  }

  /**
   * Zera o consumo de tokens (nova sessão de chat).
   */
  resetUsage() {
    this.state.aiUsage = { inputTokens: 0, outputTokens: 0, contextTokens: 0 };
    this.publishUsage();
  }

  /**
   * Abre o modal de sincronização e aguarda o usuário resolver todos os rascunhos (.temp) do projeto.
   * @returns {Promise<boolean>} Verdadeiro se não restou nenhum rascunho pendente.
   */
  async requireFullSync() {
    const pending = await this.fileService.getPendingTempFiles();
    if (pending.length === 0) return true;

    await new Promise((resolve) => {
      uiBus.emit("sync:require-all", { onDone: resolve });
    });

    return (await this.fileService.getPendingTempFiles()).length === 0;
  }

  /**
   * Envia uma mensagem/prompt para o gateway e retorna o texto da resposta da IA.
   *
   * Fluxo de edição (igual para todos os provedores): na primeira ferramenta que escreve,
   * exige que todos os rascunhos do projeto estejam sincronizados, trava o projeto
   * (`ai:edit-started`) e, ao final da resposta, libera (`ai:edit-finished`) e pede a revisão
   * dos arquivos alterados.
   * @param {Object} params
   * @param {string} params.prompt - Texto simples enviado pelo usuário.
   * @param {Array} [params.history=[]] - Histórico de mensagens anteriores (se houver).
   * @returns {Promise<{text: string, buttons: Array<{label: string, event: string, data: Object}>}>}
   * Texto da resposta do provedor ativo e os botões (ferramenta `show_buttons`) a exibir junto dela.
   */
  async sendMessage({ prompt, history = [] }) {
    const bookPath = this.state.currentBookPath;
    const session = { locked: false, syncDenied: false, files: new Set() };

    const toolContext = {
      state: this.state,
      fileService: this.fileService,
      creation: this.creationService,
      folders: this.folders,
      deletion: this.deletion,
      bookService: this.bookService,
      /** Registra leituras e identifica o autor das alterações no changelog. */
      changelog: this.changelogService,
      /** Identifica esta mensagem do usuário. */
      messageId: ++this.messageSeq,
      /** Conversa atual: a criação guiada confere se os dados obrigatórios vieram mesmo do autor. */
      conversation: { prompt, history },
      /** Botões registrados pela IA para esta resposta. */
      buttons: [],

      beginEdit: async () => {
        if (session.locked) return;
        if (session.syncDenied) throw new Error(SYNC_DENIED_MESSAGE);

        if (!(await this.requireFullSync())) {
          session.syncDenied = true;
          throw new Error(SYNC_DENIED_MESSAGE);
        }

        session.locked = true;
        domainBus.emit("ai:edit-started", { bookPath });
      },

      recordEdit: (filePath) => {
        session.files.add(filePath);
        // O rascunho é da IA: ao ser aprovado pelo usuário, o changelog atribui a alteração a ela
        this.changelogService?.markAiDraft(filePath);
      },

      /** Mostra no chat uma mensagem "system" sobre um evento importante feito pela IA. */
      notice: (text) => uiBus.emit("chat:system-notice", { text }),
    };

    try {
      const { text, usage } = await ai.processPrompt(
        { prompt, history },
        this.state,
        toolContext,
      );

      this.state.aiUsage = {
        inputTokens: this.state.aiUsage.inputTokens + usage.inputTokens,
        outputTokens: this.state.aiUsage.outputTokens + usage.outputTokens,
        contextTokens: usage.contextTokens,
      };

      const provider = this.state.aiProvider;
      const model = this.getActiveModel();
      addDailyUsage(provider, model, {
        requests: usage.requests,
        input: usage.inputTokens,
        output: usage.outputTokens,
      });
      // Se a API informou o limite restante (ex.: Claude), mostra; senão, qualquer bloqueio anterior acabou
      this.setLimit(
        provider,
        model,
        usage.rateLimits ? { kind: "remaining", ...usage.rateLimits } : null,
      );
      this.publishUsage();

      return { text, buttons: toolContext.buttons };
    } catch (error) {
      console.error(
        "[AiService] Erro ao enviar mensagem para o gateway:",
        error,
      );
      await this.handleError(error);
      throw error;
    } finally {
      if (session.locked) {
        domainBus.emit("ai:edit-finished", {
          bookPath,
          files: [...session.files],
        });
      }
    }
  }

  /**
   * Salva uma nova mensagem no arquivo de log da sessão atual do livro ativo.
   * @param {Object} message - Objeto da mensagem.
   * @param {string} message.role - Papel do emissor ('user' | 'assistant' | 'system').
   * @param {string} message.content - Conteúdo em texto da mensagem.
   * @param {string} [message.timestamp] - Data/hora da mensagem.
   * @param {Array<{label: string, event: string, data: Object}>} [message.buttons] - Botões exibidos junto da mensagem.
   * @returns {Promise<boolean>} Retorna verdadeiro se a gravação foi bem-sucedida.
   */
  saveMessage(message) {
    const run = this.saveQueue.then(() => this.writeMessage(message));
    this.saveQueue = run.catch(() => {});
    return run;
  }

  /**
   * Grava de fato a mensagem no arquivo de log (chamado em série por {@link AiService#saveMessage}).
   * @param {Object} message - Mensagem a gravar.
   * @returns {Promise<boolean>} Verdadeiro se a gravação foi bem-sucedida.
   * @private
   */
  async writeMessage(message) {
    if (!message || !message.content) return false;

    const filePath = await this.resolveTargetLogFile();
    if (!filePath) {
      console.warn(
        "[AiService] Não foi possível resolver o caminho do arquivo de log (livro ativo não selecionado?).",
      );
      return false;
    }

    const logEntry = {
      role: message.role,
      content: message.content,
      timestamp: message.timestamp || new Date().toISOString(),
    };
    if (Array.isArray(message.buttons) && message.buttons.length > 0) {
      logEntry.buttons = message.buttons;
    }

    let messages = [];
    const rawData = await window.electronAPI.readFile(filePath);

    if (rawData) {
      try {
        messages = JSON.parse(rawData);
        if (!Array.isArray(messages)) messages = [];
      } catch {
        messages = [];
      }
    }

    messages.push(logEntry);

    const saveResult = await window.electronAPI.saveFile(
      filePath,
      JSON.stringify(messages, null, 2),
    );

    return Boolean(saveResult && (saveResult.success || saveResult === true));
  }

  /**
   * Garante a rotação de arquivos caso o arquivo atual exceda o limite de 50 mensagens.
   * @returns {Promise<string|null>} Caminho completo do arquivo .json pronto para escrita.
   */
  async resolveTargetLogFile() {
    if (!this.state.currentBookPath) return null;

    let sessionIndex = 1;
    let filePath = this.getCurrentChatLogFilePath(sessionIndex);

    while (filePath) {
      const rawData = await window.electronAPI.readFile(filePath);

      // Se o arquivo ainda não existe, podemos usá-lo para criar uma nova sessão
      if (!rawData) {
        return filePath;
      }

      try {
        const messages = JSON.parse(rawData);
        // Se tiver menos de 50 mensagens, podemos continuar salvando nele
        if (
          Array.isArray(messages) &&
          messages.length < MAX_MESSAGES_PER_FILE
        ) {
          return filePath;
        }
      } catch {
        // Se o arquivo estiver corrompido, usa ele mesmo para sobrescrever
        return filePath;
      }

      // Se atinge 50 mensagens, incrementa para a próxima sessão
      sessionIndex += 1;
      filePath = this.getCurrentChatLogFilePath(sessionIndex);
    }

    return filePath;
  }

  /**
   * Obtém a lista de caminhos de todos os arquivos de log ordenados cronologicamente.
   * @returns {Promise<string[]>} Lista de caminhos dos arquivos .json.
   */
  async getChatLogFiles() {
    if (!this.state.currentBookPath) return [];

    const normalizedPath = this.state.currentBookPath.replace(/\\/g, "/");
    const chatlogFolder = `${normalizedPath}/.system/chatlog`;

    try {
      const folderTree = await window.electronAPI.getTree(chatlogFolder);
      if (!folderTree || !folderTree.files) return [];

      // Como `files` agora é um dicionário, usamos Object.values() para varrer os arquivos
      return Object.values(folderTree.files)
        .filter(
          (file) => file.path && file.path.toLowerCase().endsWith(".json"),
        )
        .map((file) => file.path)
        .sort((a, b) => a.localeCompare(b)); // Ordenação cronológica
    } catch (err) {
      console.error("[CHAT LOG] Erro ao listar arquivos de histórico:", err);
      return [];
    }
  }

  /**
   * Carrega um lote de histórico de mensagens por paginação reversa (arquivo por arquivo).
   * @param {Object} [options={}]
   * @param {number} [options.sessionOffset=0] - Quantas sessões retroceder (0 = última sessão).
   * @returns {Promise<{ messages: Array<{role: string, content: string, timestamp: string}>, hasMore: boolean }>}
   */
  async loadChatHistoryPaged({ sessionOffset = 0 } = {}) {
    const files = await this.getChatLogFiles();

    if (files.length === 0) {
      return { messages: [], hasMore: false };
    }

    const targetIndex = files.length - 1 - sessionOffset;

    if (targetIndex < 0) {
      return { messages: [], hasMore: false };
    }

    const targetFilePath = files[targetIndex];
    const rawData = await window.electronAPI.readFile(targetFilePath);

    let messages = [];
    if (rawData) {
      try {
        const parsed = JSON.parse(rawData);
        if (Array.isArray(parsed)) {
          messages = parsed;
        }
      } catch (err) {
        console.warn(
          `[CHAT LOG] Erro ao ler o arquivo de log ${targetFilePath}:`,
          err,
        );
      }
    }

    return {
      messages,
      hasMore: targetIndex > 0,
    };
  }
}
