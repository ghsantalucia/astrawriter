import { describe, it, expect } from "vitest";
import {
  MAX_DIGEST_CHARS,
  digestSystem,
  digestPrompt,
  parseJsonLoose,
  normalizeDigest,
  findCandidates,
  verifyPrompt,
  findStyleShifts,
  alignPrompt,
} from "../../../../src/renderer/review/digest";

describe("digest: prompts", () => {
  it("digestSystem inclui só as partes pedidas", () => {
    const tudo = digestSystem();
    expect(tudo).toContain('"facts"');
    expect(tudo).toContain('"events"');
    expect(tudo).not.toContain('"style"');
    const so = digestSystem({ facts: false, events: false, style: true });
    expect(so).not.toContain('"facts"');
    expect(so).not.toContain('"events"');
    expect(so).toContain('"style"');
    expect(so).toContain("lista vazia");
  });
  it("digestPrompt corta textos grandes", () => {
    const longo = "x".repeat(MAX_DIGEST_CHARS + 50);
    const p = digestPrompt("a.md", "T", longo);
    expect(p.startsWith("Arquivo: a.md\nTítulo: T\n\n")).toBe(true);
    expect(p).toContain("[... texto cortado]");
    expect(digestPrompt("a.md", "T", "curto")).toBe("Arquivo: a.md\nTítulo: T\n\ncurto");
  });
  it("verifyPrompt lista as afirmações com momento e trecho quando existem", () => {
    const p = verifyPrompt({ entity: "Ana", attribute: "idade", claims: [{ file: "a.md", value: "20", quote: "tem vinte", when: "ano 1" }, { file: "b.md", value: "30", quote: "", when: "" }] });
    expect(p).toContain('1. (a.md) valor: "20" [momento: ano 1]\n   trecho: "tem vinte"');
    expect(p).toContain('2. (b.md) valor: "30"');
    expect(p.split("\n").filter((l) => l.includes("trecho:"))).toHaveLength(1);
  });
  it("alignPrompt corta a sinopse em 6000 caracteres", () => {
    const p = alignPrompt("s".repeat(7000), [{ file: "c1", summary: "resumo" }]);
    expect(p.match(/s{100,}/)[0]).toHaveLength(6000);
    expect(p).toContain("- c1: resumo");
  });
});

describe("digest: parseJsonLoose", () => {
  it("lê JSON puro, cercado por ``` e com texto em volta", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('Aqui está: {"a":{"b":2}} fim')).toEqual({ a: { b: 2 } });
  });
  it("devolve null para o que não é JSON", () => {
    expect(parseJsonLoose("sem json")).toBeNull();
    expect(parseJsonLoose("")).toBeNull();
    expect(parseJsonLoose(null)).toBeNull();
    expect(parseJsonLoose("{quebrado")).toBeNull();
  });
});

describe("digest: normalizeDigest", () => {
  const conteudo = "Ana tem  olhos   verdes. Ela mora em Eldoria.";
  it("rejeita entrada que não é objeto", () => {
    expect(normalizeDigest(null, conteudo)).toBeNull();
    expect(normalizeDigest("x", conteudo)).toBeNull();
  });
  it("mantém citações que existem no texto (ignorando espaços e caixa) e descarta as inventadas", () => {
    const d = normalizeDigest(
      { summary: " resumo ", facts: [
        { entity: "Ana", attribute: "Cor dos Olhos", value: "verdes", quote: "OLHOS verdes" },
        { entity: "Ana", attribute: "cidade", value: "Eldoria", quote: "mora em Atlântida" },
      ] },
      conteudo,
    );
    expect(d.summary).toBe("resumo");
    expect(d.facts[0]).toMatchObject({ attribute: "cor dos olhos", quote: "OLHOS verdes" });
    expect(d.facts[1].quote).toBe("");
  });
  it("descarta fatos incompletos e limita a 30", () => {
    const facts = [{ entity: "A", attribute: "", value: "v" }, { entity: "", attribute: "x", value: "v" }, { entity: "A", attribute: "x", value: "" }];
    for (let i = 0; i < 40; i++) facts.push({ entity: "E", attribute: `a${i}`, value: "v" });
    expect(normalizeDigest({ facts }, "").facts).toHaveLength(30);
  });
  it("normaliza entidades, eventos e estilo", () => {
    const d = normalizeDigest({
      entities: [{ name: "Ana" }, { name: "" }, { name: "Rei", kind: "personagem" }],
      events: [{ title: "Guerra", after: ["a", "", "b"], before: "x" }, { title: "" }],
      style: { pov: "Terceira Limitada", tense: "PASSADO", tone: "Sombrio" },
    }, "");
    expect(d.entities).toEqual([{ name: "Ana", kind: "outro" }, { name: "Rei", kind: "personagem" }]);
    expect(d.events).toEqual([{ title: "Guerra", when: "", after: ["a", "b"], before: [] }]);
    expect(d.style).toEqual({ pov: "terceira limitada", tense: "passado", tone: "sombrio" });
    expect(normalizeDigest({}, "").style).toBeNull();
  });
  it("corta textos longos nos limites de cada campo", () => {
    const d = normalizeDigest({ summary: "s".repeat(900), entities: [{ name: "n".repeat(200) }] }, "");
    expect(d.summary).toHaveLength(500);
    expect(d.entities[0].name).toHaveLength(80);
  });
});

describe("digest: findCandidates", () => {
  const dig = (file, facts) => ({ file, hash: `h-${file}`, facts });
  const fato = (entity, attribute, value) => ({ entity, attribute, value, quote: "", when: "" });

  it("acha o mesmo atributo da mesma entidade com valores diferentes em arquivos diferentes", () => {
    const r = findCandidates([dig("a.md", [fato("Ana", "idade", "20")]), dig("b.md", [fato("ANA", "Idade", "30")])]);
    expect(r).toHaveLength(1);
    expect(r[0].entity).toBe("Ana");
    expect(r[0].claims.map((c) => c.file)).toEqual(["a.md", "b.md"]);
    expect(r[0].key).toContain("ana|idade|");
  });
  it("valores iguais (ignorando caixa/acento) não são candidatos", () => {
    expect(findCandidates([dig("a.md", [fato("Ana", "olhos", "Azuis")]), dig("b.md", [fato("Ana", "olhos", "azuis")])])).toEqual([]);
  });
  it("entidades ou atributos diferentes não se misturam; entradas vazias são toleradas", () => {
    expect(findCandidates([dig("a.md", [fato("Ana", "idade", "1")]), dig("b.md", [fato("Bia", "idade", "2")])])).toEqual([]);
    expect(findCandidates([])).toEqual([]);
    expect(findCandidates([{ file: "a.md" }])).toEqual([]);
  });
  it("limita a 4 afirmações por candidato e a chave muda quando o hash do arquivo muda", () => {
    const muitos = ["1", "2", "3", "4", "5", "6"].map((v, i) => dig(`f${i}.md`, [fato("Ana", "idade", v)]));
    expect(findCandidates(muitos)[0].claims).toHaveLength(4);
    const base = [dig("a.md", [fato("Ana", "idade", "20")]), dig("b.md", [fato("Ana", "idade", "30")])];
    const mudou = [{ ...base[0], hash: "novo" }, base[1]];
    expect(findCandidates(base)[0].key).not.toBe(findCandidates(mudou)[0].key);
  });
});

describe("digest: findStyleShifts", () => {
  const cap = (n, pov, tense) => ({ file: `content/chapter_00${n}/2_draft.md`, style: { pov, tense } });
  it("precisa de pelo menos 3 capítulos", () => {
    expect(findStyleShifts([cap(1, "primeira pessoa", "passado"), cap(2, "terceira", "passado")])).toEqual([]);
  });
  it("aponta o capítulo que foge da maioria", () => {
    const r = findStyleShifts([cap(1, "terceira", "passado"), cap(2, "terceira", "passado"), cap(3, "primeira", "passado")]);
    expect(r).toHaveLength(1);
    expect(r[0].file).toBe("content/chapter_003/2_draft.md");
    expect(r[0].message).toContain('"primeira"');
    expect(r[0].message).toContain('"terceira"');
    expect(r[0].message).toContain("narrador");
  });
  it("sem maioria absoluta não aponta nada; n/a e misto não contam", () => {
    expect(findStyleShifts([cap(1, "a", "x"), cap(2, "b", "x"), cap(3, "c", "x")]).filter((r) => r.message.includes("narrador"))).toEqual([]);
    expect(findStyleShifts([cap(1, "n/a", "x"), cap(2, "misto", "x"), cap(3, "terceira", "x")])).toEqual([]);
  });
  it("só considera os rascunhos dos capítulos", () => {
    const outros = [1, 2, 3].map((n) => ({ file: `assets/characters/c${n}.md`, style: { pov: n === 3 ? "a" : "b", tense: "x" } }));
    expect(findStyleShifts(outros)).toEqual([]);
  });
});
