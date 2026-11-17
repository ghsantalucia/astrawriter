/**
 * @file Contador local de uso diário da IA, por provedor e modelo.
 *
 * As APIs (principalmente a do Gemini) não informam quanto da cota da conta ainda resta, então o app conta o que ele
 * mesmo enviou hoje. É uma estimativa útil (ex.: "hoje já usei 40 requisições neste modelo"), não a cota oficial.
 * Os dados ficam no `localStorage` e são zerados a cada novo dia (data local).
 */

const STORAGE_KEY = "draftweaver.aiDailyUsage";

/**
 * Data local atual no formato AAAA-MM-DD.
 * @returns {string}
 */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Lê o contador salvo (descartando dias anteriores).
 * @returns {{day: string, usage: Object<string, {requests: number, input: number, output: number}>}}
 */
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved?.day === today() && saved.usage) return saved;
  } catch {
    // localStorage indisponível ou corrompido: começa do zero
  }
  return { day: today(), usage: {} };
}

/**
 * Soma uma chamada ao contador do dia.
 * @param {string} provider - Provedor.
 * @param {string} model - Modelo.
 * @param {{requests?: number, input?: number, output?: number}} amount - Quantidade a somar.
 * @returns {void}
 */
export function addDailyUsage(provider, model, amount) {
  const data = load();
  const key = `${provider}|${model}`;
  const current = data.usage[key] || { requests: 0, input: 0, output: 0 };
  data.usage[key] = {
    requests: current.requests + (amount.requests || 0),
    input: current.input + (amount.input || 0),
    output: current.output + (amount.output || 0),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // sem persistência: o contador só vale até fechar o app
  }
}

/**
 * Uso de hoje para um provedor/modelo.
 * @param {string} provider - Provedor.
 * @param {string} model - Modelo.
 * @returns {{requests: number, input: number, output: number}}
 */
export function getDailyUsage(provider, model) {
  return (
    load().usage[`${provider}|${model}`] || { requests: 0, input: 0, output: 0 }
  );
}

const QUOTA_KEY = "draftweaver.aiLearnedQuotas";

/**
 * Memoriza a cota diária de requisições de um modelo, descoberta quando a API a informa ao estourar o limite.
 * É a única forma de saber o limite real da conta no Gemini: a API só revela o valor ao recusar a chamada.
 * @param {string} provider - Provedor.
 * @param {string} model - Modelo.
 * @param {number} requestsPerDay - Limite diário de requisições.
 * @returns {void}
 */
export function learnDailyQuota(provider, model, requestsPerDay) {
  try {
    const all = JSON.parse(localStorage.getItem(QUOTA_KEY) || "{}");
    all[`${provider}|${model}`] = requestsPerDay;
    localStorage.setItem(QUOTA_KEY, JSON.stringify(all));
  } catch {
    // sem persistência: a cota será aprendida de novo no próximo bloqueio
  }
}

/**
 * Cota diária de requisições já descoberta para um modelo.
 * @param {string} provider - Provedor.
 * @param {string} model - Modelo.
 * @returns {number|null} Limite diário ou null se ainda não foi descoberto.
 */
export function getDailyQuota(provider, model) {
  try {
    const all = JSON.parse(localStorage.getItem(QUOTA_KEY) || "{}");
    return all[`${provider}|${model}`] || null;
  } catch {
    return null;
  }
}
