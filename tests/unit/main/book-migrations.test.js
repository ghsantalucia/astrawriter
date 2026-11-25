import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

vi.mock("electron", async () => (await import("../../helpers/electronMock.js")).createElectronMock());

import {
  insertFrontmatterFlag,
  insertAliasesVariable,
  insertEventsType,
  removeAiWriteFlag,
  ensureDeleteFlags,
  ensureFolderFlags,
  ensureAliasVariable,
  ensureEventsType,
  ensureNotesInheritAiWrite,
  ensureEventsCategory,
  ensureChapterLayout,
  migrateBook,
} from "../../../src/main/book-migrations";

describe("book-migrations.insertFrontmatterFlag", () => {
  it("insere depois de 'advanced' ou 'aiWrite' quando existem", () => {
    expect(insertFrontmatterFlag("---\na: 1\nadvanced: false\nb: 2\n---\ncorpo", "userDelete", false)).toBe("---\na: 1\nadvanced: false\nuserDelete: false\nb: 2\n---\ncorpo");
    expect(insertFrontmatterFlag("---\naiWrite: true\n---\nc", "userDelete", true)).toBe("---\naiWrite: true\nuserDelete: true\n---\nc");
  });
  it("sem âncora, insere no fim do frontmatter", () => {
    expect(insertFrontmatterFlag("---\na: 1\n---\nc", "k", true)).toBe("---\na: 1\nk: true\n---\nc");
  });
  it("não altera se a chave já existe ou não há frontmatter", () => {
    const t = "---\nuserDelete: true\n---\nc";
    expect(insertFrontmatterFlag(t, "userDelete", false)).toBe(t);
    expect(insertFrontmatterFlag("sem frontmatter", "k", true)).toBe("sem frontmatter");
  });
  it("preserva CRLF", () => {
    expect(insertFrontmatterFlag("---\r\nadvanced: true\r\n---\r\nc", "k", false)).toBe("---\r\nadvanced: true\r\nk: false\r\n---\r\nc");
  });
});

describe("book-migrations.insertAliasesVariable", () => {
  const rotulo = "Apelidos";
  it("insere a variável logo após o bloco 'title' de data", () => {
    const t = '---\ntitle: Ana\ndata:\n  title:\n    placeholder: "Nome"\n    content: "Ana"\n  age:\n    placeholder: "Idade"\n---\ncorpo';
    const r = insertAliasesVariable(t, rotulo);
    expect(r).toContain('  aliases:\n    placeholder: "Apelidos"\n    required: false\n    content: ""');
    expect(r.indexOf("aliases:")).toBeGreaterThan(r.indexOf("title:\n    placeholder"));
    expect(r.indexOf("aliases:")).toBeLessThan(r.indexOf("age:"));
    expect(r.endsWith("---\ncorpo")).toBe(true);
  });
  it("ficha antiga sem bloco data ganha title e aliases a partir do título", () => {
    const r = insertAliasesVariable('---\ntitle: "Rei Arthur"\n---\ncorpo', rotulo);
    expect(r).toContain("data:\n  title:");
    expect(r).toContain('content: "Rei Arthur"');
    expect(r).toContain("  aliases:");
  });
  it("não duplica e tolera arquivo sem frontmatter", () => {
    const ja = "---\ndata:\n  title:\n    content: x\n  aliases:\n    content: y\n---\nc";
    expect(insertAliasesVariable(ja, rotulo)).toBe(ja);
    expect(insertAliasesVariable("texto", rotulo)).toBe("texto");
  });
  it("com data mas sem bloco title, não altera", () => {
    const t = "---\ndata:\n  age:\n    content: 1\n---\nc";
    expect(insertAliasesVariable(t, rotulo)).toBe(t);
  });
});

describe("book-migrations.insertEventsType", () => {
  it("marca 'after' e 'before' como type: events logo depois do placeholder", () => {
    const t = '---\ndata:\n  after:\n    placeholder: "Depois de"\n    content: ""\n  before:\n    placeholder: "Antes de"\n---\nc';
    const r = insertEventsType(t);
    expect(r).toContain('  after:\n    placeholder: "Depois de"\n    type: events\n    content: ""');
    expect(r).toContain('  before:\n    placeholder: "Antes de"\n    type: events');
  });
  it("não repete se já tem type e não altera sem frontmatter", () => {
    const t = "---\ndata:\n  after:\n    type: events\n---\nc";
    expect(insertEventsType(t)).toBe(t);
    expect(insertEventsType("x")).toBe("x");
  });
  it("é idempotente", () => {
    const t = '---\ndata:\n  after:\n    placeholder: "A"\n---\nc';
    const uma = insertEventsType(t);
    expect(insertEventsType(uma)).toBe(uma);
  });
});

describe("book-migrations.removeAiWriteFlag", () => {
  it("remove do frontmatter de um .md", () => {
    expect(removeAiWriteFlag("---\na: 1\naiWrite: true\nb: 2\n---\ncorpo")).toBe("---\na: 1\nb: 2\n---\ncorpo");
  });
  it("remove de um YAML puro", () => {
    expect(removeAiWriteFlag("title: x\naiWrite: false\nother: 1\n", true)).toBe("title: x\nother: 1\n");
  });
  it("não mexe em aiWrite fora do frontmatter nem sem a chave", () => {
    const t = "---\na: 1\n---\naiWrite: true";
    expect(removeAiWriteFlag(t)).toBe(t);
    expect(removeAiWriteFlag("sem")).toBe("sem");
  });
});

describe("book-migrations em disco", () => {
  let livro;
  beforeEach(() => {
    livro = fs.mkdtempSync(path.join(os.tmpdir(), "astra-mig-"));
  });
  afterEach(() => {
    fs.rmSync(livro, { recursive: true, force: true });
  });
  const w = (rel, c) => {
    const f = path.join(livro, ...rel.split("/"));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, c);
    return f;
  };
  const r = (rel) => fs.readFileSync(path.join(livro, ...rel.split("/")), "utf8");

  it("ensureDeleteFlags: estruturais userDelete:false, templates true; idempotente", async () => {
    w("content/index.md", "---\nadvanced: false\n---\n# I");
    w("content/plot.md", "---\ntitle: P\n---\nx");
    w("content/chapter_001/2_draft.md", "---\ntitle: D\n---\nx");
    w("assets/characters/template.md", "---\ntitle: T\n---\nx");
    w("assets/characters/ana.md", "---\ntitle: Ana\n---\nx");
    expect(await ensureDeleteFlags(livro)).toBe(4);
    expect(r("content/index.md")).toContain("userDelete: false");
    expect(r("content/plot.md")).toContain("userDelete: false");
    expect(r("content/chapter_001/2_draft.md")).toContain("userDelete: false");
    expect(r("assets/characters/template.md")).toContain("userDelete: true");
    expect(r("assets/characters/ana.md")).not.toContain("userDelete");
    expect(await ensureDeleteFlags(livro)).toBe(0);
  });
  it("ensureDeleteFlags ignora pastas ocultas", async () => {
    w(".system/index.md", "---\na: 1\n---\nx");
    expect(await ensureDeleteFlags(livro)).toBe(0);
  });
  it("ensureFolderFlags acrescenta userDelete/userRename só onde faltam", async () => {
    w("notes/folder.yml", "title: Notas");
    w("assets/folder.yml", "title: A\nuserDelete: true\n");
    expect(await ensureFolderFlags(livro, { log: false })).toBe(1);
    expect(r("notes/folder.yml")).toBe("title: Notas\nuserDelete: false\nuserRename: false\n");
    expect(r("assets/folder.yml")).toBe("title: A\nuserDelete: true\n");
  });
  it("ensureAliasVariable atualiza fichas de personagens/ambientes e pula índices", async () => {
    w("assets/characters/ana.md", '---\ntitle: Ana\ndata:\n  title:\n    placeholder: "Nome"\n---\nx');
    w("assets/characters/index.md", "---\ntitle: I\n---\nx");
    w("assets/events/e.md", "---\ntitle: E\n---\nx");
    expect(await ensureAliasVariable(livro)).toBe(1);
    expect(r("assets/characters/ana.md")).toContain("aliases:");
    expect(r("assets/characters/index.md")).not.toContain("aliases");
    expect(r("assets/events/e.md")).not.toContain("aliases");
    expect(await ensureAliasVariable(livro)).toBe(0);
  });
  it("ensureEventsType atualiza fichas de eventos (incluindo .md.temp), ignorando index e timeline", async () => {
    const ficha = '---\ndata:\n  after:\n    placeholder: "A"\n---\nx';
    w("assets/events/e.md", ficha);
    w("assets/events/e2.md.temp", ficha);
    w("assets/events/timeline.md", ficha);
    expect(await ensureEventsType(livro)).toBe(2);
    expect(r("assets/events/timeline.md")).toBe(ficha);
    expect(await ensureEventsType(path.join(livro, "nada"))).toBe(0);
  });
  it("ensureNotesInheritAiWrite remove aiWrite de arquivos e subpastas, mantendo o da raiz de notes", async () => {
    w("notes/folder.yml", "title: N\naiWrite: true\n");
    w("notes/sub/folder.yml", "title: S\naiWrite: true\n");
    w("notes/n.md", "---\ntitle: N\naiWrite: true\n---\nx");
    w("notes/n2.md.temp", "---\ntitle: N\naiWrite: true\n---\nx");
    expect(await ensureNotesInheritAiWrite(livro)).toBe(3);
    expect(r("notes/folder.yml")).toContain("aiWrite: true");
    expect(r("notes/sub/folder.yml")).not.toContain("aiWrite");
    expect(r("notes/n.md")).not.toContain("aiWrite");
    expect(r("notes/n2.md.temp")).not.toContain("aiWrite");
    expect(await ensureNotesInheritAiWrite(path.join(livro, "inexistente"))).toBe(0);
  });
  it("ensureEventsCategory move assets/timeline.md para assets/events e corrige links", async () => {
    w("assets/timeline.md", "# T");
    w("content/plot.md", "veja [linha](/assets/timeline.md) e [outra](assets/timeline.md)");
    await ensureEventsCategory(livro);
    expect(fs.existsSync(path.join(livro, "assets", "timeline.md"))).toBe(false);
    expect(r("assets/events/timeline.md")).toBe("# T");
    expect(r("content/plot.md")).toBe("veja [linha](/assets/events/timeline.md) e [outra](assets/events/timeline.md)");
  });
  it("ensureEventsCategory unifica o índice de eventos na linha do tempo e remove o índice", async () => {
    w("assets/events/timeline.md", "# T\n\n- [A](/assets/events/a.md)");
    w("assets/events/index.md", "# I\n- [A](/assets/events/a.md)\n- [B](/assets/events/b.md)\n- [T](/assets/events/timeline.md)");
    w("content/plot.md", "[idx](/assets/events/index.md)");
    await ensureEventsCategory(livro);
    expect(fs.existsSync(path.join(livro, "assets", "events", "index.md"))).toBe(false);
    const t = r("assets/events/timeline.md");
    expect(t).toContain("- [B](/assets/events/b.md)");
    expect(t.match(/events\/a\.md/g)).toHaveLength(1);
    expect(r("content/plot.md")).toBe("[idx](/assets/events/timeline.md)");
  });
  it("ensureEventsCategory não faz nada sem a pasta assets", async () => {
    await ensureEventsCategory(livro);
    expect(fs.existsSync(path.join(livro, "assets"))).toBe(false);
  });
  it("ensureChapterLayout: 1_script vira 1_outline (título e links atualizados) e 3_metadata é removido", async () => {
    w("content/chapter_001/1_script.md", '---\ntitle: "Plano Executivo"\nadvanced: true\n---\n# PLANO EXECUTIVO\nx');
    w("content/chapter_001/3_metadata.md", "---\ntitle: M\n---\nx");
    w("content/index.md", "- [C](/content/chapter_001/1_script.md)");
    await ensureChapterLayout(livro);
    expect(fs.existsSync(path.join(livro, "content", "chapter_001", "1_script.md"))).toBe(false);
    expect(fs.existsSync(path.join(livro, "content", "chapter_001", "3_metadata.md"))).toBe(false);
    const o = r("content/chapter_001/1_outline.md");
    expect(o).toContain('title: "Esboço"');
    expect(o).toContain("# ESBOÇO");
    expect(o).toContain("advanced: false");
    expect(r("content/index.md")).toBe("- [C](/content/chapter_001/1_outline.md)");
  });
  it("ensureChapterLayout: backlog sem edições do autor é descartado; editado vira seção da análise", async () => {
    w("content/chapter_001/backlog/1_analysis.md", "---\ntitle: A\n---\nMinha análise própria");
    w("content/chapter_001/backlog/3_roadmap.md", "---\ntitle: R\n---\nPlano meu");
    w("content/chapter_002/backlog/1_analysis.md", "---\ntitle: A\n---\n");
    await ensureChapterLayout(livro);
    expect(fs.existsSync(path.join(livro, "content", "chapter_001", "backlog"))).toBe(false);
    const a1 = r("content/chapter_001/3_analysis.md");
    expect(a1).toContain("Minha análise própria");
    expect(a1).toContain("## Planejamento dos próximos capítulos");
    expect(a1).toContain("Plano meu");
    const a2 = r("content/chapter_002/3_analysis.md");
    expect(a2).not.toContain("Minha análise");
    expect(fs.existsSync(path.join(livro, "content", "chapter_002", "backlog"))).toBe(false);
  });
  it("ensureChapterLayout: a análise nova nasce do modelo do disco (templates/book), não do texto embutido", async () => {
    w("content/chapter_001/backlog/1_analysis.md", "---\ntitle: A\n---\n");
    await ensureChapterLayout(livro);
    const lf = (t) => t.replace(/\r\n?/g, "\n");
    const modelo = fs.readFileSync(path.join(process.cwd(), "templates", "book", "content", "chapter_001", "3_analysis.md"), "utf8");
    expect(lf(r("content/chapter_001/3_analysis.md"))).toBe(lf(modelo));
  });
  it("ensureChapterLayout não sobrescreve uma 3_analysis.md existente", async () => {
    w("content/chapter_001/3_analysis.md", "---\ntitle: A\n---\nIntacta");
    w("content/chapter_001/backlog/1_analysis.md", "---\ntitle: A\n---\nx");
    await ensureChapterLayout(livro);
    expect(r("content/chapter_001/3_analysis.md")).toContain("Intacta");
    expect(fs.existsSync(path.join(livro, "content", "chapter_001", "backlog"))).toBe(true);
  });
  it("migrateBook renomeia cap_NNN para chapter_NNN e corrige índice, config e changelog", async () => {
    w("content/cap_001/2_draft.md", "---\ntitle: D\n---\nx");
    w("content/index.md", "- [C](/content/cap_001/2_draft.md)");
    w("config.json", JSON.stringify({ openFolders: ["content/cap_001"], file: "C:\\x\\content\\cap_001\\2_draft.md" }));
    w(".system/changelog/logs/log_0001.jsonl", '{"path":"content/cap_001/2_draft.md"}\n');
    const pause = vi.fn((task) => task());
    const res = await migrateBook(livro, { pause });
    expect(res.renamed).toEqual([{ from: "cap_001", to: "chapter_001" }]);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(livro, "content", "chapter_001", "2_draft.md"))).toBe(true);
    expect(fs.existsSync(path.join(livro, "content", "cap_001"))).toBe(false);
    expect(r("content/index.md")).toContain("content/chapter_001/2_draft.md");
    expect(r("config.json")).toContain("chapter_001");
    expect(r("config.json")).not.toContain("cap_001");
    expect(r(".system/changelog/logs/log_0001.jsonl")).toContain("content/chapter_001");
  });
  it("migrateBook não renomeia se o destino já existe e é idempotente", async () => {
    w("content/cap_001/a.md", "---\nt: 1\n---\nx");
    w("content/chapter_001/b.md", "---\nt: 1\n---\nx");
    expect((await migrateBook(livro)).renamed).toEqual([]);
    expect(fs.existsSync(path.join(livro, "content", "cap_001", "a.md"))).toBe(true);
    const antes = r("content/chapter_001/b.md");
    await migrateBook(livro);
    expect(r("content/chapter_001/b.md")).toBe(antes);
  });
  it("migrateBook num livro sem pasta content devolve renamed vazio sem lançar erro", async () => {
    expect(await migrateBook(livro)).toEqual({ renamed: [] });
  });
});
