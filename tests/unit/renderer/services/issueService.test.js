import { describe, it, expect, vi, beforeEach } from "vitest";

const spell = vi.hoisted(() => ({ findMisspelled: vi.fn(async (words) => words.filter((w) => w.startsWith("kx"))) }));
vi.mock("../../../../src/renderer/services/spellService", () => ({ spellService: spell }));

import { IssueService } from "../../../../src/renderer/services/issueService";
import { EMPTY } from "../../../../src/renderer/review/reviewStore";

const LIVRO = "C:/livros/book_1";
let svc;

const issue = (id, extra = {}) => ({ id, category: "spelling", type: "typo", severity: "warning", source: "system", file: "a.md", line: 1, excerpt: "x", message: "m", word: "kxfoo", ...extra });

function novo({ dados = {}, ligado = true } = {}) {
  const s = new IssueService({ currentBookPath: "C:\\livros\\book_1\\" }, { record: vi.fn() }, {});
  s.data = {
    state: { ...EMPTY.state(), files: {} },
    registered: EMPTY.registered(),
    dismissed: EMPTY.dismissed(),
    dictionary: EMPTY.dictionary(),
    settings: { ...EMPTY.settings(), enabled: ligado },
    ...dados,
  };
  s.persist = vi.fn();
  return s;
}

beforeEach(() => {
  spell.findMisspelled.mockClear();
  svc = novo();
});

describe("IssueService: caminhos", () => {
  it("relOf devolve o caminho relativo ao livro, sem .temp", () => {
    expect(svc.relOf(`${LIVRO}/content/a.md.temp`)).toBe("content/a.md");
    expect(svc.relOf("C:\\livros\\book_1\\notes\\n.md")).toBe("notes/n.md");
  });
  it("relOf devolve null para arquivos fora do livro ou sem livro aberto", () => {
    expect(svc.relOf("C:/livros/book_10/a.md")).toBeNull();
    expect(svc.relOf("D:/outro/a.md")).toBeNull();
    svc.state.currentBookPath = null;
    expect(svc.relOf(`${LIVRO}/a.md`)).toBeNull();
  });
});

describe("IssueService: lista, filtros e resumo", () => {
  beforeEach(() => {
    svc.data.state.files = {
      "a.md": { issues: [issue("s1"), issue("s2", { type: "repeated-word", category: "spelling", severity: "error", word: "de" })] },
      "b.md": { issues: [issue("s3", { file: "b.md", category: "links", type: "broken-link", severity: "error" })] },
    };
    svc.data.registered.issues = [issue("r1", { source: "ai", type: "grammar", file: "a.md" })];
    svc.external = { timeline: [issue("t1", { category: "timeline", type: "timeline-gap", file: "assets/events/x.md", word: undefined })] };
  });

  it("all junta arquivos, registrados e externos", () => {
    expect(svc.all().map((i) => i.id).sort()).toEqual(["r1", "s1", "s2", "s3", "t1"]);
  });
  it("all sem dados devolve vazio", () => {
    svc.data = null;
    expect(svc.all()).toEqual([]);
  });
  it("não mostra issues dispensados nem de tipos dispensados", () => {
    svc.data.dismissed = { version: 1, issues: { s1: { at: "x" } }, types: { "broken-link": { at: "y" } } };
    expect(svc.all().map((i) => i.id).sort()).toEqual(["r1", "s2", "t1"]);
  });
  it("palavra aceita no dicionário (ou nome de ficha) não é mais typo", () => {
    svc.data.dictionary.words = ["kxfoo"];
    expect(svc.all().some((i) => i.id === "s1")).toBe(false);
    expect(svc.all().some((i) => i.id === "s2")).toBe(true);
  });
  it("palavras das fichas (file.words) também contam como conhecidas", () => {
    svc.data.state.files["c.md"] = { issues: [], words: ["kxfoo"] };
    expect(svc.all().some((i) => i.id === "s1")).toBe(false);
  });
  it("o resultado é guardado em cache até publish()", () => {
    const a = svc.all();
    expect(svc.all()).toBe(a);
    svc.publish();
    expect(svc.all()).not.toBe(a);
    expect(svc.all().map((i) => i.id)).toEqual(a.map((i) => i.id));
  });
  it("find localiza por id (só visíveis)", () => {
    expect(svc.find("s3").file).toBe("b.md");
    expect(svc.find("zzz")).toBeUndefined();
  });
  it("list filtra por categoria, tipo, arquivo, severidade e origem (combinados)", () => {
    expect(svc.list({ category: "links" }).map((i) => i.id)).toEqual(["s3"]);
    expect(svc.list({ type: "typo" }).map((i) => i.id)).toEqual(["s1"]);
    expect(svc.list({ file: "a.md" }).map((i) => i.id).sort()).toEqual(["r1", "s1", "s2"]);
    expect(svc.list({ severity: "error" }).map((i) => i.id).sort()).toEqual(["s2", "s3"]);
    expect(svc.list({ source: "ai" }).map((i) => i.id)).toEqual(["r1"]);
    expect(svc.list({ file: "a.md", severity: "error" }).map((i) => i.id)).toEqual(["s2"]);
    expect(svc.list()).toHaveLength(5);
  });
  it("summary conta erros e avisos por categoria, tipo e arquivo e define a cor", () => {
    const s = svc.summary();
    expect(s).toMatchObject({ total: 5, errors: 2, warnings: 3, color: "error", disabled: false });
    expect(s.byCategory.spelling).toEqual({ error: 1, warning: 2 });
    expect(s.byCategory.links).toEqual({ error: 1, warning: 0 });
    expect(s.byType["repeated-word"]).toEqual({ error: 1, warning: 0 });
    expect(s.byFile["a.md"]).toEqual({ error: 1, warning: 2 });
    expect(s.worst.map((w) => w.id)).toEqual(["s2", "s3"]);
  });
  it("summary: só avisos = warning; nada = none; revisões desligadas = disabled", () => {
    const so = novo();
    so.data.registered.issues = [issue("w", { word: undefined, type: "style-tip" })];
    expect(so.summary().color).toBe("warning");
    const nada = novo({ ligado: false });
    expect(nada.summary()).toMatchObject({ total: 0, color: "none", disabled: true });
  });
  it("summary limita os 'worst' a 5", () => {
    const s = novo();
    s.data.registered.issues = Array.from({ length: 8 }, (_, i) => issue(`e${i}`, { severity: "error", type: "fact-conflict", word: undefined }));
    expect(s.summary().worst).toHaveLength(5);
  });
  it("brief resume o issue, limitando o trecho e expondo a correção", () => {
    const b = svc.brief(issue("x", { excerpt: "e".repeat(300), suggestion: { replace: "certo" } }));
    expect(b.excerpt).toHaveLength(120);
    expect(b.fix).toBe("certo");
    expect(svc.brief(issue("y")).fix).toBeUndefined();
    expect(svc.brief(issue("z", { suggestion: { replace: "" } })).fix).toBe("");
  });
  it("dismissedTypes traz rótulo e categoria; dictionaryWords ordena", () => {
    svc.data.dismissed.types = { typo: { at: "2024-01-01" } };
    expect(svc.dismissedTypes()).toEqual([{ type: "typo", label: "Erro de digitação", category: "spelling", at: "2024-01-01" }]);
    svc.data.dictionary.words = ["zebra", "abelha", "Ônibus"];
    expect(svc.dictionaryWords()).toEqual(["abelha", "Ônibus", "zebra"]);
    svc.data = null;
    expect(svc.dismissedTypes()).toEqual([]);
    expect(svc.dictionaryWords()).toEqual([]);
  });
  it("isEnabled é verdadeiro por padrão e falso só com enabled:false", () => {
    expect(svc.isEnabled()).toBe(true);
    expect(novo({ ligado: false }).isEnabled()).toBe(false);
    svc.data = null;
    expect(svc.isEnabled()).toBe(true);
  });
  it("countTypes conta por tipo", () => {
    expect(svc.countTypes([issue("a"), issue("b"), issue("c", { type: "grammar" })])).toEqual({ typo: 2, grammar: 1 });
    expect(svc.countTypes([])).toEqual({});
  });
});

describe("IssueService: localização de trechos", () => {
  it("locate acha o trecho mais próximo da dica", () => {
    const t = "abc XX def XX ghi XX";
    expect(svc.locate(t, "XX", 12)).toBe(11);
    expect(svc.locate(t, "XX", 0)).toBe(4);
    expect(svc.locate(t, "XX", 4)).toBe(4);
    expect(svc.locate(t, "XX", 100)).toBe(18);
  });
  it("locate devolve -1 sem trecho ou quando ele sumiu", () => {
    expect(svc.locate("abc", "", 0)).toBe(-1);
    expect(svc.locate("abc", "zzz", 0)).toBe(-1);
  });
  it("relocateRegistered reposiciona, remove os que sumiram e persiste só se mudou", () => {
    svc.data.registered.issues = [
      issue("r1", { file: "a.md", excerpt: "alvo", start: 0, end: 4, type: "grammar" }),
      issue("r2", { file: "a.md", excerpt: "sumiu", start: 0, end: 5, type: "grammar" }),
      issue("r3", { file: "b.md", excerpt: "outro", start: 0, end: 5, type: "grammar" }),
      issue("r4", { file: "a.md", excerpt: "", type: "grammar" }),
    ];
    svc.relocateRegistered("a.md", "linha 1\nlinha 2 com alvo aqui");
    expect(svc.data.registered.issues.map((i) => i.id)).toEqual(["r1", "r3", "r4"]);
    const r1 = svc.data.registered.issues[0];
    expect(r1).toMatchObject({ start: 20, end: 24, line: 2 });
    expect(svc.persist).toHaveBeenCalledWith("registered");
    svc.persist.mockClear();
    svc.relocateRegistered("a.md", "linha 1\nlinha 2 com alvo aqui");
    expect(svc.persist).not.toHaveBeenCalled();
  });
});

describe("IssueService: análise de arquivo", () => {
  it("describeFile extrai título, palavras dos nomes e dados de evento", () => {
    const c = '---\ntitle: Rei Arthur\ndata:\n  title:\n    content: "Arthur Pendragon"\n  aliases:\n    content: "Art, Majestade"\n---\ncorpo';
    const d = svc.describeFile(c, "assets/characters/arthur.md");
    expect(d.title).toBe("Rei Arthur");
    expect(d.words.sort()).toEqual(["art", "arthur", "majestade", "pendragon", "rei"]);
    expect(d.event).toBeNull();
  });
  it("describeFile: sem título usa o nome do arquivo; ficha de evento gera o evento", () => {
    expect(svc.describeFile("texto solto", "notes/minha-nota.md").title).toBe("minha-nota");
    const e = svc.describeFile("---\ndata:\n  when:\n    content: ano 5\n---\nx", "assets/events/guerra.md");
    expect(e.event).toMatchObject({ rel: "assets/events/guerra.md", title: "guerra", when: "ano 5" });
  });
  it("analyzeFile: links quebrados, repetidas e ortografia", async () => {
    const existing = new Set(["assets/a.md"]);
    const content = "O de de caso kxerro [x](/nada.md) [ok](/assets/a.md).";
    const r = await svc.analyzeFile({ rel: "n.md", content }, existing, true, null);
    expect(r.map((i) => i.type).sort()).toEqual(["broken-link", "repeated-word", "typo"]);
    expect(r.find((i) => i.type === "typo").word).toBe("kxerro");
  });
  it("analyzeFile com ortografia desligada só confere links", async () => {
    const r = await svc.analyzeFile({ rel: "n.md", content: "de de kxerro [x](/nada.md)" }, new Set(), false, null);
    expect(r.map((i) => i.type)).toEqual(["broken-link"]);
    expect(spell.findMisspelled).not.toHaveBeenCalled();
  });
  it("analyzeFile respeita o filtro de tipos", async () => {
    const r = await svc.analyzeFile({ rel: "n.md", content: "de de kxerro [x](/nada.md)" }, new Set(), true, ["repeated-word"]);
    expect(r.map((i) => i.type)).toEqual(["repeated-word"]);
  });
  it("analyzeFile não confere ortografia de índices, linha do tempo e análise dos capítulos", async () => {
    for (const rel of ["assets/characters/index.md", "assets/events/timeline.md", "content/chapter_001/3_analysis.md", "notes/manual-completo.md"]) {
      expect(await svc.analyzeFile({ rel, content: "kxerro de de" }, new Set(), true, null)).toEqual([]);
    }
  });
  it("analyzeFile não consulta o dicionário para palavras já conhecidas", async () => {
    svc.data.dictionary.words = ["kxconhecida"];
    await svc.analyzeFile({ rel: "n.md", content: "kxconhecida kxnova" }, new Set(), true, ["typo"]);
    expect(spell.findMisspelled).toHaveBeenCalledWith(["kxnova"]);
  });
});
