/**
 * @file Catálogo das categorias e dos tipos de issue da Central de Revisões.
 *
 * Um issue tem sempre uma **categoria** (aba da central), um **tipo** (a "tag" do card) e uma **severidade**:
 * `error` (vermelho: erro confirmado) ou `warning` (amarelo: possível erro ou sugestão). Os tipos da categoria `tips`
 * nunca são vermelhos. A origem (`source`) diz quem costuma encontrar o tipo: o `system` (regras determinísticas, sem
 * gastar IA) ou a `ai`.
 */

import { t } from "../../shared/i18n.js";

/** @typedef {"error"|"warning"} Severity */

/**
 * Categorias (abas laterais da central).
 * @type {Array<{id: string, label: string, icon: string, description: string}>}
 */
export const CATEGORIES = [
  {
    id: "links",
    label: t("Links"),
    icon: "fa-link",
    description:
      t("Referências a arquivos que não existem mais (links internos quebrados)."),
  },
  {
    id: "spelling",
    label: t("Ortografia e gramática"),
    icon: "fa-spell-check",
    description:
      t("Erros de digitação, palavras repetidas, problemas gramaticais e sugestões de sinônimos."),
  },
  {
    id: "timeline",
    label: t("Linha do tempo"),
    icon: "fa-clock-rotate-left",
    description:
      t("Eventos fora de ordem, ciclos na ordem dos fatos e contradições temporais."),
  },
  {
    id: "contradictions",
    label: t("Contradições"),
    icon: "fa-code-compare",
    description:
      t("Fatos sobre personagens, lugares e elementos que se contradizem entre arquivos."),
  },
  {
    id: "tips",
    label: t("Dicas de melhoria"),
    icon: "fa-lightbulb",
    description:
      t("Sugestões de estilo e clareza. Nunca são erros: aparecem sempre em amarelo."),
  },
];

/**
 * Tipos de issue (as tags dos cards).
 * @type {Object<string, {label: string, category: string, severity: Severity, source: "system"|"ai", description: string}>}
 */
export const ISSUE_TYPES = {
  "broken-link": {
    label: t("Link quebrado"),
    category: "links",
    severity: "error",
    source: "system",
    description: t("O link aponta para um arquivo que não existe mais."),
  },
  typo: {
    label: t("Erro de digitação"),
    category: "spelling",
    severity: "warning",
    source: "system",
    description: t("Palavra que o dicionário não reconhece."),
  },
  "repeated-word": {
    label: t("Palavra repetida"),
    category: "spelling",
    severity: "error",
    source: "system",
    description: t("A mesma palavra duas vezes seguidas."),
  },
  grammar: {
    label: t("Gramática"),
    category: "spelling",
    severity: "warning",
    source: "ai",
    description: t("Concordância, regência, pontuação e outros problemas gramaticais."),
  },
  synonym: {
    label: t("Sugestão de sinônimo"),
    category: "spelling",
    severity: "warning",
    source: "ai",
    description: t("Palavra repetida em excesso ou imprecisa que poderia ser trocada."),
  },
  "timeline-cycle": {
    label: t("Ordem circular"),
    category: "timeline",
    severity: "error",
    source: "system",
    description:
      t("Eventos que dependem uns dos outros em círculo (A depois de B depois de A)."),
  },
  "timeline-order": {
    label: t("Evento fora de ordem"),
    category: "timeline",
    severity: "error",
    source: "system",
    description: t("O momento informado contradiz a ordem declarada entre eventos."),
  },
  "timeline-ref": {
    label: t("Evento citado não existe"),
    category: "timeline",
    severity: "warning",
    source: "system",
    description: t("Um evento cita outro (antes de / depois de) que não tem ficha."),
  },
  "timeline-gap": {
    label: t("Evento sem posição"),
    category: "timeline",
    severity: "warning",
    source: "system",
    description: t("Evento sem momento nem relação com outros: fica fora da linha do tempo."),
  },
  "timeline-conflict": {
    label: t("Contradição temporal"),
    category: "timeline",
    severity: "error",
    source: "ai",
    description: t("Um texto situa um fato antes ou depois do que deveria."),
  },
  "fact-conflict": {
    label: t("Fato contraditório"),
    category: "contradictions",
    severity: "error",
    source: "ai",
    description: t("Dois arquivos afirmam coisas incompatíveis sobre o mesmo fato."),
  },
  "possible-conflict": {
    label: t("Possível contradição"),
    category: "contradictions",
    severity: "warning",
    source: "ai",
    description: t("Trechos que talvez se contradigam e merecem uma conferência."),
  },
  "style-tip": {
    label: t("Dica de estilo"),
    category: "tips",
    severity: "warning",
    source: "ai",
    description: t("Sugestão para deixar o texto mais fluido."),
  },
  "style-shift": {
    label: t("Mudança de tom ou narrador"),
    category: "tips",
    severity: "warning",
    source: "ai",
    description: t("Capítulo que foge do padrão do livro em narrador ou tempo verbal."),
  },
  "goal-drift": {
    label: t("Desvio do objetivo do livro"),
    category: "tips",
    severity: "warning",
    source: "ai",
    description: t("Capítulo que parece fugir da sinopse (o objetivo do livro)."),
  },
  "clarity-tip": {
    label: t("Dica de clareza"),
    category: "tips",
    severity: "warning",
    source: "ai",
    description: t("Trecho confuso ou ambíguo."),
  },
  "verbose-tip": {
    label: t("Trecho prolixo"),
    category: "tips",
    severity: "warning",
    source: "ai",
    description: t("Trecho maior do que precisa ser, enrolado ou repetitivo."),
  },
  "pacing-tip": {
    label: t("Ritmo"),
    category: "tips",
    severity: "warning",
    source: "ai",
    description: t("Trecho lento demais, corrido demais ou descritivo em excesso."),
  },
  "missing-entity-tip": {
    label: t("Ficha ausente"),
    category: "tips",
    severity: "warning",
    source: "ai",
    description: t("Personagem, ambiente, conceito ou evento citado que ainda não tem ficha."),
  },
  "grounding-tip": {
    label: t("Grounding"),
    category: "tips",
    severity: "warning",
    source: "ai",
    description: t("Fato, data ou objeto que pode não combinar com a época ou o mundo real (só o autor sabe se é proposital)."),
  },
};

/**
 * Descrição de um tipo (com um padrão para tipos desconhecidos).
 * @param {string} type - Id do tipo.
 * @returns {{label: string, category: string, severity: Severity, source: string, description: string}}
 */
export function typeInfo(type) {
  return (
    ISSUE_TYPES[type] || {
      label: type,
      category: "tips",
      severity: "warning",
      source: "ai",
      description: "",
    }
  );
}

/**
 * Categoria pelo id.
 * @param {string} id - Id da categoria.
 * @returns {{id: string, label: string, icon: string, description: string}|undefined}
 */
export function categoryInfo(id) {
  return CATEGORIES.find((c) => c.id === id);
}

/**
 * Normaliza a severidade: dicas de melhoria nunca são vermelhas.
 * @param {string} category - Categoria do issue.
 * @param {string} severity - Severidade pedida.
 * @returns {Severity}
 */
export function normalizeSeverity(category, severity) {
  if (category === "tips") return "warning";
  return severity === "error" ? "error" : "warning";
}
