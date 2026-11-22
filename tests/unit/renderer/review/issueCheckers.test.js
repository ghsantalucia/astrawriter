import { describe, it, expect } from "vitest";
import {
  shortHash,
  bodyStart,
  maskProse,
  lineOf,
  findBrokenLinkIssues,
  findRepeatedWordIssues,
  collectWords,
  findTypoIssues,
  dictionaryKey,
} from "../../../../src/renderer/review/issueCheckers";

describe("issueCheckers: utilitários", () => {
  it("shortHash é estável, curto e distingue textos", () => {
    expect(shortHash("abc")).toBe(shortHash("abc"));
    expect(shortHash("abc")).not.toBe(shortHash("abd"));
    expect(shortHash("")).toMatch(/^[0-9a-z]+$/);
  });
  it("bodyStart acha o fim do frontmatter (LF e CRLF) ou 0", () => {
    expect(bodyStart("---\na: 1\n---\ncorpo")).toBe("---\na: 1\n---\n".length);
    expect(bodyStart("---\r\na: 1\r\n---\r\ncorpo")).toBe("---\r\na: 1\r\n---\r\n".length);
    expect(bodyStart("sem frontmatter")).toBe(0);
    expect(bodyStart("---\nnunca fecha")).toBe(0);
  });
  it("lineOf conta linhas a partir de 1", () => {
    expect(lineOf("a\nb\nc", 0)).toBe(1);
    expect(lineOf("a\nb\nc", 2)).toBe(2);
    expect(lineOf("a\nb\nc", 4)).toBe(3);
    expect(lineOf("a\nb", 999)).toBe(2);
  });
  it("maskProse mantém o tamanho e apaga frontmatter, código, HTML, links e URLs", () => {
    const t = "---\nk: v v\n---\nok `de de` <b>x x</b> [la la](a.md) https://x.com/a b b ```\nz z\n```";
    const m = maskProse(t);
    expect(m).toHaveLength(t.length);
    expect(m).toContain("ok");
    expect(m).not.toMatch(/k: v/);
    expect(m).not.toContain("de de");
    expect(m).not.toContain("la la");
    expect(m).not.toContain("https");
    expect(m).not.toContain("z z");
    expect(m).toContain("b b");
    expect(m.split("\n")).toHaveLength(t.split("\n").length);
  });
  it("dictionaryKey ignora caixa e espaços, mas não acentos", () => {
    expect(dictionaryKey("  ÉDEN ")).toBe("éden");
    expect(dictionaryKey(null)).toBe("");
    expect(dictionaryKey("eden")).not.toBe(dictionaryKey("éden"));
  });
});

describe("issueCheckers: links quebrados", () => {
  const existentes = new Set(["assets/places/a.md"]);
  const toRel = (href) => href.replace(/^\//, "").toLowerCase();

  it("acha link para arquivo inexistente com sugestão de manter o texto", () => {
    const c = "Veja [o lugar](/assets/places/zzz.md) agora.";
    const [i] = findBrokenLinkIssues("n.md", c, existentes, toRel);
    expect(i).toMatchObject({ type: "broken-link", category: "links", severity: "error", source: "system", file: "n.md", line: 1, target: "/assets/places/zzz.md" });
    expect(c.slice(i.start, i.end)).toBe("[o lugar](/assets/places/zzz.md)");
    expect(i.suggestion.replace).toBe("o lugar");
    expect(i.message).toContain("assets/places/zzz.md");
  });
  it("não reporta links que existem (inclusive com fragmento #auto)", () => {
    const c = "[a](/assets/places/a.md#auto) [b](assets/places/a.md)";
    expect(findBrokenLinkIssues("n.md", c, existentes, toRel)).toEqual([]);
  });
  // BUG (issueCheckers.ts, findBrokenLinkIssues): a regex aceita qualquer endereço terminado em .md, inclusive URLs
  // externas (https://...), que nunca estarão em `existing`. Esperado: link externo não é link interno quebrado.
  it("não reporta links externos que terminam em .md", () => {
    const c = "[site](https://x.com/y.md)";
    expect(findBrokenLinkIssues("n.md", c, existentes, toRel)).toEqual([]);
  });
  it("ignora links dentro de código", () => {
    const c = "`[x](/nada.md)`\n```\n[y](/nada.md)\n```";
    expect(findBrokenLinkIssues("n.md", c, existentes, toRel)).toEqual([]);
  });
  it("o mesmo link quebrado repetido gera ids distintos, estáveis entre execuções", () => {
    const c = "[x](/nada.md) e [x](/nada.md)";
    const a = findBrokenLinkIssues("n.md", c, existentes, toRel);
    const b = findBrokenLinkIssues("n.md", c, existentes, toRel);
    expect(a).toHaveLength(2);
    expect(a[0].id).not.toBe(a[1].id);
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
  });
  it("calcula a linha do issue", () => {
    const [i] = findBrokenLinkIssues("n.md", "a\n\n[x](/nada.md)", existentes, toRel);
    expect(i.line).toBe(3);
  });
});

describe("issueCheckers: palavras repetidas", () => {
  it("detecta 'de de' ignorando caixa e sugere manter uma", () => {
    const c = "Isso é um teste de De palavras.";
    const [i] = findRepeatedWordIssues("a.md", c);
    expect(i).toMatchObject({ type: "repeated-word", severity: "error", word: "de" });
    expect(c.slice(i.start, i.end)).toBe("de De");
    expect(i.suggestion.replace).toBe("de");
  });
  it("não considera palavras separadas por pontuação, quebra de linha ou 1 letra", () => {
    expect(findRepeatedWordIssues("a.md", "casa, casa")).toEqual([]);
    expect(findRepeatedWordIssues("a.md", "casa\ncasa")).toEqual([]);
    expect(findRepeatedWordIssues("a.md", "a a")).toEqual([]);
    expect(findRepeatedWordIssues("a.md", "123 123")).toEqual([]);
  });
  it("ignora repetições em código, links e frontmatter", () => {
    const c = "---\nt: casa casa\n---\n`de de` [la la](x.md)";
    expect(findRepeatedWordIssues("a.md", c)).toEqual([]);
  });
  it("conta ocorrências separadas e dá ids distintos", () => {
    const r = findRepeatedWordIssues("a.md", "foi foi e foi foi");
    expect(r).toHaveLength(2);
    expect(new Set(r.map((x) => x.id)).size).toBe(2);
  });
});

describe("issueCheckers: ortografia", () => {
  it("collectWords devolve palavras de 3+ letras sem números, com posições", () => {
    const c = "Oi eu sou o Zé e tenho 18anos hoje";
    const ws = collectWords(c).map((w) => w.word);
    expect(ws).toEqual(["sou", "tenho", "hoje"]);
    for (const w of collectWords(c)) expect(c.slice(w.start, w.end)).toBe(w.word);
  });
  it("collectWords ignora o que não é prosa", () => {
    expect(collectWords("`codigo` [link](x.md) <tag>")).toEqual([]);
  });
  it("findTypoIssues reporta só as desconhecidas, com ids distintos para repetidas", () => {
    const c = "kasa e kasa e casa";
    const ws = collectWords(c);
    const r = findTypoIssues("a.md", c, ws, new Set(["kasa"]));
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ type: "typo", severity: "warning", word: "kasa" });
    expect(r[0].id).not.toBe(r[1].id);
  });
  it("findTypoIssues pula palavra já coberta por um issue de repetição", () => {
    const c = "kasa kasa";
    const rep = findRepeatedWordIssues("a.md", c);
    expect(findTypoIssues("a.md", c, collectWords(c), new Set(["kasa"]), rep)).toEqual([]);
  });
});
