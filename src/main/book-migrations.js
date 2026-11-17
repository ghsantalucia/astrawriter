/**
 * @file Migrações de estrutura dos livros já existentes em disco, executadas ao listar os livros.
 *
 * Migração 1: as pastas de capítulo `content/cap_NNN` passaram a se chamar `content/chapter_NNN` (o projeto
 * usa nomes em inglês e "chapter" é mais claro). Além de renomear as pastas, a migração atualiza as referências ao
 * caminho antigo: o índice de capítulos, o config.json (estado do explorer) e os registros do changelog (para o
 * histórico dos arquivos continuar valendo no novo caminho).
 *
 * Migração 4: pastas estruturais ganham `userDelete: false` e `userRename: false` no folder.yml (só as pastas
 * criadas pelo usuário têm `true`).
 *
 * Migração 3: variável `aliases` (apelidos / nomes alternativos) nas fichas de personagens, ambientes e sistemas já
 * existentes, usada pelo botão "Linkar termos" do editor.
 *
 * Migração 2: permissão de exclusão (`userDelete` no frontmatter) nos arquivos estruturais — índices, sinopse,
 * linha do tempo e arquivos dos capítulos nunca podem ser excluídos pelo usuário.
 */

import fs from "node:fs";
import path from "node:path";
import { recordChange, CHANGELOG_DIR } from "./changelog.js";

/** Padrão do nome antigo de uma pasta de capítulo. */
const LEGACY_CHAPTER = /^cap_(\d+)$/i;

/**
 * Insere uma chave booleana no frontmatter (após `advanced`, `aiWrite` ou ao final), se ela ainda não existir.
 * @param {string} text - Conteúdo do arquivo.
 * @param {string} key - Chave a inserir.
 * @param {boolean} value - Valor da chave.
 * @returns {string} Conteúdo atualizado (o mesmo texto se a chave já existe ou não há frontmatter).
 */
export function insertFrontmatterFlag(text, key, value) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match || new RegExp(`^${key}:`, "m").test(match[1])) return text;

  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const anchor = match[1].match(/^(advanced|aiWrite):.*$/m);
  const line = `${key}: ${value}`;
  const front = anchor
    ? match[1].replace(anchor[0], `${anchor[0].replace(/\r$/, "")}${nl}${line}`)
    : `${match[1]}${nl}${line}`;
  return text.replace(match[1], () => front);
}

/**
 * Lista (recursivamente) os arquivos .md de uma pasta, ignorando pastas ocultas.
 * @param {string} dir - Pasta.
 * @returns {Promise<string[]>} Caminhos absolutos.
 */
async function listMarkdown(dir) {
  const files = [];
  let entries = [];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listMarkdown(full)));
    else if (entry.name.toLowerCase().endsWith(".md")) files.push(full);
  }
  return files;
}

/**
 * Garante a permissão de exclusão (`userDelete`) nos arquivos estruturais de um livro (ou do template):
 *  - índices, sinopse (`content/plot.md`), linha do tempo e arquivos dos capítulos: `userDelete: false`;
 *  - modelos de ficha (`template.md`): `userDelete: true`, herdado pelas fichas criadas a partir deles.
 * @param {string} bookPath - Caminho do livro (ou da pasta-modelo).
 * @param {{log?: boolean}} [options] - `log: false` não registra no changelog (usado no template).
 * @returns {Promise<number>} Quantidade de arquivos atualizados.
 */
export async function ensureDeleteFlags(bookPath, { log = true } = {}) {
  let updated = 0;
  const hasChangelog = fs.existsSync(
    path.join(bookPath, ...CHANGELOG_DIR.split("/")),
  );

  for (const file of await listMarkdown(bookPath)) {
    const rel = path.relative(bookPath, file).split(path.sep).join("/");
    const name = path.basename(rel).toLowerCase();

    let value = null;
    if (name === "template.md") value = true;
    else if (
      name === "index.md" ||
      rel === "content/plot.md" ||
      rel === "assets/timeline.md" ||
      /^content\/chapter_\d+\//i.test(rel)
    ) {
      value = false;
    }
    if (value === null) continue;

    const before = await fs.promises.readFile(file, "utf8");
    const after = insertFrontmatterFlag(before, "userDelete", value);
    if (after === before) continue;

    await fs.promises.writeFile(file, after, "utf8");
    updated += 1;
    if (log && hasChangelog) {
      await recordChange(bookPath, {
        action: "update",
        filePath: file,
        before,
        after,
        actor: { type: "system" },
        meta: {
          reason:
            "Permissão de exclusão (userDelete) adicionada ao frontmatter",
        },
      });
    }
  }
  return updated;
}

/** Rótulo da variável de apelidos, por pasta de fichas. */
const ALIAS_LABELS = {
  characters: "Apelidos (separados por vírgula)",
  places: "Nomes alternativos (separados por vírgula)",
  elements: "Nomes alternativos (separados por vírgula)",
};

/**
 * Insere a variável `aliases` no frontmatter de uma ficha (logo após a variável `title`), se ainda não existir.
 * @param {string} text - Conteúdo do arquivo.
 * @param {string} label - Texto de ajuda da variável.
 * @returns {string} Conteúdo atualizado (o mesmo texto se não houve alteração).
 */
export function insertAliasesVariable(text, label) {
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!front || /^ {2}aliases:/m.test(front[1])) return text;
  const nl = text.includes("\r\n") ? "\r\n" : "\n";

  // Ficha antiga sem bloco `data`: cria as variáveis de nome e de apelidos a partir do título
  if (!/^data:/m.test(front[1])) {
    const title =
      (front[1].match(/^title:\s*"?([^"\r\n]*)"?\s*$/m) || [])[1] || "";
    const block = [
      "data:",
      "  title:",
      `    placeholder: "Nome"`,
      "    required: true",
      `    content: "${title.replace(/"/g, "'")}"`,
      "  aliases:",
      `    placeholder: "${label}"`,
      "    required: false",
      '    content: ""',
    ].join(nl);
    return text.replace(front[1], () => `${front[1]}${nl}${block}`);
  }
  const titleBlock = /(^ {2}title:\r?\n(?: {4}[^\r\n]*\r?\n?)+)/m;
  if (!titleBlock.test(front[1])) return text;

  const updated = front[1].replace(titleBlock, (block) => {
    const end = block.endsWith("\n") ? "" : nl;
    return `${block}${end}  aliases:${nl}    placeholder: "${label}"${nl}    required: false${nl}    content: ""${nl}`;
  });
  return text.replace(front[1], () => updated.replace(/(\r?\n)+$/, ""));
}

/**
 * Garante a variável `aliases` nas fichas existentes do livro.
 * @param {string} bookPath - Caminho do livro.
 * @returns {Promise<number>} Quantidade de arquivos atualizados.
 */
export async function ensureAliasVariable(bookPath) {
  let updated = 0;
  const hasChangelog = fs.existsSync(
    path.join(bookPath, ...CHANGELOG_DIR.split("/")),
  );

  for (const [folder, label] of Object.entries(ALIAS_LABELS)) {
    const dir = path.join(bookPath, "assets", folder);
    let names = [];
    try {
      names = await fs.promises.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".md") || name === "index.md") continue;
      const file = path.join(dir, name);
      const before = await fs.promises.readFile(file, "utf8");
      const after = insertAliasesVariable(before, label);
      if (after === before) continue;

      await fs.promises.writeFile(file, after, "utf8");
      updated += 1;
      if (hasChangelog) {
        await recordChange(bookPath, {
          action: "update",
          filePath: file,
          before,
          after,
          actor: { type: "system" },
          meta: { reason: "Variável de apelidos (aliases) adicionada à ficha" },
        });
      }
    }
  }
  return updated;
}

/**
 * Lista (recursivamente) os arquivos folder.yml de uma pasta, ignorando pastas ocultas.
 * @param {string} dir - Pasta.
 * @returns {Promise<string[]>}
 */
async function listFolderYml(dir) {
  const files = [];
  let entries = [];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFolderYml(full)));
    else if (entry.name === "folder.yml") files.push(full);
  }
  return files;
}

/**
 * Garante `userDelete: false` e `userRename: false` nos folder.yml que ainda não definem essas permissões.
 * @param {string} bookPath - Caminho do livro (ou da pasta-modelo).
 * @param {{log?: boolean}} [options] - `log: false` não registra no changelog.
 * @returns {Promise<number>} Quantidade de arquivos atualizados.
 */
export async function ensureFolderFlags(bookPath, { log = true } = {}) {
  let updated = 0;
  const hasChangelog = fs.existsSync(
    path.join(bookPath, ...CHANGELOG_DIR.split("/")),
  );
  for (const file of await listFolderYml(bookPath)) {
    const before = await fs.promises.readFile(file, "utf8");
    if (/^userDelete:/m.test(before)) continue;
    const nl = before.includes("\r\n") ? "\r\n" : "\n";
    const base = before.endsWith("\n") ? before : before + nl;
    const after = `${base}userDelete: false${nl}userRename: false${nl}`;
    await fs.promises.writeFile(file, after, "utf8");
    updated += 1;
    if (log && hasChangelog) {
      await recordChange(bookPath, {
        action: "update",
        filePath: file,
        before,
        after,
        actor: { type: "system" },
        meta: {
          reason: "Permissões de pasta (userDelete/userRename) adicionadas",
        },
      });
    }
  }
  return updated;
}

/**
 * Migra um livro para a estrutura atual (idempotente: um livro já migrado não é alterado).
 * @param {string} bookPath - Caminho absoluto do livro.
 * @param {Object} [options]
 * @param {(task: () => Promise<any>) => Promise<any>} [options.pause] - Executa a tarefa com o observador de arquivos
 *   pausado (no Windows, pastas observadas não podem ser renomeadas).
 * @returns {Promise<{renamed: Array<{from: string, to: string}>}>} Pastas renomeadas.
 */
export async function migrateBook(bookPath, { pause = (task) => task() } = {}) {
  const contentDir = path.join(bookPath, "content");
  const renamed = [];

  let entries = [];
  try {
    entries = await fs.promises.readdir(contentDir, { withFileTypes: true });
  } catch {
    return { renamed };
  }

  for (const entry of entries) {
    const match = entry.isDirectory() && entry.name.match(LEGACY_CHAPTER);
    if (!match) continue;
    const target = `chapter_${match[1]}`;
    if (fs.existsSync(path.join(contentDir, target))) continue;
    await pause(() =>
      fs.promises.rename(
        path.join(contentDir, entry.name),
        path.join(contentDir, target),
      ),
    );
    renamed.push({ from: entry.name, to: target });
  }

  if (renamed.length > 0) {
    // 1) Registros do changelog: os caminhos dos arquivos dos capítulos mudaram (o conteúdo guardado não é tocado)
    const logsDir = path.join(bookPath, ...CHANGELOG_DIR.split("/"), "logs");
    if (fs.existsSync(logsDir)) {
      for (const name of await fs.promises.readdir(logsDir)) {
        if (!name.endsWith(".jsonl")) continue;
        const file = path.join(logsDir, name);
        const text = await fs.promises.readFile(file, "utf8");
        const next = text.replace(/(content\/)cap_(\d+)/gi, "$1chapter_$2");
        if (next !== text) await fs.promises.writeFile(file, next, "utf8");
      }
    }

    // 2) config.json: estado do explorer (pastas abertas e arquivo aberto)
    const configPath = path.join(bookPath, "config.json");
    if (fs.existsSync(configPath)) {
      const text = await fs.promises.readFile(configPath, "utf8");
      const next = text.replace(/([/\\])cap_(\d+)/gi, "$1chapter_$2");
      if (next !== text) await fs.promises.writeFile(configPath, next, "utf8");
    }

    // 3) Índice de capítulos: links para as pastas antigas (registrado no changelog como ajuste do sistema)
    const indexPath = path.join(contentDir, "index.md");
    if (fs.existsSync(indexPath)) {
      const before = await fs.promises.readFile(indexPath, "utf8");
      const after = before.replace(/(content\/)cap_(\d+)/gi, "$1chapter_$2");
      if (after !== before) {
        await fs.promises.writeFile(indexPath, after, "utf8");
        await recordChange(bookPath, {
          action: "update",
          filePath: indexPath,
          before,
          after,
          actor: { type: "system" },
          meta: {
            reason: "Pastas de capítulo renomeadas de cap_NNN para chapter_NNN",
          },
        });
      }
    }
  }

  await ensureDeleteFlags(bookPath);
  await ensureAliasVariable(bookPath);
  await ensureFolderFlags(bookPath);
  return { renamed };
}
