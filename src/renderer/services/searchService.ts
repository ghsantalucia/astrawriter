// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Serviço de pesquisa nos arquivos do livro (por título e por conteúdo).
 */

/**
 * Serviço que delega a busca de texto ao processo principal (que lê os arquivos do disco).
 * @class
 */
export class SearchService {
  /**
   * Pesquisa um termo nos arquivos Markdown do livro.
   * @param {string} bookPath - Caminho absoluto do livro.
   * @param {string} term - Termo pesquisado (ignora maiúsculas e acentos).
   * @returns {Promise<Array<{path: string, relativePath: string, title: string, matchType: "title"|"content", snippet: string}>>}
   * Resultados já ordenados: título primeiro, depois conteúdo, ambos em ordem alfabética.
   */
  async search(bookPath, term) {
    if (!bookPath || !term?.trim()) return [];

    try {
      return (await window.electronAPI.searchBook(bookPath, term)) || [];
    } catch (error) {
      console.error("[SEARCH SERVICE] Erro ao pesquisar:", error);
      return [];
    }
  }
}
