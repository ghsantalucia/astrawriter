import { describe, it, expect } from "vitest";
import { normalizeTag, parseTags, tagColorIndex, TAG_COLOR_COUNT, TAG_MAX_LENGTH } from "../../../src/shared/tags";

describe("tags", () => {
  it("normalizeTag: minúsculas, sem #, espaços viram hífen, caracteres inválidos saem", () => {
    expect(normalizeTag("  ##Meu Livro!  ")).toBe("meu-livro");
    expect(normalizeTag("Ação/Épico.v2_x")).toBe("ação/épico.v2_x");
    expect(normalizeTag("a@b$c")).toBe("abc");
    expect(normalizeTag("---x")).toBe("x");
    expect(normalizeTag(null)).toBe("");
    expect(normalizeTag("###")).toBe("");
  });
  it("normalizeTag corta no tamanho máximo", () => {
    expect(normalizeTag("a".repeat(100))).toHaveLength(TAG_MAX_LENGTH);
  });
  it("parseTags aceita texto com vírgulas ou lista, sem repetir e na ordem digitada", () => {
    expect(parseTags("Um, dois,UM, , três tres")).toEqual(["um", "dois", "três-tres"]);
    expect(parseTags(["a", "A", "b c"])).toEqual(["a", "b-c"]);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags("")).toEqual([]);
  });
  it("tagColorIndex é estável e fica dentro da paleta", () => {
    for (const t of ["a", "fantasia", "épico", "😀"]) {
      const i = tagColorIndex(t);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(TAG_COLOR_COUNT);
      expect(tagColorIndex(t)).toBe(i);
    }
  });
  it("tagColorIndex distribui tags diferentes em várias cores", () => {
    const indices = new Set(Array.from({ length: 60 }, (_, n) => tagColorIndex(`tag${n}`)));
    expect(indices.size).toBeGreaterThan(15);
  });
});
