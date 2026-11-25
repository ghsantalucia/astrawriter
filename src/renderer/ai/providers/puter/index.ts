/**
 * @file Provedor Puter, pela biblioteca oficial `puter.js` (que roda no processo principal; o token não sai de lá). A conversa
 * e a lista de modelos vão por IPC. Usa o mesmo laço de tools do provedor compatível com a OpenAI (tools nativas, com o modo
 * simulado de reserva).
 *
 * O Puter cobra pelo uso: contas sem assinatura recebem o erro 402 ("subscription_required") em modelos pagos.
 */

import { t } from "../../../../shared/i18n.js";
import { AiApiError } from "../../apiError.js";
import { createCompatProvider } from "../openaiCompat.js";

/** Valor do seletor para "o Puter escolhe o modelo". */
export const AUTO_MODEL = "auto";

/** Marca do provedor (a biblioteca fala com o servidor do Puter por conta própria). */
export const PUTER_URL = "puter.js";

/**
 * Converte o erro devolvido pelo processo principal em {@link AiApiError} legível.
 * @param {{status?: number, code?: string, message: string}} error - Erro serializado.
 * @param {string} model - Modelo.
 * @returns {AiApiError}
 */
function puterError(error, model = "") {
  const status = error?.status;
  const detail = error?.message || t("erro desconhecido");
  let reason = status ? t("erro {status}. {detail}", { status, detail }) : t("erro. {detail}", { detail });
  if (status === 401 || status === 403) reason = t("token inválido ou sem permissão ({status}). Crie outro em puter.com/dashboard.", { status });
  else if (status === 402) reason = t("este modelo exige uma assinatura do Puter (402). Escolha outro modelo ou assine em puter.com. ({detail})", { detail });
  else if (status === 429) reason = t("limite de uso do Puter atingido (429). {detail}", { detail });
  return new AiApiError(`Puter: ${reason}`, { provider: "puter", model, status, details: error });
}

/** Transporte: o chat passa pela biblioteca oficial, no processo principal. */
async function request({ body, apiKey, model }: { body?: any; apiKey?: any; model?: any; [k: string]: any }) {
  const result = await window.electronAPI.puterChat({
    token: apiKey,
    // "auto": não escolhe modelo; o Puter usa o padrão da conta (contas gratuitas podem não ter acesso a todos)
    model: body.model === AUTO_MODEL ? undefined : body.model,
    messages: body.messages,
    tools: body.tools,
  });
  if (!result?.ok) throw puterError(result?.error, model);
  return result.data;
}

/** Lista de modelos da conta. */
async function models(config) {
  const result = await window.electronAPI.puterModels({ token: config.apiKey });
  if (!result?.ok) throw puterError(result?.error);
  return [{ id: AUTO_MODEL, label: t("Automático (o Puter escolhe o modelo)") }, ...result.models];
}

export const { sendRequest, listModels } = createCompatProvider({ id: "puter", label: "Puter", baseUrl: PUTER_URL, request, models });
