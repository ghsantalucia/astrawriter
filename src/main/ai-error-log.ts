/**
 * @file Log persistente dos erros retornados pela IA (`<dados do usuário>/ai/errors.log`).
 *
 * Cada linha é um registro JSON. Para o arquivo não crescer indefinidamente, quando ele passa de
 * {@link MAX_BYTES} os registros mais antigos são descartados até restar cerca de {@link KEEP_BYTES}.
 */

import fs from "node:fs";
import path from "node:path";

/** Tamanho a partir do qual o log é "podado". */
const MAX_BYTES = 256 * 1024;
/** Tamanho aproximado mantido após a poda (os registros mais recentes). */
const KEEP_BYTES = 128 * 1024;
/** Tamanho máximo, em caracteres, de cada campo de texto de um registro. */
const MAX_FIELD_CHARS = 4000;

/**
 * Limita o tamanho de um texto.
 * @param {*} value - Valor a limitar.
 * @returns {string|undefined} Texto truncado.
 */
function clip(value) {
  if (value === undefined || value === null) return undefined;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > MAX_FIELD_CHARS
    ? `${text.slice(0, MAX_FIELD_CHARS)}… [truncado]`
    : text;
}

/**
 * Caminho do arquivo de log.
 * @param {string} userDataDir - Pasta de dados do usuário do Electron.
 * @returns {string}
 */
export function errorLogPath(userDataDir) {
  return path.join(userDataDir, "ai", "errors.log");
}

/**
 * Descarta os registros mais antigos quando o arquivo ultrapassa o limite.
 * @param {string} file - Caminho do log.
 * @returns {Promise<void>}
 */
async function trim(file) {
  const stat = await fs.promises.stat(file);
  if (stat.size <= MAX_BYTES) return;

  const lines = (await fs.promises.readFile(file, "utf8"))
    .split("\n")
    .filter(Boolean);
  let size = 0;
  const kept = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    size += Buffer.byteLength(lines[i]) + 1;
    if (size > KEEP_BYTES) break;
    kept.unshift(lines[i]);
  }
  await fs.promises.writeFile(file, `${kept.join("\n")}\n`, "utf8");
}

/**
 * Acrescenta um erro ao log.
 * @param {string} userDataDir - Pasta de dados do usuário.
 * @param {Object} error
 * @param {string} [error.provider] - Provedor de IA.
 * @param {string} [error.model] - Modelo usado.
 * @param {number} [error.status] - Status HTTP, se houver.
 * @param {string} error.message - Mensagem do erro.
 * @param {*} [error.details] - Detalhes técnicos (corpo da resposta, quota etc.).
 * @param {string} [error.book] - Livro ativo.
 * @returns {Promise<void>}
 */
export async function appendAiError(userDataDir, error) {
  const file = errorLogPath(userDataDir);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });

  const entry = {
    ts: new Date().toISOString(),
    provider: clip(error.provider),
    model: clip(error.model),
    status: error.status,
    message: clip(error.message),
    details: clip(error.details),
    book: clip(error.book),
  };
  await fs.promises.appendFile(file, `${JSON.stringify(entry)}\n`, "utf8");
  await trim(file);
}

/**
 * Lê os registros do log, do mais recente para o mais antigo.
 * @param {string} userDataDir - Pasta de dados do usuário.
 * @returns {Promise<Object[]>} Registros.
 */
export async function readAiErrors(userDataDir) {
  try {
    const raw = await fs.promises.readFile(errorLogPath(userDataDir), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { ts: null, message: line };
        }
      })
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Apaga todo o log de erros.
 * @param {string} userDataDir - Pasta de dados do usuário.
 * @returns {Promise<void>}
 */
export async function clearAiErrors(userDataDir) {
  await fs.promises.rm(errorLogPath(userDataDir), { force: true });
}
