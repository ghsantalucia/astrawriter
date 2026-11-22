import { describe, it, expect } from "vitest";
import { foldText, looseWords, findMatches } from "../../../src/shared/looseText";

const trechos = (texto, termo) => findMatches(texto, termo).map((r) => texto.slice(r.start, r.end));

describe("looseText", () => {
  it("foldText tira acentos e caixa preservando o comprimento", () => {
    expect(foldText("ÁÉÍõç Ñ")).toBe("aeioc n");
    expect(foldText("Grimório").length).toBe("Grimório".length);
    expect(foldText(null)).toBe("");
  });
  it("looseWords descarta artigos/preposições e pontuação", () => {
    expect(looseWords("O Grimório de Eldoria")).toEqual(["grimorio", "eldoria"]);
    expect(looseWords("vira-lata")).toEqual(["vira", "lata"]);
    expect(looseWords("de a o")).toEqual([]);
  });
  it("findMatches acha a ocorrência literal ignorando caixa e acento", () => {
    expect(trechos("A ELDÓRIA caiu. eldoria", "eldoria")).toEqual(["ELDÓRIA", "eldoria"]);
  });
  it("'vira lata' encontra 'vira-lata'", () => {
    expect(trechos("Um vira-lata magro", "vira lata")).toEqual(["vira-lata"]);
  });
  it("ignora palavras pequenas: 'grimório eldoria' encontra 'Grimório de Eldoria'", () => {
    expect(trechos("O Grimório de Eldoria é antigo", "grimório eldoria")).toEqual(["Grimório de Eldoria"]);
  });
  it("a última palavra aceita prefixo (digitação em andamento)", () => {
    expect(trechos("Grimório de Eldoria", "grimorio eldo")).toEqual(["Grimório de Eldoria"]);
  });
  it("as palavras precisam ser sequenciais", () => {
    expect(findMatches("Eldoria e Grimório", "grimório eldoria")).toEqual([]);
  });
  it("termo vazio ou só de espaços não encontra nada", () => {
    expect(findMatches("texto", "")).toEqual([]);
    expect(findMatches("texto", "   ")).toEqual([]);
    expect(findMatches(null, "a")).toEqual([]);
  });
  it("ocorrências repetidas vêm ordenadas e separadas", () => {
    expect(findMatches("ab ab", "ab")).toEqual([{ start: 0, end: 2 }, { start: 3, end: 5 }]);
  });
  it("posições valem no texto original (com acentos)", () => {
    const t = "çãõ eldoria";
    const [m] = findMatches(t, "eldoria");
    expect(t.slice(m.start, m.end)).toBe("eldoria");
  });
});
