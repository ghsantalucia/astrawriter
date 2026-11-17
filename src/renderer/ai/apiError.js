/**
 * @file Erros das APIs de IA: classe com dados estruturados (status, detalhes, tempo de espera) e utilitários para
 * transformar respostas de erro em mensagens legíveis, identificando limites de cota (HTTP 429).
 */

/**
 * Erro retornado por uma API de IA.
 * @class
 * @extends Error
 */
export class AiApiError extends Error {
  /**
   * @param {string} message - Mensagem legível para o usuário.
   * @param {Object} info
   * @param {string} info.provider - Provedor (`claude`, `gemini`...).
   * @param {string} [info.model] - Modelo chamado.
   * @param {number} [info.status] - Status HTTP.
   * @param {*} [info.details] - Corpo/detalhes técnicos da resposta (vão para o log de erros).
   * @param {number} [info.retryAfterMs] - Tempo, em ms, até poder tentar de novo (se a API informou).
   * @param {"minute"|"day"|"other"} [info.quotaPeriod] - Período da cota estourada.
   * @param {number} [info.quotaValue] - Valor numérico da cota estourada (ex.: 20 requisições por dia), se informado.
   * @param {string} [info.quotaMetric] - Métrica da cota estourada (indica se conta requisições ou tokens).
   */
  constructor(message, info) {
    super(message);
    this.name = "AiApiError";
    this.provider = info.provider;
    this.model = info.model;
    this.status = info.status;
    this.details = info.details;
    this.retryAfterMs = info.retryAfterMs;
    this.quotaPeriod = info.quotaPeriod;
    this.quotaValue = info.quotaValue;
    this.quotaMetric = info.quotaMetric;
  }

  /** Indica se o erro é de limite de uso (cota ou taxa). */
  get isRateLimit() {
    return this.status === 429;
  }
}

/**
 * Formata uma duração em português (ex.: "2 h 5 min", "45 s").
 * @param {number} ms - Duração em milissegundos.
 * @returns {string}
 */
export function formatDuration(ms) {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  if (totalSeconds < 90) return `${totalSeconds} s`;
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 90) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

/**
 * Calcula o instante (ms) da próxima meia-noite no fuso do Pacífico, quando as cotas diárias do Gemini renovam.
 * @param {number} [now=Date.now()] - Instante atual.
 * @returns {number} Timestamp em ms.
 */
export function nextPacificMidnight(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  const secondsSinceMidnight =
    (get("hour") % 24) * 3600 + get("minute") * 60 + get("second");
  return now + (86400 - secondsSinceMidnight) * 1000;
}

/**
 * Converte o corpo de erro do Gemini em um {@link AiApiError} legível.
 * @param {number} status - Status HTTP.
 * @param {Object|null} data - Corpo JSON da resposta.
 * @param {string} statusText - Texto do status HTTP.
 * @param {string} model - Modelo chamado.
 * @returns {AiApiError}
 */
export function buildGeminiError(status, data, statusText, model) {
  const detail = data?.error?.message || statusText;
  const details = data?.error?.details || [];
  const info = { provider: "gemini", model, status, details: data || detail };

  if (status === 429) {
    const violation =
      details
        .filter((d) => String(d["@type"]).includes("QuotaFailure"))
        .flatMap((d) => d.violations || [])
        .find((v) => v.quotaId || v.quotaMetric) || {};
    const quotaId = violation.quotaId || violation.quotaMetric || "";
    const quotaValue = Number(violation.quotaValue) || undefined;
    const retry = details.find((d) => String(d["@type"]).includes("RetryInfo"));
    const retrySeconds = parseFloat(retry?.retryDelay) || 0;

    const isDaily = /PerDay/i.test(quotaId);
    const isMinute = /PerMinute/i.test(quotaId);
    const retryAfterMs = isDaily
      ? nextPacificMidnight() - Date.now()
      : retrySeconds * 1000 || undefined;
    const period = isDaily ? "diário" : isMinute ? "por minuto" : "";

    return new AiApiError(
      `Limite de uso do Gemini atingido para o modelo ${model}${period ? ` (limite ${period})` : ""}.${
        retryAfterMs
          ? ` Tente novamente em cerca de ${formatDuration(retryAfterMs)}`
          : ""
      }${isDaily ? " (a cota diária renova à meia-noite do horário do Pacífico)." : retryAfterMs ? "." : " Aguarde um pouco ou troque de modelo/chave."}`,
      {
        ...info,
        retryAfterMs,
        quotaPeriod: isDaily ? "day" : isMinute ? "minute" : "other",
        quotaValue,
        quotaMetric: violation.quotaMetric,
      },
    );
  }

  return new AiApiError(describeStatus("Gemini", status, detail), info);
}

/**
 * Converte a resposta de erro da API da Anthropic em um {@link AiApiError} legível.
 * @param {Response} response - Resposta HTTP.
 * @param {Object|null} data - Corpo JSON da resposta.
 * @param {string} model - Modelo chamado.
 * @returns {AiApiError}
 */
export function buildClaudeError(response, data, model) {
  const status = response.status;
  const detail = data?.error?.message || response.statusText;
  const info = {
    provider: "claude",
    model,
    status,
    details: { body: data, headers: collectClaudeHeaders(response.headers) },
  };

  if (status === 429) {
    const retrySeconds = parseFloat(response.headers.get("retry-after")) || 0;
    const retryAfterMs = retrySeconds * 1000 || undefined;
    return new AiApiError(
      `Limite de uso do Claude atingido para o modelo ${model}.${
        retryAfterMs
          ? ` Tente novamente em cerca de ${formatDuration(retryAfterMs)}.`
          : ""
      } ${detail}`,
      { ...info, retryAfterMs, quotaPeriod: "other" },
    );
  }

  return new AiApiError(describeStatus("Claude", status, detail), info);
}

/**
 * Mensagem legível para os status HTTP mais comuns.
 * @param {string} name - Nome do provedor.
 * @param {number} status - Status HTTP.
 * @param {string} detail - Mensagem original da API.
 * @returns {string}
 */
function describeStatus(name, status, detail) {
  switch (status) {
    case 400:
      return `${name}: requisição inválida (400). ${detail}`;
    case 401:
    case 403:
      return `${name}: chave de API inválida ou sem permissão (${status}). Confira-a em Configurações.`;
    case 404:
      return `${name}: modelo não encontrado (404). Escolha outro em Configurações. ${detail}`;
    case 429:
      return `${name}: limite de uso atingido (429). ${detail}`;
    case 500:
    case 502:
    case 503:
    case 529:
      return `${name} está indisponível ou sobrecarregado (${status}). Tente novamente em instantes.`;
    default:
      return `${name} API (${status}): ${detail}`;
  }
}

/**
 * Reúne os cabeçalhos de limite de uso da Anthropic.
 * @param {Headers} headers - Cabeçalhos da resposta.
 * @returns {Object<string, string>}
 */
export function collectClaudeHeaders(headers) {
  const out = {};
  headers.forEach((value, key) => {
    if (key.startsWith("anthropic-ratelimit") || key === "retry-after") {
      out[key] = value;
    }
  });
  return out;
}

/**
 * Extrai os limites de uso informados pela Anthropic nos cabeçalhos de uma resposta bem-sucedida.
 * @param {Headers} headers - Cabeçalhos da resposta.
 * @returns {{tokensRemaining?: number, tokensLimit?: number, requestsRemaining?: number, requestsLimit?: number, resetAt?: number}|null}
 */
export function parseClaudeRateLimits(headers) {
  const num = (name) => {
    const value = headers.get(`anthropic-ratelimit-${name}`);
    return value === null || value === "" ? undefined : Number(value);
  };
  const reset = headers.get("anthropic-ratelimit-tokens-reset");

  const limits = {
    tokensRemaining: num("tokens-remaining"),
    tokensLimit: num("tokens-limit"),
    requestsRemaining: num("requests-remaining"),
    requestsLimit: num("requests-limit"),
    resetAt: reset ? Date.parse(reset) || undefined : undefined,
  };
  return Object.values(limits).some((v) => v !== undefined) ? limits : null;
}
