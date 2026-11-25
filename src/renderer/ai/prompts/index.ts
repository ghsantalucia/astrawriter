/**
 * @file Monta o prompt de sistema único, reutilizado por todos os provedores de IA.
 */

import basePrompt from "./systemPrompt.md?raw";
import compactPrompt from "./systemPromptCompact.md?raw";
import { listSkills } from "../skills/index.js";

/** Instruções de cada modo da IA (definido na Central do Livro, `ai_mode` no config.json). */
const MODE_PROMPTS = {
  assistant:
    "Assistente de escrita. O autor escreve; você ajuda quando pedido (sugestões, revisão, trechos redigidos para ele aprovar). Não crie nem reescreva conteúdo por iniciativa própria.",
  coauthor:
    "Co-autor. Você propõe e escreve capítulos e trechos junto com o autor, passo a passo, e pergunta antes de decisões grandes (rumo da trama, personagens novos, mortes).",
  autonomous:
    "Autônomo. A partir do briefing do autor você planeja e escreve capítulo a capítulo sem pedir confirmação a cada passo, seguindo as permissões dos arquivos; tudo passa pela revisão do autor.",
};

/**
 * Prompt base (arquivo único) + contexto atual do app (livro, arquivo aberto e skills).
 * @param {Object} state - Estado global da aplicação.
 * @returns {string}
 */
export function buildSystemPrompt(state, compact = false, bookMap = "") {
  const lines = [(compact ? compactPrompt : basePrompt).trim(), "", "## Contexto atual"];

  const bookTitle = state.currentBookMetadata?.book_title;
  lines.push(`- Livro: ${bookTitle || "(nenhum livro selecionado)"}`);

  if (state.currentFilePath && state.currentBookPath) {
    const norm = (p) => p.replace(/\\/g, "/");
    const book = norm(state.currentBookPath).replace(/\/$/, "");
    const file = norm(state.currentFilePath).replace(/\.temp$/, "");
    if (file.startsWith(`${book}/`)) {
      lines.push(`- Arquivo aberto no editor: ${file.slice(book.length + 1)}`);
    }
  }

  // Modo de trabalho do livro (Central do Livro)
  const normBook = (p) => String(p || "").split("\\").join("/");
  const current = (state.bookList || []).find(
    (b) => normBook(b.fullPath) === normBook(state.currentBookPath),
  );
  const mode = MODE_PROMPTS[current?.ai_mode] || MODE_PROMPTS.assistant;
  lines.push(`- Modo de trabalho: ${mode}`);

  if (bookMap) lines.push("", bookMap);

  const skills = listSkills();
  if (skills.length > 0) {
    lines.push("", "## Skills disponíveis (use `load_skill` para carregar)");
    skills.forEach((s) => lines.push(`- ${s.name}: ${s.description}`));
  }

  return lines.join("\n");
}

/** Máximo de arquivos no mapa do livro (o resto vai por `list_files`). */
const MAX_MAP_FILES = 80;

/**
 * Mapa do livro para o contexto da IA: título e caminho dos arquivos que ela pode ler, para saber o que existe sem precisar
 * listar nem perguntar. Fora índices e modelos. Só dados do livro aberto.
 * @param {Array<{relPath: string, key?: string, metadata?: Object}>} files - Arquivos do livro (de `flattenBookTree`).
 * @returns {string} Texto em Markdown (vazio se não há arquivos).
 */
export function buildBookMap(files, unchanged = null) {
  const readable = (files || [])
    .filter((f) => f.metadata?.aiRead === true && !/(^|\/)(index|template)\.md$/i.test(f.relPath))
    .sort((a, b) => a.relPath.localeCompare(b.relPath, "pt-BR", { numeric: true }));
  if (readable.length === 0) return "";
  const shown = readable.slice(0, MAX_MAP_FILES);
  const rows = shown.map((f) => {
    const title = f.metadata?.title || f.metadata?.data?.title?.content || f.key || f.relPath;
    return `- ${f.relPath}: ${title}${f.metadata?.aiWrite === true ? "" : " [só leitura]"}${unchanged?.has(f.relPath) ? " (inalterado desde a última execução)" : ""}`;
  });
  const extra = readable.length > shown.length ? `\n(+${readable.length - shown.length} arquivos: use list_files)` : "";
  return `## Mapa do livro (arquivos que você pode ler; use o título ao falar com o autor)\n${rows.join("\n")}${extra}`;
}
