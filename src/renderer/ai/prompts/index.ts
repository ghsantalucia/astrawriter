// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
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
export function buildSystemPrompt(state, compact = false) {
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

  const skills = listSkills();
  if (skills.length > 0) {
    lines.push("", "## Skills disponíveis (use `load_skill` para carregar)");
    skills.forEach((s) => lines.push(`- ${s.name}: ${s.description}`));
  }

  return lines.join("\n");
}
