import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SearchService } from "../../../../src/renderer/services/searchService";
import { addEntityToIndex, removeFromIndexes } from "../../../../src/renderer/services/indexService";
import { TemplateService, mergeTemplate } from "../../../../src/renderer/services/templateService";

let disco;
let api;
beforeEach(() => {
  disco = new Map();
  api = {
    readFile: vi.fn(async (p) => (disco.has(p) ? disco.get(p) : null)),
    saveFile: vi.fn(async (p, c) => {
      disco.set(p, c);
      return { success: true };
    }),
    searchBook: vi.fn(async () => [{ path: "a" }]),
    templates: { profiles: vi.fn(async () => [{ id: "assistant" }]), read: vi.fn(async () => null) },
  };
  window.electronAPI = api;
});
afterEach(() => {
  vi.restoreAllMocks();
  delete window.electronAPI;
});

describe("SearchService", () => {
  it("termo vazio ou sem livro não consulta o processo principal", async () => {
    const s = new SearchService();
    expect(await s.search("", "x")).toEqual([]);
    expect(await s.search("/b", "   ")).toEqual([]);
    expect(await s.search("/b", undefined)).toEqual([]);
    expect(api.searchBook).not.toHaveBeenCalled();
  });
  it("repassa livro e termo e devolve os resultados", async () => {
    expect(await new SearchService().search("/b", "ana")).toEqual([{ path: "a" }]);
    expect(api.searchBook).toHaveBeenCalledWith("/b", "ana");
  });
  it("erro ou resposta vazia viram lista vazia", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    api.searchBook.mockRejectedValue(new Error("x"));
    expect(await new SearchService().search("/b", "a")).toEqual([]);
    api.searchBook.mockResolvedValue(null);
    expect(await new SearchService().search("/b", "a")).toEqual([]);
  });
});

describe("indexService.addEntityToIndex", () => {
  const book = "C:\\livros\\book_1";
  const idx = "C:/livros/book_1/assets/characters/index.md";

  it("acrescenta o link da ficha ao índice da categoria e registra no changelog", async () => {
    disco.set(idx, "---\nt: 1\n---\n# Personagens\n");
    const changelog = { record: vi.fn() };
    const ok = await addEntityToIndex({ book, relPath: "assets/characters/ana.md", title: "Ana", changelog });
    expect(ok).toBe(true);
    expect(disco.get(idx)).toContain("- [Ana](assets/characters/ana.md)");
    expect(disco.get(idx).startsWith("---\nt: 1\n---\n")).toBe(true);
    expect(changelog.record).toHaveBeenCalledWith(expect.objectContaining({ action: "update", filePath: idx, bookPath: book, meta: { reason: "Ficha criada (Ana)" } }));
  });
  it("não altera quando o link já existe, o índice não existe ou o arquivo não é listado", async () => {
    disco.set(idx, "# P\n\n- [Ana](assets/characters/ana.md)\n");
    expect(await addEntityToIndex({ book, relPath: "assets/characters/ana.md", title: "Ana" })).toBe(false);
    expect(await addEntityToIndex({ book, relPath: "assets/places/p.md", title: "P" })).toBe(false);
    expect(await addEntityToIndex({ book, relPath: "notes/n.md", title: "N" })).toBe(false);
    expect(api.saveFile).not.toHaveBeenCalled();
  });
});

describe("indexService.removeFromIndexes", () => {
  const book = "C:/livros/book_1";
  it("remove as linhas dos arquivos excluídos de cada índice e conta os índices alterados", async () => {
    disco.set(`${book}/content/index.md`, "# C\n- [A](content/chapter_001)\n- [B](content/chapter_002/2_draft.md)\n");
    disco.set(`${book}/assets/characters/index.md`, "# P\n- [Ana](assets/characters/ana.md)\n- [Bia](assets/characters/bia.md)\n");
    const changelog = { record: vi.fn(), systemActor: () => ({ type: "system" }) };
    const n = await removeFromIndexes({ book, relPaths: ["assets/characters/ana.md", "content/chapter_002/2_draft.md", "notes/n.md"], changelog, reason: "Excluído" });
    expect(n).toBe(2);
    expect(disco.get(`${book}/assets/characters/index.md`)).not.toContain("Ana");
    expect(disco.get(`${book}/assets/characters/index.md`)).toContain("Bia");
    expect(disco.get(`${book}/content/index.md`)).not.toContain("2_draft");
    expect(disco.get(`${book}/content/index.md`)).toContain("chapter_001");
    expect(changelog.record).toHaveBeenCalledTimes(2);
    expect(changelog.record.mock.calls[0][0].meta).toEqual({ reason: "Excluído" });
  });
  it("sem índice no disco ou sem links correspondentes, nada muda", async () => {
    disco.set(`${book}/assets/places/index.md`, "# L\n- [X](assets/places/x.md)\n");
    expect(await removeFromIndexes({ book, relPaths: ["assets/places/outro.md", "assets/characters/ana.md"] })).toBe(0);
    expect(api.saveFile).not.toHaveBeenCalled();
  });
});

describe("templateService", () => {
  it("mergeTemplate mantém o frontmatter do arquivo e troca o corpo", () => {
    const r = mergeTemplate("---\nk: v\n---\ncorpo velho", "\n\n# Novo\ntexto");
    expect(r.startsWith("---\nk: v\n---")).toBe(true);
    expect(r).toContain("# Novo\ntexto\n");
    expect(r).not.toContain("corpo velho");
    expect(r.endsWith("\n")).toBe(true);
    expect(r.endsWith("\n\n")).toBe(false);
  });
  it("mergeTemplate sem frontmatter no arquivo usa só o corpo", () => {
    expect(mergeTemplate("", "corpo")).toBe("\ncorpo\n");
    expect(mergeTemplate(null, null)).toBe("\n\n");
  });
  it("profileForMode mapeia os modos da IA e cai no assistente", () => {
    const t = new TemplateService();
    expect(t.profileForMode("coauthor")).toBe("coauthor");
    expect(t.profileForMode("autonomous")).toBe("autonomous");
    expect(t.profileForMode("xyz")).toBe("assistant");
  });
  it("kinds expõe os tipos de template", () => {
    expect(new TemplateService().kinds.some((k) => k.id === "character")).toBe(true);
  });
  it("body devolve o corpo ou null", async () => {
    const t = new TemplateService();
    expect(await t.body("assistant", "character")).toBeNull();
    api.templates.read.mockResolvedValue({ body: "B" });
    expect(await t.body("assistant", "character")).toBe("B");
  });
  it("profileOfBook lê template_profile do config.json, com padrão assistente", async () => {
    const t = new TemplateService();
    disco.set("C:/b/config.json", JSON.stringify({ template_profile: "coauthor" }));
    expect(await t.profileOfBook("C:\\b")).toBe("coauthor");
    disco.set("C:/b/config.json", "{}");
    expect(await t.profileOfBook("C:/b")).toBe("assistant");
    disco.set("C:/b/config.json", "{quebrado");
    expect(await t.profileOfBook("C:/b")).toBe("assistant");
    expect(await t.profileOfBook("C:/sem-config")).toBe("assistant");
  });
  it("applyToBook troca o corpo dos templates existentes e conta só os que mudaram", async () => {
    const t = new TemplateService();
    api.templates.read.mockImplementation(async (_p, kind) => (kind === "event" ? null : { body: `corpo ${kind}` }));
    disco.set("C:/b/assets/characters/template.md", "---\nid: c\n---\nvelho");
    disco.set("C:/b/assets/places/template.md", "---\nid: p\n---\n\ncorpo place\n");
    disco.set("C:/b/assets/events/template.md", "---\nid: e\n---\nvelho");
    // elements não existe no livro
    const n = await t.applyToBook("C:\\b\\", "coauthor");
    expect(n).toBe(1);
    expect(disco.get("C:/b/assets/characters/template.md")).toContain("corpo character");
    expect(disco.get("C:/b/assets/characters/template.md").startsWith("---\nid: c\n---")).toBe(true);
    expect(disco.get("C:/b/assets/events/template.md")).toContain("velho");
    expect(disco.has("C:/b/assets/elements/template.md")).toBe(false);
  });
});
