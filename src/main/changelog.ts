/**
 * @file Changelog de cada livro: registra tudo o que é criado, alterado, excluído, restaurado (e lido pela IA) em
 * `<livro>/.system/changelog`, de forma que qualquer arquivo possa voltar a um estado anterior (rollback).
 *
 * Organização em disco (por tamanho, nunca por data):
 *  - `logs/log_0001.jsonl`: um registro por linha com as INFORMAÇÕES (quem, quando, o quê). Rotaciona a cada
 *    {@link MAX_LOG_ENTRIES} registros ou {@link MAX_LOG_BYTES}.
 *  - `contents/content_0001.jsonl`: um CONTEÚDO por linha (as diferenças de uma edição ou o texto de um arquivo
 *    excluído). Rotaciona ao passar de {@link MAX_CONTENT_BYTES} ou {@link MAX_CONTENT_ENTRIES}.
 *
 * O registro aponta para o conteúdo como uma "chave estrangeira": `content: { file, index }` (nome do arquivo de
 * conteúdo e número da linha nele, começando em 0). Registros sem conteúdo têm `content: null`.
 *
 * Restaurar uma versão NUNCA apaga registros: os registros posteriores ficam no log, marcados como
 * `purged: true`, e apenas o CONTEÚDO deles (as diferenças guardadas) é apagado, pois deixam de permitir rollback.
 *
 * Os salvamentos automáticos (rascunhos) são registrados como `autosave`: um único registro por "sessão" de edição de
 * um arquivo, que é atualizado a cada novo salvamento da sessão.
 *
 * Edições guardam hunks de diferenças por linha (o que foi removido e o que foi incluído, e em qual linha), o que
 * permite aplicar os registros de trás para frente até o estado idêntico ao original. Hashes (SHA-1) do antes e do
 * depois garantem que o rollback nunca seja aplicado sobre um arquivo diferente do esperado.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** Pasta do changelog, relativa à raiz do livro. */
export const CHANGELOG_DIR = ".system/changelog";

/** Máximo de registros por arquivo de log (~150 KB com registros típicos). */
const MAX_LOG_ENTRIES = 500;
/** Tamanho máximo, em bytes, de um arquivo de log. */
const MAX_LOG_BYTES = 256 * 1024;
/** Tamanho máximo, em bytes, de um arquivo de conteúdo (um conteúdo grande nunca é dividido). */
const MAX_CONTENT_BYTES = 1024 * 1024;
/** Máximo de conteúdos por arquivo de conteúdo. */
const MAX_CONTENT_ENTRIES = 200;
/** Limite de células da tabela LCS; acima disso o trecho alterado é tratado como trocado por inteiro. */
const MAX_LCS_CELLS = 4_000_000;

/** Ações que mudam o estado de um arquivo (e portanto entram no histórico e no rollback). */
const STATE_ACTIONS = new Set([
  "create",
  "update",
  "delete",
  "restore",
  "move",
]);

/** Ações que representam uma versão do arquivo (aparecem na lista do histórico). */
const VERSION_ACTIONS = new Set(["create", "update", "delete"]);

/** Sessões de salvamento automático em andamento: id da sessão -> dados do registro que ela mantém atualizado. */
const autosaveSessions = new Map();

/** Fila por livro: garante que os registros sejam gravados um de cada vez, na ordem de chegada. */
const queues = new Map();

/**
 * Executa uma tarefa na fila do livro, serializando as gravações.
 * @template T
 * @param {string} bookPath - Caminho do livro.
 * @param {() => Promise<T>} task - Tarefa assíncrona.
 * @returns {Promise<T>} Resultado da tarefa.
 */
function enqueue(bookPath, task) {
  const previous = queues.get(bookPath) || Promise.resolve();
  const run = previous.catch(() => {}).then(task);
  queues.set(bookPath, run);
  return run;
}

/**
 * Calcula o hash SHA-1 de um texto.
 * @param {string|null} text - Texto (null representa "arquivo inexistente").
 * @returns {string|null} Hash hexadecimal ou null.
 */
export function hashText(text) {
  if (text === null || text === undefined) return null;
  return crypto.createHash("sha1").update(text, "utf8").digest("hex");
}

// ========== Diferenças por linha ========== //

/**
 * @typedef {Object} Hunk
 * @property {number} oldStart - Índice (base 0) da primeira linha removida na versão antiga.
 * @property {number} newStart - Índice (base 0) da primeira linha incluída na versão nova.
 * @property {string[]} del - Linhas removidas (exatamente como estavam).
 * @property {string[]} ins - Linhas incluídas (exatamente como ficaram).
 */

/**
 * Compara dois textos linha a linha e devolve os blocos de alteração (hunks).
 * As linhas são separadas somente por "\n" (um "\r" fica dentro da linha), então juntar de volta com "\n" reproduz
 * o texto byte a byte.
 * @param {string} oldText - Versão antiga.
 * @param {string} newText - Versão nova.
 * @returns {Hunk[]} Blocos de alteração, em ordem crescente.
 */
export function computeHunks(oldText, newText) {
  const a = oldText.split("\n");
  const b = newText.split("\n");

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;

  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const n = endA - start;
  const m = endB - start;
  if (n === 0 && m === 0) return [];

  // Trecho grande demais para a tabela LCS: um único bloco trocado por inteiro
  if (n * m > MAX_LCS_CELLS) {
    return [
      {
        oldStart: start,
        newStart: start,
        del: a.slice(start, endA),
        ins: b.slice(start, endB),
      },
    ];
  }

  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[start + i] === b[start + j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }

  const hunks = [];
  let current = null;
  const flush = () => {
    if (current) hunks.push(current);
    current = null;
  };
  const open = (i, j) =>
    (current ??= {
      oldStart: start + i,
      newStart: start + j,
      del: [],
      ins: [],
    });

  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[start + i] === b[start + j]) {
      flush();
      i++;
      j++;
    } else if (
      j >= m ||
      (i < n && lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])
    ) {
      open(i, j).del.push(a[start + i]);
      i++;
    } else {
      open(i, j).ins.push(b[start + j]);
      j++;
    }
  }
  flush();
  return hunks;
}

/**
 * Desfaz os blocos de alteração: transforma a versão nova na versão antiga.
 * @param {string} newText - Versão nova (estado atual).
 * @param {Hunk[]} hunks - Blocos calculados por {@link computeHunks}.
 * @returns {string} Versão antiga.
 * @throws {Error} Se o texto não corresponde ao que o registro espera.
 */
export function revertHunks(newText, hunks) {
  const lines = newText.split("\n");

  // De trás para frente: aplicar o último bloco primeiro mantém válidos os índices dos anteriores
  for (let k = hunks.length - 1; k >= 0; k--) {
    const { newStart, ins, del } = hunks[k];
    const found = lines.slice(newStart, newStart + ins.length);
    if (found.length !== ins.length || found.some((l, x) => l !== ins[x])) {
      throw new Error("O conteúdo do arquivo não confere com o registro.");
    }
    lines.splice(newStart, ins.length, ...del);
  }
  return lines.join("\n");
}

// ========== Arquivos de log e de conteúdo ========== //

/**
 * Caminhos das pastas do changelog de um livro.
 * @param {string} bookPath - Caminho absoluto do livro.
 * @returns {{root: string, logs: string, contents: string}}
 */
function dirs(bookPath) {
  const root = path.join(bookPath, ...CHANGELOG_DIR.split("/"));
  return {
    root,
    logs: path.join(root, "logs"),
    contents: path.join(root, "contents"),
  };
}

/**
 * Lista os arquivos de uma pasta do changelog com um prefixo, em ordem crescente (do mais antigo ao mais novo).
 * @param {string} dir - Pasta.
 * @param {string} prefix - Prefixo (`log_` ou `content_`).
 * @returns {Promise<string[]>} Nomes dos arquivos.
 */
async function listFiles(dir, prefix) {
  try {
    const names = await fs.promises.readdir(dir);
    return names
      .filter((n) => n.startsWith(prefix) && n.endsWith(".jsonl"))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Monta o nome de um arquivo numerado.
 * @param {string} prefix - `log_` ou `content_`.
 * @param {number} number - Número sequencial.
 * @returns {string} Nome do arquivo.
 */
function numbered(prefix, number) {
  return `${prefix}${String(number).padStart(4, "0")}.jsonl`;
}

/**
 * Extrai o número de um nome de arquivo numerado.
 * @param {string} name - Nome do arquivo.
 * @returns {number} Número sequencial.
 */
function numberOf(name) {
  return Number(name.match(/(\d+)\.jsonl$/)?.[1] || 0);
}

/**
 * Lê as linhas JSON de um arquivo (linhas inválidas viram `undefined`, preservando os índices).
 * @param {string} file - Caminho do arquivo.
 * @returns {Promise<Array<Object|null|undefined>>} Valores, um por linha.
 */
async function readJsonLines(file) {
  let raw;
  try {
    raw = await fs.promises.readFile(file, "utf8");
  } catch {
    return [];
  }
  return raw
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return undefined;
      }
    });
}

/**
 * Regrava um arquivo JSONL com os valores informados.
 * @param {string} file - Caminho do arquivo.
 * @param {Array<Object|null>} values - Valores, um por linha.
 * @returns {Promise<void>}
 */
async function writeJsonLines(file, values) {
  const text = values.map((v) => JSON.stringify(v)).join("\n");
  await fs.promises.writeFile(file, text ? `${text}\n` : "", "utf8");
}

/**
 * Descobre o próximo id global e o arquivo de log onde gravar o próximo registro (rotacionando por tamanho).
 * @param {string} bookPath - Caminho do livro.
 * @returns {Promise<{file: string, nextId: number}>}
 */
async function prepareLogTarget(bookPath) {
  const { logs } = dirs(bookPath);
  await fs.promises.mkdir(logs, { recursive: true });

  const files = await listFiles(logs, "log_");
  if (files.length === 0) {
    return { file: path.join(logs, numbered("log_", 1)), nextId: 1 };
  }

  const last = files[files.length - 1];
  const lastPath = path.join(logs, last);
  const entries = (await readJsonLines(lastPath)).filter(Boolean);
  const stat = await fs.promises.stat(lastPath);

  // O último id vem do registro mais recente existente (arquivos esvaziados por restaurações são ignorados)
  let lastId = entries[entries.length - 1]?.id || 0;
  for (let k = files.length - 2; k >= 0 && lastId === 0; k--) {
    const older = (await readJsonLines(path.join(logs, files[k]))).filter(
      Boolean,
    );
    lastId = older[older.length - 1]?.id || 0;
  }

  const full = entries.length >= MAX_LOG_ENTRIES || stat.size >= MAX_LOG_BYTES;
  return {
    file: full
      ? path.join(logs, numbered("log_", numberOf(last) + 1))
      : lastPath,
    nextId: lastId + 1,
  };
}

/**
 * Grava um conteúdo no arquivo de conteúdo atual (criando um novo quando ele está cheio).
 * @param {string} bookPath - Caminho do livro.
 * @param {Object} payload - Conteúdo a guardar.
 * @returns {Promise<{file: string, index: number}>} Referência ("chave estrangeira") do conteúdo gravado.
 */
async function appendContent(bookPath, payload) {
  const { contents } = dirs(bookPath);
  await fs.promises.mkdir(contents, { recursive: true });

  const files = await listFiles(contents, "content_");
  let name = files[files.length - 1] || numbered("content_", 1);
  let lines = [];

  if (files.length > 0) {
    const current = path.join(contents, name);
    const stat = await fs.promises.stat(current);
    lines = await readJsonLines(current);

    if (stat.size >= MAX_CONTENT_BYTES || lines.length >= MAX_CONTENT_ENTRIES) {
      name = numbered("content_", numberOf(name) + 1);
      lines = [];
    }
  }

  const line = `${JSON.stringify(payload)}\n`;
  await fs.promises.appendFile(path.join(contents, name), line, "utf8");
  return { file: name, index: lines.length };
}

/**
 * Lê um conteúdo apontado por um registro.
 * @param {string} bookPath - Caminho do livro.
 * @param {{file: string, index: number}} ref - Referência do conteúdo.
 * @returns {Promise<Object|null>} Conteúdo ou null se foi removido.
 */
async function readContent(bookPath, ref) {
  const lines = await readJsonLines(
    path.join(dirs(bookPath).contents, ref.file),
  );
  return lines[ref.index] ?? null;
}

/**
 * Lê todos os registros de todos os arquivos de log, do mais antigo ao mais novo.
 * @param {string} bookPath - Caminho do livro.
 * @returns {Promise<Array<{file: string, entries: Object[]}>>}
 */
async function readAllLogs(bookPath) {
  const { logs } = dirs(bookPath);
  const files = await listFiles(logs, "log_");
  const result = [];
  for (const file of files) {
    const entries = (await readJsonLines(path.join(logs, file))).filter(
      Boolean,
    );
    result.push({ file, entries });
  }
  return result;
}

// ========== API pública ========== //

/**
 * Converte um caminho absoluto em caminho relativo ao livro (com "/").
 * @param {string} bookPath - Caminho do livro.
 * @param {string} filePath - Caminho absoluto do arquivo.
 * @returns {string|null} Caminho relativo ou null se estiver fora do livro ou dentro de `.system`.
 */
export function toRelative(bookPath, filePath) {
  const rel = path.relative(bookPath, filePath).replace(/\\/g, "/");
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  if (rel.split("/").some((part) => part.startsWith("."))) return null;
  return rel;
}

/**
 * Registra uma ação no changelog do livro.
 * @param {string} bookPath - Caminho absoluto do livro.
 * @param {Object} change
 * @param {{type: "user"|"ai"|"system", provider?: string, model?: string}} change.actor - Quem realizou a ação.
 * @param {"create"|"update"|"delete"|"read"|"restore"} change.action - Ação realizada.
 * @param {string} change.filePath - Caminho absoluto do arquivo.
 * @param {string|null} [change.before] - Conteúdo antes da ação (null se não existia).
 * @param {string|null} [change.after] - Conteúdo depois da ação (null se deixou de existir).
 * @param {Object} [change.meta] - Informações extras (ex.: motivo, ferramenta usada).
 * @param {"book"} [change.scope] - `book` para ações sobre o livro inteiro (sem arquivo específico).
 * @returns {Promise<Object|null>} Registro gravado ou null se nada foi registrado (ex.: edição sem mudança).
 */
export function recordChange(bookPath, change) {
  return enqueue(bookPath, async () => {
    // scope "book": ação sobre o livro inteiro (ex.: listagem de arquivos pela IA), registrada com o caminho "."
    const relPath =
      change.scope === "book" ? "." : toRelative(bookPath, change.filePath);
    if (!relPath) return null;

    let { action, before = null, after = null } = change;
    let content = null;
    const meta = { ...(change.meta || {}) };

    // Mover/renomear não altera o texto: o hash antes/depois é o do arquivo no novo caminho
    if (action === "move") {
      const text = await fs.promises
        .readFile(change.filePath, "utf8")
        .catch(() => null);
      before = text;
      after = text;
    }

    if (action === "update") {
      if (before === after) return null;
      const hunks = computeHunks(before ?? "", after ?? "");
      meta.added = hunks.reduce((sum, h) => sum + h.ins.length, 0);
      meta.removed = hunks.reduce((sum, h) => sum + h.del.length, 0);
      content = await appendContent(bookPath, { type: "update", hunks });
    } else if (action === "delete") {
      meta.removed = (before ?? "").split("\n").length;
      content = await appendContent(bookPath, {
        type: "delete",
        text: before ?? "",
      });
    }

    const target = await prepareLogTarget(bookPath);
    const entry = {
      id: target.nextId,
      ts: new Date().toISOString(),
      actor: change.actor || { type: "user" },
      action,
      path: relPath,
      content,
      hashBefore: hashText(before),
      hashAfter: hashText(after),
      ...(Object.keys(meta).length > 0 ? { meta } : {}),
    };

    await fs.promises.appendFile(
      target.file,
      `${JSON.stringify(entry)}\n`,
      "utf8",
    );
    return entry;
  });
}

/**
 * Registros (do mais antigo ao mais novo) que formam a "linha da vida" de um arquivo: os que mudam o seu estado,
 * seguindo os renomeios/movimentos (`move`) para trás e ignorando os registros já sem conteúdo (`purged`).
 * @param {Object[]} entries - Todos os registros do livro, do mais antigo ao mais novo.
 * @param {string} relPath - Caminho atual do arquivo, relativo ao livro.
 * @returns {Object[]} Registros do arquivo.
 */
function fileChain(entries, relPath) {
  let paths = new Set([relPath]);
  const chain = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!STATE_ACTIONS.has(entry.action) || !paths.has(entry.path)) continue;
    if (entry.purged) continue;
    chain.push(entry);
    if (entry.action === "move" && entry.meta?.from) {
      // Antes deste registro o arquivo se chamava de outra forma (e o nome novo ainda não existia)
      paths = new Set([...paths].filter((p) => p !== entry.path));
      paths.add(entry.meta.from);
    }
  }
  return chain.reverse();
}

/**
 * Versão "original": quando o primeiro registro de um arquivo é uma alteração (o arquivo já existia antes do
 * changelog), o estado anterior a ela também pode ser restaurado. O id é o do primeiro registro, negativado.
 * @param {Object[]} chain - Linha da vida do arquivo (do mais antigo ao mais novo).
 * @param {string} relPath - Caminho do arquivo.
 * @returns {Object|null}
 */
function originalVersion(chain, relPath) {
  const first = chain[0];
  const pseudo = (id, hash) => ({
    id,
    ts: null,
    actor: null,
    action: "original",
    path: relPath,
    hashAfter: hash,
    meta: {},
  });
  // O arquivo já existia antes do primeiro registro (que é uma alteração)
  if (first?.action === "update") return pseudo(-first.id, first.hashBefore);
  // O estado original foi restaurado (os registros dele foram descartados): o registro da restauração o representa
  if (first?.action === "restore" && first.meta?.toEntryId < 0) {
    return pseudo(first.meta.toEntryId, first.hashAfter);
  }
  return null;
}

/**
 * Lista o histórico de versões de um arquivo (mais recente primeiro).
 *
 * Regras:
 *  - registros sem conteúdo (apagados por uma restauração) não aparecem;
 *  - logo após restaurar uma versão, ela É a versão atual do arquivo e não aparece na lista (nem o registro da
 *    restauração): sobram apenas as versões anteriores a ela, e `restoredFrom` descreve a versão restaurada;
 *  - depois de uma nova alteração, a versão mais recente é a atual (marcada com `isCurrent`).
 * @param {string} bookPath - Caminho do livro.
 * @param {string} relPath - Caminho do arquivo relativo ao livro.
 * @returns {Promise<{entries: Object[], restoredFrom: Object|null}>}
 */
export async function listFileHistory(bookPath, relPath) {
  const all = (await readAllLogs(bookPath)).flatMap(({ entries }) => entries);
  const chain = fileChain(all, relPath);

  const original = originalVersion(chain, relPath);
  const last = [...chain].reverse().find((e) => e.action !== "move");
  let restoredFrom = null;
  let hiddenId = null;
  if (last?.action === "restore") {
    const toId = last.meta?.toEntryId;
    restoredFrom =
      original && toId === original.id
        ? original
        : chain.find((e) => e.id === toId) || null;
    // O original restaurado pode já não ter o registro que o originou (descartado): ele é o estado do próprio registro
    if (!restoredFrom && toId < 0)
      restoredFrom = originalVersion([last], relPath);
    hiddenId = restoredFrom?.id ?? null;
  }

  const versions = chain
    .filter((e) => VERSION_ACTIONS.has(e.action) && e.id !== hiddenId)
    .reverse()
    .map((e) => ({ ...e }));
  if (original && original.id !== hiddenId) versions.push(original);

  if (!restoredFrom && versions.length > 0) versions[0].isCurrent = true;
  return { entries: versions, restoredFrom };
}

/**
 * Lê uma página do changelog (um arquivo de log) para a lista corrida da tela de configurações.
 * Os registros vêm do mais recente para o mais antigo; `older` indica o próximo arquivo a carregar.
 * @param {string} bookPath - Caminho do livro.
 * @param {string|null} [file] - Arquivo de log a ler (null = o mais recente).
 * @returns {Promise<{file: string|null, entries: Object[], older: string|null}>}
 */
export async function readLogPage(bookPath, file = null) {
  const { logs } = dirs(bookPath);
  const files = await listFiles(logs, "log_");
  if (files.length === 0) return { file: null, entries: [], older: null };

  const name = file && files.includes(file) ? file : files[files.length - 1];
  const position = files.indexOf(name);
  const entries = (await readJsonLines(path.join(logs, name)))
    .filter(Boolean)
    .reverse();

  return {
    file: name,
    entries,
    older: position > 0 ? files[position - 1] : null,
  };
}

/**
 * Reconstrói (em memória, sem gravar nada) o conteúdo de um arquivo em uma versão do histórico, desfazendo de trás
 * para frente os registros posteriores. Cada passo é conferido pelos hashes.
 * @param {string} bookPath - Caminho do livro.
 * @param {string} filePath - Caminho absoluto do arquivo oficial.
 * @param {number} entryId - Id do registro da versão.
 * @returns {Promise<{content: string|null, later: Object[], logs: Array<{file: string, entries: Object[]}>, relPath: string}>}
 * @throws {Error} Se a versão não existe, não é restaurável ou o arquivo foi alterado fora do sistema.
 */
async function reconstruct(bookPath, filePath, entryId) {
  const relPath = toRelative(bookPath, filePath);
  if (!relPath) throw new Error("Arquivo fora do livro.");

  const logs = await readAllLogs(bookPath);
  const mine = fileChain(
    logs.flatMap(({ entries }) => entries),
    relPath,
  );

  // Id negativo: o estado original do arquivo (anterior ao primeiro registro)
  let later;
  if (entryId < 0) {
    const origin = originalVersion(mine, relPath);
    if (!origin || origin.id !== entryId) {
      throw new Error("Versão não encontrada no histórico.");
    }
    // Se o original é representado por um registro de restauração, só o que veio depois dele é desfeito
    later = mine[0].action === "restore" ? mine.slice(1) : mine;
  } else {
    const targetIndex = mine.findIndex((e) => e.id === entryId);
    if (targetIndex === -1)
      throw new Error("Versão não encontrada no histórico.");
    if (!VERSION_ACTIONS.has(mine[targetIndex].action)) {
      throw new Error("Este registro não é uma versão do arquivo.");
    }
    if (mine[targetIndex].action === "delete") {
      throw new Error("Esta versão representa a exclusão do arquivo.");
    }
    later = mine.slice(targetIndex + 1);
  }

  let current = await fs.promises.readFile(filePath, "utf8").catch(() => null);
  const latest = mine[mine.length - 1];
  if (hashText(current) !== latest.hashAfter) {
    throw new Error(
      "O arquivo foi modificado fora do Astra Writer desde o último registro. Por segurança, a restauração foi cancelada.",
    );
  }

  for (let k = later.length - 1; k >= 0; k--) {
    const entry = later[k];
    // "move" só muda o caminho: o hash dele pode ser de um estado já apagado por uma restauração anterior
    if (entry.action !== "move" && hashText(current) !== entry.hashAfter) {
      throw new Error(
        "A sequência de registros está inconsistente; restauração cancelada.",
      );
    }

    if (entry.action === "update") {
      const payload =
        entry.content && (await readContent(bookPath, entry.content));
      if (!payload?.hunks)
        throw new Error("Conteúdo de uma alteração não foi encontrado.");
      current = revertHunks(current ?? "", payload.hunks);
    } else if (entry.action === "delete") {
      const payload =
        entry.content && (await readContent(bookPath, entry.content));
      if (typeof payload?.text !== "string") {
        throw new Error(
          "O conteúdo de um arquivo excluído não foi encontrado.",
        );
      }
      current = payload.text;
    } else if (entry.action === "create") {
      current = null;
    }
    // "restore" e "move": o texto não muda; nada a desfazer

    if (
      VERSION_ACTIONS.has(entry.action) &&
      hashText(current) !== entry.hashBefore
    ) {
      throw new Error(
        "Não foi possível reconstruir a versão anterior; restauração cancelada.",
      );
    }
  }

  return { content: current, later, logs, relPath };
}

/**
 * Conteúdo (texto) de um arquivo em uma versão do histórico, sem alterar nada (usado na tela de comparação).
 * @param {string} bookPath - Caminho do livro.
 * @param {string} filePath - Caminho absoluto do arquivo oficial.
 * @param {number} entryId - Id do registro da versão.
 * @returns {Promise<{content: string|null, current: string|null}>} Texto da versão e texto atual do arquivo.
 */
export function previewVersion(bookPath, filePath, entryId) {
  return enqueue(bookPath, async () => {
    const { content } = await reconstruct(bookPath, filePath, entryId);
    const current = await fs.promises
      .readFile(filePath, "utf8")
      .catch(() => null);
    return { content, current };
  });
}

/**
 * Restaura um arquivo para a versão registrada em um ponto do histórico.
 *
 * Os registros posteriores NÃO são apagados (uma ação realizada nunca deixa de constar): eles são marcados com
 * `purged: true` e apenas o seu conteúdo guardado é apagado, pois deixam de permitir rollback.
 * Tudo é verificado (hashes) antes de qualquer gravação; se algo não confere, nada é alterado.
 * @param {string} bookPath - Caminho do livro.
 * @param {string} filePath - Caminho absoluto do arquivo oficial.
 * @param {number} entryId - Id do registro cuja versão será restaurada.
 * @param {{type: string, provider?: string, model?: string}} actor - Quem está restaurando.
 * @returns {Promise<{removed: number, content: string|null}>} Quantidade de registros que perderam o conteúdo e o texto final.
 * @throws {Error} Se o registro não existe, não é restaurável ou o arquivo foi alterado fora do sistema.
 */
export function restoreVersion(bookPath, filePath, entryId, actor) {
  return enqueue(bookPath, async () => {
    const {
      content: current,
      later,
      logs,
      relPath,
    } = await reconstruct(bookPath, filePath, entryId);

    // 1) Grava o arquivo no estado restaurado (e descarta o rascunho, que também fazia parte do "futuro")
    if (current === null) {
      await fs.promises.rm(filePath, { force: true });
    } else {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, current, "utf8");
    }
    await fs.promises.rm(`${filePath}.temp`, { force: true });

    // 2) Apaga apenas o CONTEÚDO dos registros posteriores e os marca como sem rollback
    const target = await prepareLogTarget(bookPath);
    // Registros de restaurações anteriores que vêm depois também ficam obsoletos (o "futuro" que foi descartado)
    const purgeIds = new Set(
      later
        .filter((e) => VERSION_ACTIONS.has(e.action) || e.action === "restore")
        .map((e) => e.id),
    );
    const { logs: logsDir, contents: contentsDir } = dirs(bookPath);

    const blank = new Map();
    for (const entry of later) {
      if (purgeIds.has(entry.id) && entry.content) {
        const list = blank.get(entry.content.file) || [];
        list.push(entry.content.index);
        blank.set(entry.content.file, list);
      }
    }
    for (const [file, indexes] of blank) {
      const contentFile = path.join(contentsDir, file);
      const lines = await readJsonLines(contentFile);
      // Mantém a posição das demais linhas: o conteúdo apagado vira null
      indexes.forEach((i) => {
        if (i < lines.length) lines[i] = null;
      });
      await writeJsonLines(
        contentFile,
        lines.map((l) => l ?? null),
      );
    }

    for (const { file, entries } of logs) {
      if (!entries.some((e) => purgeIds.has(e.id))) continue;
      const marked = entries.map((e) =>
        purgeIds.has(e.id)
          ? { ...e, purged: true, purgedBy: target.nextId }
          : e,
      );
      await writeJsonLines(path.join(logsDir, file), marked);
    }

    // 3) Registra a restauração
    const entry = {
      id: target.nextId,
      ts: new Date().toISOString(),
      actor: actor || { type: "user" },
      action: "restore",
      path: relPath,
      content: null,
      hashBefore: null,
      hashAfter: hashText(current),
      meta: { toEntryId: entryId, removed: purgeIds.size },
    };
    await fs.promises.appendFile(
      target.file,
      `${JSON.stringify(entry)}\n`,
      "utf8",
    );

    return { removed: purgeIds.size, content: current };
  });
}

// ========== Salvamento automático (uma entrada por sessão) ========== //

/**
 * Registra um salvamento automático (rascunho). Todos os salvamentos de uma mesma sessão de edição de um arquivo
 * atualizam o MESMO registro (data/hora, diferenças e contagem); uma nova sessão cria um novo registro.
 * @param {string} bookPath - Caminho absoluto do livro.
 * @param {Object} params
 * @param {string} params.sessionId - Identificador da sessão de edição (gerado pelo renderer).
 * @param {string} params.filePath - Caminho absoluto do arquivo oficial.
 * @param {string|null} params.before - Conteúdo efetivo do arquivo ANTES do primeiro salvamento da sessão
 *   (usado só quando a sessão ainda não existe).
 * @param {string} params.after - Conteúdo do rascunho depois deste salvamento.
 * @param {{type: string, provider?: string, model?: string}} params.actor - Quem editou.
 * @returns {Promise<Object|null>} Registro criado/atualizado.
 */
export function recordAutosave(bookPath, params) {
  return enqueue(bookPath, async () => {
    const relPath = toRelative(bookPath, params.filePath);
    if (!relPath) return null;

    const known = autosaveSessions.get(params.sessionId);
    const base = known ? known.base : (params.before ?? "");
    const hunks = computeHunks(base, params.after ?? "");
    const added = hunks.reduce((sum, h) => sum + h.ins.length, 0);
    const removed = hunks.reduce((sum, h) => sum + h.del.length, 0);
    const now = new Date().toISOString();

    // Sessão já existente: atualiza o registro e o conteúdo no mesmo lugar
    if (known) {
      const { logs: logsDir, contents: contentsDir } = dirs(bookPath);
      const logs = await readAllLogs(bookPath);
      const holder = logs.find(({ entries }) =>
        entries.some((e) => e.id === known.entryId),
      );

      if (holder) {
        const entries = holder.entries.map((e) =>
          e.id === known.entryId
            ? {
                ...e,
                ts: now,
                hashAfter: hashText(params.after),
                meta: {
                  ...e.meta,
                  saves: (e.meta?.saves || 1) + 1,
                  added,
                  removed,
                },
              }
            : e,
        );
        const contentFile = path.join(contentsDir, known.content.file);
        const lines = await readJsonLines(contentFile);
        if (known.content.index < lines.length) {
          lines[known.content.index] = { type: "autosave", hunks };
          await writeJsonLines(
            contentFile,
            lines.map((l) => l ?? null),
          );
        }
        await writeJsonLines(path.join(logsDir, holder.file), entries);
        return entries.find((e) => e.id === known.entryId);
      }
    }

    // Nova sessão
    const content = await appendContent(bookPath, { type: "autosave", hunks });
    const target = await prepareLogTarget(bookPath);
    const entry = {
      id: target.nextId,
      ts: now,
      actor: params.actor || { type: "user" },
      action: "autosave",
      path: relPath,
      content,
      hashBefore: hashText(base),
      hashAfter: hashText(params.after),
      meta: { session: params.sessionId, saves: 1, added, removed },
    };
    await fs.promises.appendFile(
      target.file,
      `${JSON.stringify(entry)}\n`,
      "utf8",
    );
    autosaveSessions.set(params.sessionId, {
      entryId: entry.id,
      content,
      base,
    });
    return entry;
  });
}
