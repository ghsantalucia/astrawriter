import { describe, it, expect } from "vitest";
import { normalizeEventName, parseEventNames, collectEventNames } from "../../../../src/renderer/utils/eventNames";

describe("eventNames", () => {
  it("normalizeEventName tira vírgulas, espaços extras e corta em 80", () => {
    expect(normalizeEventName("  A  guerra,  final ; x\n y ")).toBe("A guerra final x y");
    expect(normalizeEventName(null)).toBe("");
    expect(normalizeEventName("a".repeat(200))).toHaveLength(80);
  });
  it("parseEventNames separa por vírgula/;/linha e remove duplicados ignorando acento e caixa", () => {
    expect(parseEventNames("A queda, a QUEDA; Éclat\neclat, Fim")).toEqual(["A queda", "Éclat", "Fim"]);
  });
  it("parseEventNames aceita lista e descarta vazios", () => {
    expect(parseEventNames(["x", " ", "X", "y,z"])).toEqual(["x", "y z"]);
    expect(parseEventNames(null)).toEqual([]);
    expect(parseEventNames("")).toEqual([]);
  });
  const ev = (rel, meta) => ({ relPath: rel, metadata: meta });
  it("collectEventNames lista títulos ordenados e eventos citados sem ficha", () => {
    const files = [
      ev("assets/events/e1.md", { title: "Batalha", data: { after: { content: "Coroação, Tratado" }, before: { content: "batalha" } } }),
      ev("assets/events/e2.md", { data: { title: { content: "Alvorada" }, aliases: { content: "Tratado" } } }),
      ev("assets/characters/c1.md", { title: "Ignorado", data: { after: { content: "Nada" } } }),
    ];
    expect(collectEventNames(files)).toEqual({ titles: ["Alvorada", "Batalha"], pending: ["Coroação"] });
  });
  it("collectEventNames tolera entrada vazia e arquivos sem metadados", () => {
    expect(collectEventNames(undefined)).toEqual({ titles: [], pending: [] });
    expect(collectEventNames([ev("assets/events/x.md", undefined)])).toEqual({ titles: [], pending: [] });
  });
  it("collectEventNames ignora index/timeline (não são fichas)", () => {
    const r = collectEventNames([ev("assets/events/timeline.md", { title: "T" }), ev("assets/events/index.md", { title: "I" })]);
    expect(r.titles).toEqual([]);
  });
});
