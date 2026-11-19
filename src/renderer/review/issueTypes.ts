// @ts-nocheck
/**
 * @file Catálogo das categorias e dos tipos de issue da Central de Revisões.
 *
 * Um issue tem sempre uma **categoria** (aba da central), um **tipo** (a "tag" do card) e uma **severidade**:
 * `error` (vermelho: erro confirmado) ou `warning` (amarelo: possível erro ou sugestão). Os tipos da categoria `tips`
 * nunca são vermelhos. A origem (`source`) diz quem costuma encontrar o tipo: o `system` (regras determinísticas, sem
 * gastar IA) ou a `ai`.
 */

/** @typedef {"error"|"warning"} Severity */

/**
 * Categorias (abas laterais da central).
 * @type {Array<{id: string, label: string, icon: string, description: string}>}
 */
export const CATEGORIES = [
  {
    id: "links",
    label: "Links",
    icon: "fa-link",
    description:
      "Referências a arquivos que não existem mais (links internos quebrados).",
  },
  {
    id: "spelling",
    label: "Ortografia e gramática",
    icon: "fa-spell-check",
    description:
      "Erros de digitação, palavras repetidas, problemas gramaticais e sugestões de sinônimos.",
  },
  {
    id: "timeline",
    label: "Linha do tempo",
    icon: "fa-clock-rotate-left",
    description:
      "Eventos fora de ordem, ciclos na ordem dos fatos e contradições temporais.",
  },
  {
    id: "contradictions",
    label: "Contradições",
    icon: "fa-code-compare",
    description:
      "Fatos sobre personagens, lugares e elementos que se contradizem entre arquivos.",
  },
  {
    id: "tips",
    label: "Dicas de melhoria",
    icon: "fa-lightbulb",
    description:
      "Sugestões de estilo e clareza. Nunca são erros: aparecem sempre em amarelo.",
  },
];

/**
 * Tipos de issue (as tags dos cards).
 * @type {Object<string, {label: string, category: string, severity: Severity, source: "system"|"ai", description: string}>}
 */
export const ISSUE_TYPES = {
  "broken-link": {
    label: "Link quebrado",
    category: "links",
    severity: "error",
    source: "system",
    description: "O link aponta para um arquivo que não existe mais.",
  },
  typo: {
    label: "Erro de digitação",
    category: "spelling",
    severity: "warning",
    source: "system",
    description: "Palavra que o dicionário não reconhece.",
  },
  "repeated-word": {
    label: "Palavra repetida",
    category: "spelling",
    severity: "error",
    source: "system",
    description: "A mesma palavra duas vezes seguidas.",
  },
  grammar: {
    label: "Gramática",
    category: "spelling",
    severity: "warning",
    source: "ai",
    description: "Concordância, regência, pontuação e outros problemas gramaticais.",
  },
  synonym: {
    label: "Sugestão de sinônimo",
    category: "spelling",
    severity: "warning",
    source: "ai",
    description: "Palavra repetida em excesso ou imprecisa que poderia ser trocada.",
  },
  "timeline-cycle": {
    label: "Ordem circular",
    category: "timeline",
    severity: "error",
    source: "system",
    description:
      "Eventos que dependem uns dos outros em círculo (A depois de B depois de A).",
  },
  "timeline-order": {
    label: "Evento fora de ordem",
    category: "timeline",
    severity: "error",
    source: "system",
    description: "O momento informado contradiz a ordem declarada entre eventos.",
  },
  "timeline-ref": {
    label: "Evento citado não existe",
    category: "timeline",
    severity: "warning",
    source: "system",
    description: "Um evento cita outro (antes de / depois de) que não tem ficha.",
  },
  "timeline-gap": {
    label: "Evento sem posição",
    category: "timeline",
    severity: "warning",
    source: "system",
    description: "Evento sem momento nem relação com outros: fica fora da linha do tempo.",
  },
  "timeline-conflict": {
    label: "Contradição temporal",
    category: "timeline",
    severity: "error",
    source: "ai",
    description: "Um texto situa um fato antes ou depois do que deveria.",
  },
  "fact-conflict": {
    label: "Fato contraditório",
    category: "contradictions",
    severity: "error",
    source: "ai",
    description: "Dois arquivos afirmam coisas incompatíveis sobre o mesmo fato.",
  },
  "possible-conflict": {
    label: "Possível contradição",
    category: "contradictions",
    severity: "warning",
    source: "ai",
    description: "Trechos que talvez se contradigam e merecem uma conferência.",
  },
  "style-tip": {
    label: "Dica de estilo",
    category: "tips",
    severity: "warning",
    source: "ai",
    description: "Sugestão para deixar o texto mais fluido.",
  },
  "style-shift": {
    label: "Mudança de tom ou narrador",
    category: "tips",
    severity: "warning",
    source: "ai",
    description: "Capítulo que foge do padrão do livro em narrador ou tempo verbal.",
  },
  "goal-drift": {
    label: "Desvio do objetivo do livro",
    category: "tips",
    severity: "warning",
    source: "ai",
    description: "Capítulo que parece fugir da sinopse (o objetivo do livro).",
  },
  "clarity-tip": {
    label: "Dica de clareza",
    category: "tips",
    severity: "warning",
    source: "ai",
    description: "Trecho confuso ou ambíguo.",
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
