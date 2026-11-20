// @ts-nocheck
/**
 * @file Links do app: endereços `app:` que, em vez de abrir um arquivo ou um site, abrem uma janela do próprio app (a gaveta
 * de configurações ou uma aba de uma central). Não há tela para o usuário criar esses links: eles são usados nos arquivos
 * do livro "Manual de Uso" ("para configurar uma IA, vá para a **Central de IA**" já com o link).
 *
 * Formatos:
 *   app:settings                    gaveta de configurações
 *   app:central/<central>           uma central (issues, book, ai, system), na primeira aba
 *   app:central/<central>/<aba>     uma aba da central (ex.: app:central/ai/model)
 *
 * Só abre janelas (nunca executa ações), então é seguro mesmo num livro importado de outra pessoa.
 */

const CENTRALS = new Set(["issues", "book", "ai", "system"]);

/**
 * Indica se um endereço é um link do app.
 * @param {string} href - Endereço.
 * @returns {boolean}
 */
export function isAppLink(href) {
  return /^app:/i.test(String(href || "").trim());
}

/**
 * Interpreta um link do app.
 * @param {string} href - Endereço (`app:...`).
 * @returns {{type: "settings"}|{type: "central", central: string, tab?: string}|null} Destino, ou null se for inválido.
 */
export function parseAppLink(href) {
  if (!isAppLink(href)) return null;
  const path = String(href).trim().slice(4).replace(/^\/+/, "").split(/[?#]/)[0].toLowerCase();
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "settings" && parts.length === 1) return { type: "settings" };
  if (parts[0] === "central" && CENTRALS.has(parts[1]) && parts.length <= 3) {
    if (parts[2] && !/^[a-z-]+$/.test(parts[2])) return null;
    return { type: "central", central: parts[1], ...(parts[2] ? { tab: parts[2] } : {}) };
  }
  return null;
}

/**
 * Abre a janela de um link do app.
 * @param {string} href - Endereço (`app:...`).
 * @param {Object} uiBus - Barramento de UI.
 * @returns {boolean} Foi um link válido?
 */
export function openAppLink(href, uiBus) {
  const target = parseAppLink(href);
  if (!target) return false;
  if (target.type === "settings") uiBus.emit("settings:open");
  else uiBus.emit("central:open", { central: target.central, tab: target.tab });
  return true;
}
