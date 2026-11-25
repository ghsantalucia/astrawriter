/**
 * @file Núcleo de tradução (sem dependência de Electron nem do DOM): usado pelo processo principal e pelo renderer.
 *
 * Modelo "texto de origem": o português é a chave. `t("Salvar")` devolve "Salvar" em português e "Save" em inglês (o dicionário
 * em `src/shared/i18n/en/*.json` mapeia texto em português → texto em inglês). Texto sem tradução cai no próprio português, então
 * nada some da tela quando falta uma entrada. Parâmetros usam chaves: `t("Olá, {name}!", { name })`.
 */

export type Language = "pt-BR" | "en";

/** Idiomas oferecidos pelo app (o primeiro é o padrão). */
export const LANGUAGES: Array<{ value: Language; label: string }> = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "en", label: "English" },
];

export const DEFAULT_LANGUAGE: Language = "pt-BR";

let current: Language = DEFAULT_LANGUAGE;
const dictionaries: Record<string, Record<string, string>> = { en: {} };

/** Normaliza qualquer código de idioma (`pt`, `pt_BR`, `en-US`...) para um idioma suportado. */
export function normalizeLanguage(code: unknown): Language {
  const value = String(code ?? "").toLowerCase();
  if (value.startsWith("en")) return "en";
  if (value.startsWith("pt")) return "pt-BR";
  return DEFAULT_LANGUAGE;
}

/** Idioma ativo. */
export function getLanguage(): Language {
  return current;
}

/** Define o idioma ativo (quem chama recarrega a interface, se for o caso). */
export function setLanguage(code: unknown): Language {
  current = normalizeLanguage(code);
  return current;
}

/** Registra (ou completa) as traduções de um idioma: `{ "texto em português": "text in english" }`. */
export function registerMessages(language: string, messages: Record<string, string>): void {
  dictionaries[language] = { ...(dictionaries[language] || {}), ...messages };
}

/** Substitui `{nome}` pelos parâmetros (o que não tiver parâmetro fica como está). */
function interpolate(text: string, params?: Record<string, unknown>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole));
}

/**
 * Traduz um texto de origem (em português) para o idioma ativo.
 * @param {string} source - Texto em português.
 * @param {Record<string, unknown>} [params] - Valores para `{nome}`.
 * @returns {string}
 */
export function t(source: string, params?: Record<string, unknown>): string {
  const translated = current === DEFAULT_LANGUAGE ? source : dictionaries[current]?.[source] ?? source;
  return interpolate(translated, params);
}

/** Textos de origem que existem no dicionário de um idioma (usado nos testes de cobertura). */
export function messageKeys(language: string): string[] {
  return Object.keys(dictionaries[language] || {});
}

/** Locale para `Intl`, `toLocaleString` e `localeCompare` (números, datas e ordenação seguem o idioma do app). */
export function intlLocale(): string {
  return current === "en" ? "en-US" : "pt-BR";
}

/** Idioma padrão do corretor ortográfico quando o usuário ainda não escolheu um (segue o idioma do app). */
export function defaultSpellLanguage(): string {
  return intlLocale();
}
