/**
 * @file Tipos de arquivo que têm template e perfis de template. Um perfil de template (assistente, co-autor, autônomo ou
 * um criado pelo usuário) define o **corpo** de cada template; as variáveis (frontmatter) são sempre as do template base
 * do livro e nunca mudam. Compartilhado entre o processo principal e a interface.
 */

import { t } from "./i18n.js";

/**
 * Tipos de template.
 * `base`: arquivo do modelo de livro (`templates/book`) de onde vêm o frontmatter e a estrutura.
 * `bookFile`: onde o template vive dentro de um livro (fichas), ou null quando é usado só ao criar capítulos.
 */
export const TEMPLATE_KINDS = [
  { id: "character", get label() { return t("Personagem"); }, get description() { return t("Ficha de personagem (Mundo → Personagens)."); }, base: "assets/characters/template.md", bookFile: "assets/characters/template.md" },
  { id: "place", get label() { return t("Ambiente"); }, get description() { return t("Ficha de ambiente (Mundo → Ambientes)."); }, base: "assets/places/template.md", bookFile: "assets/places/template.md" },
  { id: "element", get label() { return t("Conceito ou sistema"); }, get description() { return t("Ficha de conceito, sistema, magia, tecnologia... (Mundo → Conceitos)."); }, base: "assets/elements/template.md", bookFile: "assets/elements/template.md" },
  { id: "event", get label() { return t("Evento"); }, get description() { return t("Ficha de evento (Mundo → Eventos)."); }, base: "assets/events/template.md", bookFile: "assets/events/template.md" },
  { id: "chapter-outline", get label() { return t("Capítulo: Esboço"); }, get description() { return t("O plano do capítulo, escrito antes do texto."); }, base: "content/chapter_001/1_outline.md", bookFile: null },
  { id: "chapter-analysis", get label() { return t("Capítulo: Análise"); }, get description() { return t("A análise do capítulo, gerada depois da escrita."); }, base: "content/chapter_001/3_analysis.md", bookFile: null },
];

/** Perfis que já vêm com o app. O padrão de cada modo da IA é o perfil de mesmo nome. */
export const BUILTIN_PROFILES = [
  { id: "assistant", get label() { return t("Assistente de escrita"); }, get description() { return t("Perguntas e dicas que estimulam você a escrever."); }, aiMode: "assistant" },
  { id: "coauthor", get label() { return t("Co-autor"); }, get description() { return t("Foca em informações que a IA aproveita: amostras de diálogo, jeito de falar, exemplos."); }, aiMode: "coauthor" },
  { id: "autonomous", get label() { return t("Autônomo"); }, get description() { return t("Instruções claras para a IA seguir sozinha, com fatos imutáveis e restrições."); }, aiMode: "autonomous" },
];

/** Perfil padrão de cada modo da IA. */
export const PROFILE_FOR_AI_MODE = { assistant: "assistant", coauthor: "coauthor", autonomous: "autonomous" };
