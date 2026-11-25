import { describe, it, expect } from "vitest";
import { diffLines } from "../../../../src/renderer/utils/diff";

const marcadas = (lista, chave) => lista.filter((l) => l[chave]).map((l) => l.text);

describe("diff.diffLines", () => {
  it("textos iguais não marcam nada", () => {
    const r = diffLines("a\nb\nc", "a\nb\nc");
    expect(marcadas(r.oldLines, "deleted")).toEqual([]);
    expect(marcadas(r.newLines, "added")).toEqual([]);
    expect(r.oldLines).toHaveLength(3);
  });
  it("marca linha trocada no meio como removida e adicionada", () => {
    const r = diffLines("a\nb\nc", "a\nX\nc");
    expect(marcadas(r.oldLines, "deleted")).toEqual(["b"]);
    expect(marcadas(r.newLines, "added")).toEqual(["X"]);
  });
  it("inserção pura só marca o lado novo", () => {
    const r = diffLines("a\nc", "a\nb\nc");
    expect(marcadas(r.oldLines, "deleted")).toEqual([]);
    expect(marcadas(r.newLines, "added")).toEqual(["b"]);
  });
  it("remoção pura só marca o lado antigo", () => {
    const r = diffLines("a\nb\nc", "a\nc");
    expect(marcadas(r.oldLines, "deleted")).toEqual(["b"]);
    expect(marcadas(r.newLines, "added")).toEqual([]);
  });
  it("trata null/undefined como texto vazio", () => {
    const r = diffLines(null, "x");
    expect(marcadas(r.newLines, "added")).toEqual(["x"]);
    const r2 = diffLines(undefined, undefined);
    expect(r2.oldLines).toEqual([{ text: "", deleted: false }]);
  });
  it("aceita CRLF e LF como equivalentes", () => {
    const r = diffLines("a\r\nb", "a\nb");
    expect(marcadas(r.oldLines, "deleted")).toEqual([]);
    expect(marcadas(r.newLines, "added")).toEqual([]);
  });
  it("usa a subsequência comum mais longa", () => {
    const r = diffLines("1\n2\n3\n4", "2\n4\n5");
    expect(marcadas(r.oldLines, "deleted")).toEqual(["1", "3"]);
    expect(marcadas(r.newLines, "added")).toEqual(["5"]);
  });
  it("textos enormes e totalmente diferentes: tudo trocado por inteiro", () => {
    const a = Array.from({ length: 2100 }, (_, i) => `a${i}`).join("\n");
    const b = Array.from({ length: 2100 }, (_, i) => `b${i}`).join("\n");
    const r = diffLines(a, b);
    expect(r.oldLines.every((l) => l.deleted)).toBe(true);
    expect(r.newLines.every((l) => l.added)).toBe(true);
  });
});
