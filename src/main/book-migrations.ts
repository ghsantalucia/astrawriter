// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Migrações de estrutura dos livros já existentes em disco, executadas ao listar os livros.
 *
 * Migração 1: as pastas de capítulo `content/cap_NNN` passaram a se chamar `content/chapter_NNN` (o projeto
 * usa nomes em inglês e "chapter" é mais claro). Além de renomear as pastas, a migração atualiza as referências ao
 * caminho antigo: o índice de capítulos, o config.json (estado do explorer) e os registros do changelog (para o
 * histórico dos arquivos continuar valendo no novo caminho).
 *
 * Migração 7: capítulos com só três arquivos (esboço, manuscrito e análise; sem a pasta backlog).
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
import { templatesDir } from "./paths.js";

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
      rel === "assets/events/timeline.md" ||
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
 * Marca as variáveis "after" e "before" de uma ficha de evento como lista de eventos (`type: events`), para o editor
 * mostrar a caixa com sugestões dos eventos cadastrados.
 * @param {string} text - Conteúdo da ficha.
 * @returns {string} Conteúdo atualizado (o mesmo texto se não houve alteração).
 */
export function insertEventsType(text) {
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!front) return text;
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = front[1].split(/\r?\n/);
  let changed = false;
  for (const name of ["after", "before"]) {
    const start = lines.findIndex((l) => l === `  ${name}:`);
    if (start < 0) continue;
    let end = start + 1;
    while (end < lines.length && /^ {3,}/.test(lines[end])) end++;
    const block = lines.slice(start + 1, end);
    if (block.some((l) => /^ {4}type:/.test(l))) continue;
    // O tipo entra logo depois do texto de ajuda (ou no começo do bloco)
    const at = block.findIndex((l) => /^ {4}placeholder:/.test(l));
    lines.splice(start + 1 + (at >= 0 ? at + 1 : 0), 0, "    type: events");
    changed = true;
  }
  return changed ? text.replace(front[1], () => lines.join(nl)) : text;
}

/**
 * Garante o tipo `events` nas variáveis "antes" e "depois" das fichas de eventos existentes.
 * @param {string} bookPath - Caminho do livro.
 * @returns {Promise<number>} Quantidade de arquivos atualizados.
 */
export async function ensureEventsType(bookPath) {
  const dir = path.join(bookPath, "assets", "events");
  let names = [];
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    return 0;
  }
  const hasChangelog = fs.existsSync(path.join(bookPath, ...CHANGELOG_DIR.split("/")));
  let updated = 0;
  for (const name of names) {
    if (!/\.md(\.temp)?$/.test(name) || /^(index|timeline)\.md/.test(name)) continue;
    const file = path.join(dir, name);
    const before = await fs.promises.readFile(file, "utf8");
    const after = insertEventsType(before);
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
        meta: { reason: 'Campos "antes" e "depois" do evento passam a ser uma lista de eventos' },
      });
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
 * Remove a linha `aiWrite` do frontmatter de um arquivo (ou de um folder.yml), se existir.
 * @param {string} text - Conteúdo do arquivo.
 * @param {boolean} isYaml - Se o arquivo é YAML puro (folder.yml) e não Markdown com frontmatter.
 * @returns {string} Conteúdo sem a linha (o mesmo texto se não havia).
 */
export function removeAiWriteFlag(text, isYaml = false) {
  const line = /^aiWrite:[^\r\n]*\r?\n?/m;
  if (isYaml) return text.replace(line, "");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match || !line.test(match[1] + "\n")) return text;
  const front = (match[1] + "\n").replace(line, "").replace(/\r?\n$/, "");
  return text.replace(match[1], () => front);
}

/**
 * Migração 5: em `notes/`, só o `notes/folder.yml` define `aiWrite`; os arquivos e as subpastas herdam dele
 * (a permissão é resolvida subindo de pasta em pasta até a raiz do livro).
 * @param {string} bookPath - Caminho do livro.
 * @returns {Promise<number>} Quantidade de arquivos atualizados.
 */
export async function ensureNotesInheritAiWrite(bookPath) {
  const notesDir = path.join(bookPath, "notes");
  if (!fs.existsSync(notesDir)) return 0;
  let updated = 0;
  const hasChangelog = fs.existsSync(
    path.join(bookPath, ...CHANGELOG_DIR.split("/")),
  );

  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      const lower = entry.name.toLowerCase();
      const isYaml = lower === "folder.yml";
      if (!isYaml && !lower.endsWith(".md") && !lower.endsWith(".md.temp")) {
        continue;
      }
      // O folder.yml da raiz de notes mantém o aiWrite (é onde o botão do explorer escreve)
      if (isYaml && dir === notesDir) continue;

      const before = await fs.promises.readFile(full, "utf8");
      const after = removeAiWriteFlag(before, isYaml);
      if (after === before) continue;
      await fs.promises.writeFile(full, after, "utf8");
      updated += 1;
      if (hasChangelog && !lower.endsWith(".temp")) {
        await recordChange(bookPath, {
          action: "update",
          filePath: full,
          before,
          after,
          actor: { type: "system" },
          meta: {
            reason:
              "aiWrite removido: passa a ser herdado do folder.yml de notes",
          },
        });
      }
    }
  }

  await walk(notesDir);
  return updated;
}

/**
 * O "Índice de Eventos" e a "Linha do Tempo" são a mesma coisa: a linha do tempo é o índice da categoria. Livros antigos
 * têm os dois arquivos: os eventos que só o índice listava passam para a linha do tempo (o sistema a reordena depois) e o
 * índice é removido; os links para ele passam a apontar para a linha do tempo.
 * @param {string} bookPath - Caminho do livro.
 * @returns {Promise<void>}
 */
export async function mergeEventsIndexIntoTimeline(bookPath) {
  const events = path.join(bookPath, "assets", "events");
  const indexFile = path.join(events, "index.md");
  const indexDraft = `${indexFile}.temp`;
  if (!fs.existsSync(indexFile) && !fs.existsSync(indexDraft)) return;
  const timeline = path.join(events, "timeline.md");

  if (fs.existsSync(timeline)) {
    try {
      const indexText = await fs.promises.readFile(fs.existsSync(indexFile) ? indexFile : indexDraft, "utf8");
      let text = await fs.promises.readFile(timeline, "utf8");
      const missing = [];
      for (const line of indexText.split(/\r?\n/)) {
        const m = line.match(/^\s*[-*]\s*\[([^\]]*)\]\(\/?(assets\/events\/[^)\s]+\.md)\)/i);
        if (!m || /timeline\.md$|index\.md$|template\.md$/i.test(m[2])) continue;
        if (!text.toLowerCase().includes(m[2].toLowerCase())) missing.push(`- [${m[1]}](/${m[2]})`);
      }
      if (missing.length) {
        text = `${text.replace(/\s+$/, "")}\n\n${missing.join("\n")}\n`;
        await fs.promises.writeFile(timeline, text, "utf8");
      }
    } catch {
      // sem o conteúdo do índice, só remove o arquivo
    }
  }
  fs.rmSync(indexFile, { force: true });
  fs.rmSync(indexDraft, { force: true });
  await recordChange(bookPath, {
    action: "delete",
    filePath: indexFile,
    actor: { type: "system" },
    meta: { reason: "Índice de Eventos unificado com a Linha do Tempo" },
  }).catch(() => null);

  for (const file of await listMarkdown(bookPath)) {
    const before = await fs.promises.readFile(file, "utf8");
    const after = before.replace(/(\]\(\/?)assets\/events\/index\.md/g, "$1assets/events/timeline.md");
    if (after !== before) await fs.promises.writeFile(file, after, "utf8");
  }
}

/**
 * Migração 6: categoria de eventos (`assets/events`) e linha do tempo dentro dela. Cria a pasta com os arquivos do modelo
 * (se faltarem), move `assets/timeline.md` (e o rascunho) para `assets/events/timeline.md` e corrige os links para ele.
 * @param {string} bookPath - Caminho do livro.
 * @returns {Promise<void>}
 */
export async function ensureEventsCategory(bookPath) {
  const assets = path.join(bookPath, "assets");
  if (!fs.existsSync(assets)) return;
  const events = path.join(assets, "events");
  const model = path.join(templatesDir(), "assets", "events");

  await fs.promises.mkdir(events, { recursive: true });
  for (const name of ["folder.yml", "template.md"]) {
    const target = path.join(events, name);
    const source = path.join(model, name);
    if (!fs.existsSync(target) && fs.existsSync(source)) {
      await fs.promises.copyFile(source, target);
    }
  }

  await mergeEventsIndexIntoTimeline(bookPath);

  let moved = false;
  for (const suffix of ["", ".temp"]) {
    const from = path.join(assets, `timeline.md${suffix}`);
    const to = path.join(events, `timeline.md${suffix}`);
    if (!fs.existsSync(from) || fs.existsSync(to)) continue;
    await fs.promises.rename(from, to);
    moved = true;
    if (!suffix) {
      await recordChange(bookPath, {
        action: "move",
        filePath: to,
        actor: { type: "system" },
        meta: { from: "assets/timeline.md" },
      }).catch(() => null);
    }
  }
  if (!moved) return;

  // Links antigos para a linha do tempo
  for (const file of await listMarkdown(bookPath)) {
    const before = await fs.promises.readFile(file, "utf8");
    const after = before.replace(
      /(\]\(\/?)assets\/timeline\.md/g,
      "$1assets/events/timeline.md",
    );
    if (after !== before) await fs.promises.writeFile(file, after, "utf8");
  }
}

/** Hashes (SHA-1 do corpo normalizado) dos antigos arquivos de backlog quando nunca foram editados pelo autor. */
const PRISTINE_BACKLOG = {
  "1_analysis.md": "4bd1982dee8d3ab47545b62cddec16a246547c9b",
  "2_foreshadowing.md": "c7a83e0b469c7e916aa0a2f450745854a96c4891",
  "3_roadmap.md": "01e7ec98005d65e9d84e3fa278278409e4b4b36a",
};

/**
 * Corpo de um arquivo Markdown sem o frontmatter e com quebras de linha normalizadas.
 * @param {string} text - Conteúdo.
 * @returns {string}
 */
function bodyOf(text) {
  return text.split("\r\n").join("\n").replace(/^---[\s\S]*?\n---\n/, "").trim();
}

/**
 * Migração 7: cada capítulo passa a ter só três arquivos — `1_outline.md` (Esboço, antigo `1_script.md`),
 * `2_draft.md` (Manuscrito, inalterado) e `3_analysis.md` (Análise, que reúne a antiga pasta `backlog`: análise,
 * planejamento e foreshadowing). O conteúdo escrito pelo autor nunca é perdido: os arquivos do backlog que ainda são os
 * do modelo são descartados; os editados viram seções da análise. Tudo é registrado no changelog (com o conteúdo, para
 * rollback) e os links antigos são atualizados.
 * @param {string} bookPath - Caminho absoluto do livro.
 * @returns {Promise<void>}
 */
export async function ensureChapterLayout(bookPath) {
  const contentDir = path.join(bookPath, "content");
  let entries = [];
  try {
    entries = await fs.promises.readdir(contentDir, { withFileTypes: true });
  } catch {
    return;
  }
  const model = path.join(templatesDir(), "content", "chapter_001", "3_analysis.md");
  const system = { type: "system" };
  const renames = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !/^chapter_\d+$/i.test(entry.name)) continue;
    const dir = path.join(contentDir, entry.name);

    // 1) 1_script.md -> 1_outline.md (Esboço)
    for (const suffix of ["", ".temp"]) {
      const from = path.join(dir, `1_script.md${suffix}`);
      const to = path.join(dir, `1_outline.md${suffix}`);
      if (!fs.existsSync(from) || fs.existsSync(to)) continue;
      const text = await fs.promises.readFile(from, "utf8");
      const next = text
        .replace(/^(title:\s*)["']?Plano Executivo["']?\s*$/m, '$1"Esboço"')
        .replace(/^# PLANO EXECUTIVO/m, "# ESBOÇO");
      // Esboço e análise passam a ser abertos pelas guias do editor (não ficam mais ocultos no modo avançado)
      const visible = next.replace(/^advanced:\s*true\s*$/m, "advanced: false");
      await fs.promises.writeFile(to, visible, "utf8");
      await fs.promises.unlink(from);
      if (!suffix) {
        renames.push([`${entry.name}/1_script.md`, `${entry.name}/1_outline.md`]);
        await recordChange(bookPath, {
          action: "move",
          filePath: to,
          actor: system,
          meta: { from: `content/${entry.name}/1_script.md`, reason: "Plano Executivo passou a se chamar Esboço" },
        }).catch(() => null);
      }
    }

    // 1b) 3_metadata.md deixou de existir (o resumo do capítulo agora vem das análises em segundo plano em .system)
    for (const suffix of ["", ".temp"]) {
      const file = path.join(dir, `3_metadata.md${suffix}`);
      if (!fs.existsSync(file)) continue;
      const text = await fs.promises.readFile(file, "utf8");
      if (!suffix) {
        await recordChange(bookPath, {
          action: "delete",
          filePath: file,
          before: text,
          actor: system,
          meta: { reason: "Metadados do capítulo deixaram de existir (substituídos pelas análises em segundo plano)" },
        }).catch(() => null);
      }
      await fs.promises.unlink(file);
    }

    // 2) backlog/ -> 3_analysis.md
    const backlog = path.join(dir, "backlog");
    const analysisPath = path.join(dir, "3_analysis.md");
    const analysisTemp = `${analysisPath}.temp`;
    if (fs.existsSync(backlog) && !fs.existsSync(analysisPath) && !fs.existsSync(analysisTemp)) {
      const sections = [];
      const titles = {
        "1_analysis.md": null,
        "3_roadmap.md": "Planejamento dos próximos capítulos (antigo arquivo Planejamento)",
        "2_foreshadowing.md": "Pistas e foreshadowing (antigo arquivo Predições)",
      };
      const removed = [];
      for (const name of ["1_analysis.md", "3_roadmap.md", "2_foreshadowing.md"]) {
        for (const suffix of ["", ".temp"]) {
          const file = path.join(backlog, name + suffix);
          if (!fs.existsSync(file)) continue;
          const text = await fs.promises.readFile(file, "utf8");
          const body = bodyOf(text);
          const hash = (await import("node:crypto")).createHash("sha1").update(body, "utf8").digest("hex");
          if (suffix === "" && hash !== PRISTINE_BACKLOG[name] && body) {
            sections.push(titles[name] ? `## ${titles[name]}\n\n${body}` : body);
          }
          removed.push({ file, text, official: suffix === "" });
        }
      }

      let template = "";
      try {
        template = L(await fs.promises.readFile(model, "utf8"));
      } catch {
        template = '---\nhumanRead: true\nhumanWrite: true\naiRead: true\naiWrite: true\nuserDelete: false\nadvanced: false\ntitle: "Análise"\n---\n\n# ANÁLISE DO CAPÍTULO\n';
      }
      // Sem conteúdo do autor: a análise nasce do modelo novo; com conteúdo: ele vem primeiro e o modelo some
      const text = sections.length
        ? template.replace(/\n---\n[\s\S]*$/, "\n---\n\n# ANÁLISE DO CAPÍTULO\n\n" + sections.join("\n\n---\n\n") + "\n")
        : template;
      await fs.promises.writeFile(analysisPath, text, "utf8");
      await recordChange(bookPath, { action: "create", filePath: analysisPath, after: text, actor: system, meta: { reason: "Análise reúne a antiga pasta backlog" } }).catch(() => null);
      for (const item of removed) {
        if (item.official) {
          await recordChange(bookPath, { action: "delete", filePath: item.file, before: item.text, actor: system, meta: { reason: "Pasta backlog unificada em 3_analysis.md" } }).catch(() => null);
        }
      }
      await fs.promises.rm(backlog, { recursive: true, force: true });
      renames.push([`${entry.name}/backlog`, `${entry.name}/3_analysis.md`]);
    }
  }

  if (renames.length === 0) return;
  // Links antigos para os arquivos renomeados
  for (const file of await listMarkdown(bookPath)) {
    const before = await fs.promises.readFile(file, "utf8");
    const after = before.replace(/(\]\(\/?content\/chapter_\d+\/)1_script\.md/g, "$11_outline.md");
    if (after !== before) await fs.promises.writeFile(file, after, "utf8");
  }
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
  await ensureNotesInheritAiWrite(bookPath);
  await ensureEventsCategory(bookPath);
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
  await ensureChapterLayout(bookPath);
  await ensureAliasVariable(bookPath);
  await ensureEventsType(bookPath);
  await ensureFolderFlags(bookPath);
  return { renamed };
}
