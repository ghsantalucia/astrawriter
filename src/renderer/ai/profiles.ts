// @ts-nocheck
/**
 * @file Perfis de uso da IA (como nas configurações de gráficos de um jogo): cada perfil define um conjunto de opções que
 * trocam qualidade/automação por economia de tokens. Mexer em uma opção manualmente leva ao perfil "Personalizado"
 * (ou ao perfil que por acaso tenha exatamente aquelas opções).
 */

/**
 * @typedef {Object} ProfileOption
 * @property {string} id - Chave da opção.
 * @property {string} label - Título.
 * @property {string} hint - Descrição.
 * @property {"bool"|"select"} type - Tipo do controle.
 * @property {Array<{value: number, label: string}>} [choices] - Escolhas (tipo `select`).
 * @property {string} group - Grupo na tela.
 */

/** Opções controladas pelos perfis (na ordem em que aparecem). @type {ProfileOption[]} */
export const PROFILE_OPTIONS = [
  { group: "Chat", id: "chatOnly", type: "bool", label: "Modo apenas conversa (sem tools)", hint: "A IA não lê nem altera arquivos: só conversa. Economiza muito, pois as definições das tools não são enviadas. Os botões de resposta pronta do chat continuam funcionando. Ao ligar, as demais opções ficam bloqueadas." },
  {
    group: "Chat",
    id: "toolsMode",
    type: "select",
    label: "Tools enviadas à IA",
    hint: "Quanto das tools vai em cada pedido (elas pesam no limite de tokens por minuto). Sumário: só 1 linha por tool, e a IA pede a especificação das que precisar. As pedidas ficam liberadas pelo resto da sessão.",
    choices: [
      { value: "minimal", label: "Mínimo: só botões e leitura de arquivos" },
      { value: "summary", label: "Sumário das tools" },
      { value: "popular", label: "Mais usadas + sumário" },
      { value: "all", label: "Todas as tools" },
    ],
  },
  { group: "Chat", id: "compact", type: "bool", label: "Otimizar instruções (enxugar)", hint: "Envia as instruções do app, a descrição das tools e o texto das skills de forma mais enxuta (sem enfeites e com frases curtas) e pede respostas curtas à IA. Gasta menos tokens; nunca mexe no texto do seu livro." },
  { group: "Análise do livro", id: "onSync", type: "bool", label: "Analisar arquivos ao sincronizar", hint: "Depois de sincronizar, a IA cria o resumo (digest) dos arquivos novos ou alterados. Desligado: nenhuma análise é oferecida (dá para rodar manualmente)." },
  { group: "Análise do livro", id: "autoAnalyze", type: "bool", label: "Analisar em segundo plano, sem pedir autorização", hint: "Desligado: o app mostra a estimativa de tokens e pergunta antes de gastar." },
  { group: "Análise do livro", id: "facts", type: "bool", label: "Extrair fatos dos arquivos (base das contradições)", hint: "Traços, idades, parentescos e regras do mundo. Sem isso o app não acha contradições entre arquivos." },
  { group: "Análise do livro", id: "verify", type: "bool", label: "Conferir contradições com a IA", hint: "O sistema acha os candidatos sem gastar tokens; a IA só confirma os duvidosos, com citações curtas." },
  { group: "Análise do livro", id: "timeline", type: "bool", label: "Analisar coerência temporal", hint: "Extrai eventos e datas dos textos para a linha do tempo e para achar incoerências de ordem." },
  { group: "Análise do livro", id: "tone", type: "bool", label: "Analisar inconsistências de tom e forma de escrita", hint: "Registra o narrador (pessoa), o tempo verbal e o tom de cada arquivo e avisa quando um capítulo foge do padrão do livro." },
  { group: "Análise do livro", id: "synopsis", type: "bool", label: "Comparar os capítulos com o objetivo do livro", hint: "Uma conferência extra da IA: os resumos dos capítulos contra a sinopse (a alma do livro)." },
  {
    group: "Limites",
    id: "budgetTokens",
    type: "select",
    label: "Orçamento por análise (tokens estimados)",
    hint: "Se a estimativa passar disso, a análise para e continua na próxima vez.",
    choices: [
      { value: 20000, label: "20 mil" },
      { value: 40000, label: "40 mil" },
      { value: 80000, label: "80 mil" },
      { value: 150000, label: "150 mil" },
      { value: 300000, label: "300 mil" },
    ],
  },
  {
    group: "Limites",
    id: "historyLimit",
    type: "select",
    label: "Mensagens de histórico enviadas ao chat",
    hint: "Quanto da conversa anterior vai junto a cada mensagem. Menos mensagens = menos tokens, mas a IA lembra menos da conversa.",
    choices: [
      { value: 6, label: "6" },
      { value: 12, label: "12" },
      { value: 30, label: "30" },
      { value: 40, label: "40" },
      { value: 50, label: "50" },
    ],
  },
];

/** Perfis, do mais econômico ao mais completo. */
export const PROFILES = [
  {
    id: "minimal",
    label: "Mínimo",
    description: "Sem tools de edição: só os botões do chat e a leitura de arquivos quando você pedir (respeitando as permissões). Nada é analisado sozinho e o histórico enviado é curto.",
    values: { compact: true, onSync: false, autoAnalyze: false, facts: true, verify: false, timeline: false, tone: false, synopsis: false, chatOnly: false, toolsMode: "minimal", budgetTokens: 20000, historyLimit: 6 },
  },
  {
    id: "economic",
    label: "Econômico",
    description: "Envia só um sumário das tools (a IA pede as que precisar). Resume os arquivos perguntando antes e acha contradições só pelo sistema, sem verificação da IA.",
    values: { compact: true, onSync: true, autoAnalyze: false, facts: true, verify: false, timeline: false, tone: false, synopsis: false, chatOnly: false, toolsMode: "summary", budgetTokens: 40000, historyLimit: 12 },
  },
  {
    id: "balanced",
    label: "Equilibrado",
    description: "O padrão: as tools mais usadas completas e o sumário das outras; resumos, contradições verificadas e linha do tempo, sempre perguntando antes de gastar.",
    values: { compact: false, onSync: true, autoAnalyze: false, facts: true, verify: true, timeline: true, tone: false, synopsis: false, chatOnly: false, toolsMode: "popular", budgetTokens: 80000, historyLimit: 30 },
  },
  {
    id: "complete",
    label: "Completo",
    description: "Também confere tom e forma de escrita, e analisa em segundo plano sem perguntar.",
    values: { compact: false, onSync: true, autoAnalyze: true, facts: true, verify: true, timeline: true, tone: true, synopsis: false, chatOnly: false, toolsMode: "all", budgetTokens: 150000, historyLimit: 40 },
  },
  {
    id: "ultra",
    label: "Ultra",
    description: "Tudo ligado, inclusive a comparação dos capítulos com o objetivo do livro. Gasta mais tokens.",
    values: { compact: false, onSync: true, autoAnalyze: true, facts: true, verify: true, timeline: true, tone: true, synopsis: true, chatOnly: false, toolsMode: "all", budgetTokens: 300000, historyLimit: 50 },
  },
];

export const DEFAULT_PROFILE = "balanced";

/**
 * Identifica o perfil cujas opções são exatamente as informadas (ou `custom`).
 * @param {Object} values - Opções efetivas.
 * @returns {string} Id do perfil ou `custom`.
 */
export function detectProfile(values) {
  const found = PROFILES.find((p) => PROFILE_OPTIONS.every((o) => p.values[o.id] === values[o.id]));
  return found ? found.id : "custom";
}

/**
 * Opções efetivas a partir do que está salvo em `aiSettings.analysis`: o perfil escolhido define tudo, exceto no
 * `custom`, em que valem as opções salvas (as que faltam vêm do perfil Equilibrado). Configurações antigas (só
 * `autoAnalyze`, `verify` e `budgetTokens`) viram um perfil personalizado equivalente ao comportamento anterior.
 * @param {Object} [saved] - `aiSettings.analysis`.
 * @returns {Object} Opções efetivas, mais `profile` (id do perfil ou `custom`).
 */
export function resolveAnalysis(saved) {
  const raw = saved || {};
  const base = PROFILES.find((p) => p.id === DEFAULT_PROFILE).values;
  const named = PROFILES.find((p) => p.id === raw.profile);
  if (named) return { ...named.values, profile: named.id };

  const values = { ...base };
  for (const option of PROFILE_OPTIONS) {
    if (raw[option.id] !== undefined) values[option.id] = raw[option.id];
  }
  // Configurações antigas: `verify` ligado por padrão, `autoAnalyze` desligado
  if (raw.verify === undefined) values.verify = true;
  const budget = Number(raw.budgetTokens);
  if (budget > 0) values.budgetTokens = budget;
  if (!raw.profile && Object.keys(raw).length === 0) return { ...values, profile: DEFAULT_PROFILE };
  return { ...values, profile: detectProfile(values) };
}

/**
 * Estrutura a gravar em `aiSettings.analysis` para um perfil ou um conjunto personalizado.
 * @param {string} profile - Id do perfil ou `custom`.
 * @param {Object} values - Opções efetivas.
 * @returns {Object}
 */
export function toSaved(profile, values) {
  return { ...values, profile };
}
