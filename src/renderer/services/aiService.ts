/**
 * @file Serviço responsável pela comunicação, intermediação com o gateway de IA e gestão dos logs de chat do projeto.
 */

import { setActiveSignal } from "../ai/abort.js";
/** Provedores com busca na internet nativa ligada no pedido. */
const WEB_SEARCH_PROVIDERS = new Set(["claude", "gemini"]);
import { normalizePath } from "../utils/helpers.js";
import { uiBus } from "../events/uiBus.js";
import { domainBus } from "../events/domainBus.js";
import * as ai from "../ai/aiGateway.js";
import { AI_PROVIDERS, DEFAULT_AI_PROVIDER, getProviderInfo } from "../ai/providers/index.js";
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
  declare abortController: any;
  declare analysis: any;
  declare backupService: any;
  declare bookService: any;
  declare changelogService: any;
  declare creationService: any;
  declare deletion: any;
  declare fileService: any;
  declare folders: any;
  declare issues: any;
  declare messageSeq: any;
  declare productivityService: any;
  declare saveQueue: any;
  declare skillLibrary: any;
  declare skillRunner: any;
  declare state: any;

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
    extra: any = {},
  ) {
    this.state = state;
    this.fileService = fileService;
    this.creationService = creationService;
    this.changelogService = changelogService;
    this.folders = extra.folders;
    this.deletion = extra.deletion;
    this.bookService = extra.bookService;
    this.issues = extra.issues;
    this.analysis = extra.analysis;
    /** Fila que serializa a gravação do log do chat (evita duas gravações simultâneas no mesmo arquivo). */
    this.saveQueue = Promise.resolve();
    /** Contador de mensagens enviadas (identifica em qual mensagem uma criação foi iniciada). */
    this.messageSeq = 0;
    /** Resposta em andamento (para o botão de parar do chat). */
    this.abortController = null;
    uiBus.on("ai:stop", () => this.abortCurrent());
  }

  /**
   * Carrega do disco as configurações de IA. O app aceita quantas contas de IA o autor quiser (cada uma com provedor,
   * apelido, chave e modelo); uma delas é a ativa. Configurações antigas (uma chave por provedor) são migradas para contas.
   * @returns {Promise<void>}
   */
  async loadSettings() {
    const saved = await window.electronAPI.getAiSettings();
    const base = saved && typeof saved === "object" ? saved : {};

    let accounts = Array.isArray(base.accounts) ? base.accounts : null;
    let activeAccount = base.activeAccount;
    const migrated = !accounts;
    if (!accounts) {
      accounts = [];
      const wanted = getProviderInfo(base.provider) ? base.provider : DEFAULT_AI_PROVIDER;
      for (const info of AI_PROVIDERS) {
        const config = base.providers?.[info.id];
        // Instalação nova (nada salvo): só o assistente embutido; as contas de IA de verdade o autor conecta depois
        if (config?.apiKey || (info.id === wanted && Object.keys(base).length > 0)) {
          accounts.push({
            id: `acc-${info.id}`,
            provider: info.id,
            nickname: info.label.replace(/ \(.*\)$/, ""),
            apiKey: config?.apiKey || "",
            model: config?.model || info.defaultModel,
          });
        }
      }
      activeAccount = `acc-${wanted}`;
    }
    // O assistente embutido (provedor "mock") sempre existe: o chat nunca fica sem provedor. Na primeira abertura (sem
    // nenhuma configuração salva) ele é a conta ativa, até o autor conectar uma IA de verdade.
    if (!accounts.some((a) => a.provider === "mock")) {
      accounts.unshift({ id: "acc-mock", provider: "mock", nickname: "Assistente Astra", apiKey: "", model: "mock-1" });
      if (migrated && Object.keys(base).length === 0) activeAccount = "acc-mock";
    }
    if (!accounts.some((a) => a.id === activeAccount)) activeAccount = accounts[0]?.id ?? null;

    this.state.aiSettings = {
      ...base,
      accounts,
      activeAccount,
      fallback: base.fallback || { enabled: false, chain: [] },
      analysis: base.analysis || {},
    };
    this.materialize();
    if (migrated) await this.persist();
  }

  /**
   * Reflete a conta ativa no restante do app: `state.aiProvider` e `state.aiSettings.providers[provedor]` (chave e modelo da
   * conta ativa), que é o que o gateway, o chat e as tools já leem.
   * @returns {void}
   * @private
   */
  materialize() {
    const settings = this.state.aiSettings;
    const active = settings.accounts.find((a) => a.id === settings.activeAccount);
    if (!active) return;
    this.state.aiProvider = active.provider;
    settings.provider = active.provider;
    settings.providers = { [active.provider]: { ...ai.accountExtras(active), apiKey: active.apiKey, model: active.model } };
  }

  /**
   * Grava as configurações de IA no disco.
   * @returns {Promise<boolean>}
   * @private
   */
  async persist() {
    const result = await window.electronAPI.saveAiSettings(this.state.aiSettings);
    return Boolean(result?.success);
  }

  /**
   * Contas de IA (com a chave, para uso interno; a interface só mostra os últimos caracteres).
   * @returns {Array<{id: string, provider: string, nickname: string, apiKey: string, model: string}>}
   */
  accounts() {
    return this.state.aiSettings.accounts || [];
  }

  /**
   * Conta de IA ativa.
   * @returns {Object|undefined}
   */
  activeAccount() {
    return this.accounts().find((a) => a.id === this.state.aiSettings.activeAccount);
  }

  /**
   * Aplica uma mudança nas contas, grava, registra a troca de provedor/modelo no changelog (nunca a chave) e avisa a
   * interface (configurações e centrais ficam sincronizadas).
   * @param {() => void} mutate - Altera `state.aiSettings` (contas e conta ativa).
   * @param {Object} [actor] - Quem alterou (padrão: usuário; o fallback automático usa o Sistema).
   * @returns {Promise<boolean>}
   * @private
   */
  async applyAccountChange(mutate, actor?) {
    const previous = { provider: this.state.aiProvider, model: this.getActiveModel() };
    mutate();
    this.materialize();
    if (!(await this.persist())) return false;
    this.publishUsage();

    const next = { provider: this.state.aiProvider, model: this.getActiveModel() };
    if (next.provider !== previous.provider || next.model !== previous.model) {
      this.changelogService?.recordSetting(
        { setting: "ai.model", from: `${previous.provider} · ${previous.model}`, to: `${next.provider} · ${next.model}` },
        actor,
      );
    }
    uiBus.emit("ai-accounts:changed");
    return true;
  }

  /**
   * Cria ou atualiza uma conta de IA.
   * @param {Object} account
   * @param {string} [account.id] - Id (omitido: cria uma conta nova).
   * @param {string} account.provider - Provedor.
   * @param {string} account.nickname - Apelido.
   * @param {string} [account.apiKey] - Chave (omitida ao editar: mantém a atual).
   * @param {string} [account.model] - Modelo.
   * @param {boolean} [account.activate] - Torna a conta a ativa.
   * @param {string} [account.baseUrl] - Endereço do servidor (Ollama e servidores compatíveis).
   * @param {"auto"|"native"|"simulated"} [account.toolMode] - Como usar tools: automático, nativo ou simulado.
   * @param {number} [account.numCtx] - Tamanho do contexto pedido ao Ollama (tokens).
   * @returns {Promise<string>} Id da conta.
   */
  async saveAccount({ id, provider, nickname, apiKey, model, activate = false, baseUrl, toolMode, numCtx }) {
    const info = getProviderInfo(provider);
    if (!info) throw new Error("Provedor inválido.");
    const label = String(nickname || "").trim() || info.label.replace(/ \(.*\)$/, "");
    const accountId = id || `acc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

    const ok = await this.applyAccountChange(() => {
      const accounts = this.state.aiSettings.accounts;
      const current = accounts.find((a) => a.id === accountId);
      if (current) {
        current.nickname = label;
        if (apiKey !== undefined) current.apiKey = String(apiKey).trim();
        if (model) current.model = model;
        if (baseUrl !== undefined) current.baseUrl = String(baseUrl).trim();
        if (toolMode !== undefined) current.toolMode = toolMode;
        if (numCtx !== undefined) current.numCtx = Number(numCtx) || undefined;
      } else {
        accounts.push({
          id: accountId,
          provider,
          nickname: label,
          apiKey: String(apiKey || "").trim(),
          model: model || info.defaultModel,
          ...(baseUrl ? { baseUrl: String(baseUrl).trim() } : {}),
          ...(toolMode ? { toolMode } : {}),
          ...(numCtx ? { numCtx: Number(numCtx) } : {}),
        });
      }
      if (activate || !this.state.aiSettings.activeAccount) this.state.aiSettings.activeAccount = accountId;
    });
    if (!ok) throw new Error("Não foi possível salvar a conta.");
    return accountId;
  }

  /**
   * Remove uma conta de IA (se era a ativa, a primeira restante passa a ser a ativa).
   * @param {string} id - Id da conta.
   * @returns {Promise<void>}
   */
  async removeAccount(id) {
    // O assistente embutido não pode ser removido
    if (this.state.aiSettings.accounts.find((a) => a.id === id)?.provider === "mock") return;
    await this.applyAccountChange(() => {
      const settings = this.state.aiSettings;
      settings.accounts = settings.accounts.filter((a) => a.id !== id);
      if (settings.activeAccount === id) settings.activeAccount = settings.accounts[0]?.id ?? null;
      if (settings.fallback) {
        settings.fallback.chain = (settings.fallback.chain || []).filter((c) => c.accountId !== id);
      }
    });
  }

  /**
   * Seleciona a conta ativa (e, opcionalmente, o modelo dela).
   * @param {string} id - Id da conta.
   * @param {string} [model] - Modelo.
   * @param {Object} [actor] - Quem alterou.
   * @returns {Promise<boolean>}
   */
  selectAccount(id, model, actor) {
    return this.applyAccountChange(() => {
      const settings = this.state.aiSettings;
      const account = settings.accounts.find((a) => a.id === id);
      if (!account) return;
      if (model) account.model = model;
      settings.activeAccount = id;
    }, actor);
  }

  /**
   * Salva uma parte das configurações de IA que não é conta (fallback de modelos, análise do livro).
   * @param {Object} patch - Campos a mesclar (ex.: `{ fallback: {...} }`).
   * @returns {Promise<boolean>}
   */
  async saveExtraSettings(patch) {
    this.state.aiSettings = { ...this.state.aiSettings, ...patch };
    const ok = await this.persist();
    if (ok) uiBus.emit("ai-accounts:changed");
    return ok;
  }

  /**
   * Busca na API do provider a lista de modelos disponíveis para a chave de uma conta.
   * @param {string} provider - ID do provider.
   * @param {string} [accountId] - Conta (padrão: a ativa, se for do provedor, ou a primeira do provedor com chave).
   * @returns {Promise<Array<{id: string, label: string}>|null>} Null se não houver chave ou suporte.
   */
  async listModels(provider, accountId) {
    const account =
      this.accounts().find((a) => a.id === accountId) ||
      (this.activeAccount()?.provider === provider ? this.activeAccount() : null) ||
      this.accounts().find((a) => a.provider === provider && a.apiKey);
    const info = getProviderInfo(provider);
    if (!account || !info || (info.requiresKey && !account.apiKey)) return null;

    const providerModule = await import(`../ai/providers/${provider}/index.ts`);
    if (typeof providerModule.listModels !== "function") return null;

    const models = await providerModule.listModels({ ...ai.accountExtras(account), apiKey: account.apiKey, model: account.model });
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
      account: this.activeAccount()?.nickname || "",
      providerLabel: getProviderInfo(provider)?.label || provider,
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
   * Interrompe a resposta da IA em andamento (botão de parar do chat).
   * @returns {boolean} Havia algo em andamento?
   */
  abortCurrent() {
    if (!this.abortController) return false;
    this.abortController.abort();
    return true;
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
   * @param {Object|null} [params.skill=null] - Execução de uma skill: a IA só pode usar as tools que ela declara.
   * @returns {Promise<{text: string, tokens: number, buttons: Array<{label: string, event: string, data: Object}>}>}
   * Texto da resposta do provedor ativo e os botões (ferramenta `show_buttons`) a exibir junto dela.
   */
  async sendMessage({ prompt, history = [], skill = null, unchanged = null, web = false }) {
    const bookPath = this.state.currentBookPath;
    const session = { locked: false, syncDenied: false, files: new Set() };

    // Cancelamento: o botão de parar do chat aciona `abortCurrent()`
    const controller = new AbortController();
    this.abortController = controller;
    setActiveSignal(controller.signal);

    const toolContext = {
      signal: controller.signal,
      state: this.state,
      fileService: this.fileService,
      creation: this.creationService,
      folders: this.folders,
      deletion: this.deletion,
      bookService: this.bookService,
      /** Central de Revisões (tools de issues). */
      issues: this.issues,
      /** Análise do livro (digests e fatos). */
      analysis: this.analysis,
      /** Biblioteca de skills e executor (tools `list_skills` e `run_skill`). */
      skills: this.skillLibrary,
      skillRunner: this.skillRunner,
      /** Backup e cronômetro (tools `backup_now` e `get_productivity`). */
      backup: this.backupService,
      productivity: this.productivityService,
      /** Registra leituras e identifica o autor das alterações no changelog. */
      changelog: this.changelogService,
      /** Identifica esta mensagem do usuário. */
      messageId: ++this.messageSeq,
      /** Conversa atual: a criação guiada confere se os dados obrigatórios vieram mesmo do autor. */
      conversation: { prompt, history },
      /** Botões registrados pela IA para esta resposta. */
      buttons: [],
      /** Execução de skill: só estas tools (mais as do chat). */
      allowedTools: skill ? skill.tools : undefined,
      /** Busca na internet nativa do provedor (skills com `web: true`; só onde o provedor oferece). */
      web: Boolean(web) && WEB_SEARCH_PROVIDERS.has(this.state.aiProvider),
      /** Execução de skill: arquivos inalterados desde a última execução (aparecem marcados no mapa e em list_files). */
      unchanged: unchanged ? new Set(unchanged) : null,
      /** Arquivos lidos nesta resposta (a skill guarda o hash deles). */
      readFiles: new Set(),

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

    if (web && !toolContext.web) {
      toolContext.notice?.("A busca na internet nativa não está disponível neste provedor (só Claude e Gemini): a skill vai usar apenas o que o modelo já sabe.");
    }
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

      return { text, buttons: toolContext.buttons, tokens: usage.inputTokens + usage.outputTokens, readFiles: [...toolContext.readFiles] };
    } catch (error) {
      // Interrupção pelo autor não é falha: não entra no log de erros nem muda o estado dos provedores
      if (error?.name === "AbortError") throw error;
      console.error(
        "[AiService] Erro ao enviar mensagem para o gateway:",
        error,
      );
      await this.handleError(error);
      throw error;
    } finally {
      if (this.abortController === controller) {
        this.abortController = null;
        setActiveSignal(null);
      }
      // A resposta terminou: skills que a IA pediu para executar entram na fila (execuções de skill não repetem isso)
      if (!skill) domainBus.emit("ai:turn-finished", {});
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

    const logEntry: any = {
      role: message.role,
      content: message.content,
      timestamp: message.timestamp || new Date().toISOString(),
    };
    if (Array.isArray(message.buttons) && message.buttons.length > 0) {
      logEntry.buttons = message.buttons;
    }
    // Mensagem de erro da IA: aparece no chat, mas não vai de contexto nas próximas mensagens
    if (message.error) logEntry.error = true;

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
      return Object.values<any>(folderTree.files)
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
