/**
 * @file Contador de palavras desconhecidas (ortografia) do texto do editor. A verificação roda no processo principal
 * (Hunspell + dicionário do idioma escolhido); o sublinhado vermelho do editor continua sendo do corretor do Chromium.
 */

const LANGUAGE_KEY = "app_spell_language";

/**
 * Serviço de verificação ortográfica por contagem.
 * @class
 */
export class SpellService {
  /**
   * Quais das palavras o dicionário do idioma salvo não reconhece.
   * @param {string[]} words - Palavras únicas.
   * @returns {Promise<string[]>}
   */
  async findMisspelled(words) {
    if (words.length === 0) return [];
    const language = localStorage.getItem(LANGUAGE_KEY) || "pt-BR";
    return window.electronAPI.findMisspelled(language, words);
  }

  /**
   * Chamado quando o idioma muda (o dicionário novo é carregado no primeiro uso).
   * @returns {void}
   */
  reset() {}
}

/** Instância única usada pelo editor. */
export const spellService = new SpellService();
