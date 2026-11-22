import { describe, it, expect } from "vitest";
import {
  isEventFile,
  parseYear,
  splitNames,
  eventFromMetadata,
  analyzeTimeline,
  timelineMarkdown,
} from "../../../../src/renderer/review/timeline";

const ev = (rel, title, extra = {}) => ({ rel, title, aliases: [], when: "", after: [], before: [], ...extra });
const tipos = (issues) => issues.map((i) => i.type).sort();

describe("timeline: helpers", () => {
  it("isEventFile só aceita fichas .md de assets/events (menos index/template/timeline)", () => {
    expect(isEventFile("assets/events/guerra.md")).toBe(true);
    expect(isEventFile("assets/events/sub/guerra.md")).toBe(true);
    expect(isEventFile("assets/events/timeline.md")).toBe(false);
    expect(isEventFile("assets/events/index.md")).toBe(false);
    expect(isEventFile("assets/events/template.md")).toBe(false);
    expect(isEventFile("assets/places/a.md")).toBe(false);
    expect(isEventFile("assets/events/foto.png")).toBe(false);
  });
  it("parseYear lê o número e aplica a.C.", () => {
    expect(parseYear("ano 312")).toBe(312);
    expect(parseYear("312 d.C.")).toBe(312);
    expect(parseYear("300 a.C.")).toBe(-300);
    expect(parseYear("300 antes de Cristo")).toBe(-300);
    expect(parseYear("Ano 5, inverno")).toBe(5);
    expect(parseYear("-40")).toBe(-40);
    expect(parseYear("durante a guerra")).toBeNull();
    expect(parseYear("")).toBeNull();
    expect(parseYear(null)).toBeNull();
  });
  it("splitNames separa por vírgula, ponto e vírgula e quebra de linha", () => {
    expect(splitNames("a, b;c\n d,,")).toEqual(["a", "b", "c", "d"]);
    expect(splitNames(undefined)).toEqual([]);
  });
  it("eventFromMetadata lê os campos de data", () => {
    const e = eventFromMetadata("assets/events/x.md", { data: { when: { content: " ano 3 " }, after: { content: "A, B" }, before: { content: "C" }, aliases: { content: "X1" } } }, "X");
    expect(e).toEqual({ rel: "assets/events/x.md", title: "X", aliases: ["X1"], when: "ano 3", after: ["A", "B"], before: ["C"] });
    expect(eventFromMetadata("r", undefined, "T")).toEqual({ rel: "r", title: "T", aliases: [], when: "", after: [], before: [] });
  });
});

describe("timeline: analyzeTimeline", () => {
  it("ordena topologicamente e desempata por ano", () => {
    const r = analyzeTimeline([
      ev("c", "C", { after: ["B"] }),
      ev("a", "A", { when: "ano 1" }),
      ev("b", "B", { after: ["A"] }),
    ]);
    expect(r.ordered.map((e) => e.title)).toEqual(["A", "B", "C"]);
    expect(r.issues).toEqual([]);
  });
  it("'before' também cria a relação de ordem", () => {
    const r = analyzeTimeline([ev("a", "A", { before: ["B"] }), ev("b", "B")]);
    expect(r.ordered.map((e) => e.title)).toEqual(["A", "B"]);
  });
  it("referência a evento inexistente gera timeline-ref (aviso)", () => {
    const r = analyzeTimeline([ev("a", "A", { after: ["Fantasma"] })]);
    const ref = r.issues.filter((i) => i.type === "timeline-ref");
    expect(ref).toHaveLength(1);
    expect(ref[0]).toMatchObject({ severity: "warning", file: "a", category: "timeline" });
    expect(ref[0].message).toContain("Fantasma");
  });
  it("encontra eventos por apelido e ignora acento/caixa", () => {
    const r = analyzeTimeline([ev("a", "Grande Guerra", { aliases: ["O Conflito"] }), ev("b", "Paz", { after: ["o conflito"] })]);
    expect(r.issues.filter((i) => i.type === "timeline-ref")).toEqual([]);
    expect(r.ordered.map((e) => e.title)).toEqual(["Grande Guerra", "Paz"]);
  });
  it("momento que contradiz a ordem declarada gera timeline-order (erro) no evento posterior", () => {
    const r = analyzeTimeline([ev("a", "A", { when: "ano 50" }), ev("b", "B", { when: "ano 10", after: ["A"] })]);
    const i = r.issues.find((x) => x.type === "timeline-order");
    expect(i).toMatchObject({ severity: "error", file: "b" });
  });
  it("ciclo gera um único timeline-cycle e marca inCycle; o evento entra na ordem mesmo assim", () => {
    const r = analyzeTimeline([ev("a", "A", { after: ["B"] }), ev("b", "B", { after: ["A"] }), ev("c", "C")]);
    expect(tipos(r.issues).filter((t) => t === "timeline-cycle")).toHaveLength(1);
    expect(r.issues.find((i) => i.type === "timeline-cycle").message).toContain("A → B → A");
    expect(r.ordered).toHaveLength(3);
    expect(r.ordered.filter((e) => e.inCycle).map((e) => e.rel).sort()).toEqual(["a", "b"]);
  });
  it("evento sem momento nem relações vira timeline-gap e undated", () => {
    const r = analyzeTimeline([ev("a", "A"), ev("b", "B", { when: "ano 2" })]);
    expect(r.issues.map((i) => i.type)).toEqual(["timeline-gap"]);
    expect(r.ordered.find((e) => e.rel === "a").undated).toBe(true);
    expect(r.ordered.find((e) => e.rel === "b").undated).toBe(false);
  });
  it("eventos datados vêm antes dos sem data; auto-referência é ignorada", () => {
    const r = analyzeTimeline([ev("z", "Z"), ev("a", "A", { when: "ano 9", after: ["A"] })]);
    expect(r.ordered.map((e) => e.rel)).toEqual(["a", "z"]);
    expect(r.issues.some((i) => i.type === "timeline-cycle")).toBe(false);
  });
  it("lista vazia", () => {
    expect(analyzeTimeline([])).toEqual({ ordered: [], issues: [] });
  });
  it("ids dos issues são estáveis", () => {
    const e = [ev("a", "A", { after: ["Fantasma"] })];
    const ids = (x) => analyzeTimeline(x).issues.map((i) => i.id);
    expect(ids(e)).toEqual(ids(e));
    expect(ids(e).every((id) => /^t-/.test(id))).toBe(true);
  });
});

describe("timeline: timelineMarkdown", () => {
  it("numera datados e separa os sem data em seção própria", () => {
    const md = timelineMarkdown([
      { rel: "assets/events/a.md", title: "A [x]", when: "ano 1", undated: false },
      { rel: "assets/events/b.md", title: "B", when: "", undated: true },
    ]);
    expect(md.startsWith("# LINHA DO TEMPO")).toBe(true);
    expect(md).toContain("1. [A x](/assets/events/a.md) — ano 1");
    expect(md).toContain("## Sem data conhecida");
    expect(md).toContain("1. [B](/assets/events/b.md)");
    expect(md.endsWith("\n")).toBe(true);
  });
  it("sem sem-data não cria a seção", () => {
    expect(timelineMarkdown([{ rel: "r.md", title: "A", when: "1", undated: false }])).not.toContain("Sem data conhecida");
  });
});
