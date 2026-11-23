import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SkillService, compareVersions, TRIGGERS, TRIGGER_GROUPS, FILE_TYPES } from "../../../../src/renderer/services/skillService";
import { appSettings } from "../../../../src/renderer/utils/appSettings";
import { builtinSkills, marketSkills, getSkill, setCustomSkills } from "../../../../src/renderer/ai/skills/index";

/** Disco falso das skills do usuário (arquivo -> conteúdo). */
let disco;
let api;

beforeEach(() => {
  disco = new Map();
  appSettings.set("skills.prefs", {});
  appSettings.set("skills.stats", {});
  api = {
    skills: {
      list: vi.fn(async () => [...disco].map(([file, content]) => ({ file, content }))),
      save: vi.fn(async (file, content) => {
        disco.set(file, content);
        return { success: true };
      }),
      delete: vi.fn(async (file) => {
        disco.delete(file);
        return { success: true };
      }),
    },
    listDir: vi.fn(async () => []),
    readFile: vi.fn(async () => null),
    deleteFile: vi.fn(async () => ({ success: true })),
    bookDiskStats: vi.fn(async () => ({ bytes: 3800 })),
  };
  window.electronAPI = api;
});
afterEach(() => {
  setCustomSkills([]);
  delete window.electronAPI;
});

async function novo(state = {}) {
  const s = new SkillService(state);
  await s.ready;
  return s;
}

describe("skillService.compareVersions", () => {
  it("compara versões numericamente por segmento", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
    expect(compareVersions("2", "1.9.9")).toBeGreaterThan(0);
  });
  it("tolera tamanhos diferentes, vazio e lixo", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0.1", "1.0.0")).toBeGreaterThan(0);
    expect(compareVersions(undefined, "0.0.1")).toBeLessThan(0);
    expect(compareVersions("abc", "0")).toBe(0);
  });
});

describe("skillService: gatilhos", () => {
  it("ids de gatilhos são únicos e TRIGGERS os indexa", () => {
    const ids = TRIGGER_GROUPS.flatMap((g) => g.triggers.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(TRIGGERS.size).toBe(ids.length);
    expect(TRIGGERS.get("sync").label).toMatch(/sincronizar/i);
  });
  it("há gatilhos de criação, atualização e exclusão para cada tipo de arquivo", () => {
    for (const t of FILE_TYPES) {
      for (const quando of ["created", "updated", "deleted"]) expect(TRIGGERS.has(`${quando}:${t.id}`), `${quando}:${t.id}`).toBe(true);
    }
  });
});

describe("skillService: biblioteca", () => {
  it("sem arquivos do usuário, instaladas = skills do app, ordenadas por título, com padrões", async () => {
    const s = await novo();
    const lista = s.installed();
    expect(lista.map((x) => x.slug).sort()).toEqual(builtinSkills().map((x) => x.slug).sort());
    const titulos = lista.map((x) => x.title);
    expect(titulos).toEqual([...titulos].sort((a, b) => a.localeCompare(b, "pt-BR")));
    expect(lista[0]).toMatchObject({ askBefore: true, enabled: true, removable: false, hasEditedCopy: false });
    expect(lista[0].color).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("load publica a biblioteca para a IA (getSkill enxerga as instaladas)", async () => {
    const s = await novo();
    const slug = s.installed()[0].slug;
    expect(getSkill(slug)).toBeTruthy();
  });
  it("preferências sobrepõem triggers, tools, enabled, askBefore, cor, compact e web", async () => {
    const s = await novo();
    const slug = builtinSkills()[0].slug;
    s.setPrefs(slug, { triggers: ["sync"], tools: ["read_file"], enabled: false, askBefore: false, color: "#123456", compact: false, web: true });
    expect(s.get(slug)).toMatchObject({ triggers: ["sync"], tools: ["read_file"], enabled: false, askBefore: false, color: "#123456", compact: false, web: true });
    s.setPrefs(slug, { enabled: true });
    expect(s.prefs(slug)).toMatchObject({ enabled: true, color: "#123456" });
  });
});

describe("skillService: criar, editar, restaurar e remover", () => {
  const dados = { slug: "revisar-dialogos", title: "Revisar diálogos", description: "Use ao revisar falas", body: "Passo 1", tags: ["x"] };

  it("save valida nome, descrição e instruções", async () => {
    const s = await novo();
    await expect(s.save({ ...dados, slug: "Ab" })).rejects.toThrow(/3 a 40/);
    await expect(s.save({ ...dados, slug: "com espaço" })).rejects.toThrow(/nome da skill/);
    await expect(s.save({ ...dados, description: "  " })).rejects.toThrow(/Descreva/);
    await expect(s.save({ ...dados, body: "" })).rejects.toThrow(/instruções/);
    expect(disco.size).toBe(0);
  });
  it("cria skill do usuário (arquivo u-<nome>.md, autor Você) e a lista como removível", async () => {
    const s = await novo();
    expect(await s.save(dados)).toBe("revisar-dialogos");
    expect([...disco.keys()]).toEqual(["u-revisar-dialogos.md"]);
    const criada = s.get("revisar-dialogos");
    expect(criada).toMatchObject({ origin: "user", author: "Você", version: "1.0.0", kind: "once", removable: true, body: "Passo 1", tags: ["x"] });
  });
  it("não deixa criar com nome já usado (inclusive de skill do app)", async () => {
    const s = await novo();
    await s.save(dados);
    await expect(s.save(dados)).rejects.toThrow(/Já existe/);
    await expect(s.save({ ...dados, slug: builtinSkills()[0].slug })).rejects.toThrow(/Já existe/);
  });
  it("editar skill própria regrava o mesmo arquivo", async () => {
    const s = await novo();
    await s.save(dados);
    await s.save({ ...dados, body: "Passo novo", kind: "recurring" }, { slug: "revisar-dialogos" });
    expect(disco.size).toBe(1);
    expect(s.get("revisar-dialogos")).toMatchObject({ body: "Passo novo", kind: "recurring", origin: "user" });
  });
  it("editar o texto de skill do app cria cópia 'editada', e restore a descarta", async () => {
    const s = await novo();
    const base = builtinSkills()[0];
    await s.save({ slug: base.slug, title: base.title, description: base.description, body: "Texto meu" }, { slug: base.slug });
    const arquivos = [...disco.keys()];
    expect(arquivos).toHaveLength(1);
    expect(arquivos[0]).toMatch(new RegExp(`^e-${base.slug}-`));
    const editada = s.get(base.slug);
    expect(editada).toMatchObject({ body: "Texto meu", edited: true, hasEditedCopy: true, sourceSlug: base.slug });
    expect(editada.original.body).toBe(base.body);
    // salvar de novo reaproveita a mesma cópia
    await s.save({ slug: base.slug, description: base.description, body: "Texto meu 2" }, { slug: base.slug });
    expect(disco.size).toBe(1);
    await s.restore(base.slug);
    expect(disco.size).toBe(0);
    expect(s.get(base.slug).body).toBe(base.body);
  });
  it("editar slug inexistente falha", async () => {
    const s = await novo();
    await expect(s.save(dados, { slug: "nao-existe" })).rejects.toThrow(/não encontrada/);
  });
  it("remove skill do usuário; as do app continuam instaladas", async () => {
    const s = await novo();
    await s.save(dados);
    await s.remove("revisar-dialogos");
    expect(s.get("revisar-dialogos")).toBeUndefined();
    await s.remove(builtinSkills()[0].slug);
    expect(s.get(builtinSkills()[0].slug)).toBeTruthy();
  });
  it("falha de gravação vira erro", async () => {
    const s = await novo();
    api.skills.save.mockResolvedValueOnce({ success: false, error: "disco cheio" });
    await expect(s.save(dados)).rejects.toThrow("disco cheio");
  });
});

describe("skillService: catálogo", () => {
  it("market lista o catálogo com estado de instalação; install grava m-<slug>.md", async () => {
    const s = await novo();
    const item = marketSkills()[0];
    expect(s.market().find((m) => m.slug === item.slug).installed).toBe(false);
    await s.install(item.slug);
    expect(disco.has(`m-${item.slug}.md`)).toBe(true);
    expect(s.market().find((m) => m.slug === item.slug)).toMatchObject({ installed: true, hasUpdate: false });
    expect(s.get(item.slug)).toMatchObject({ origin: "market", removable: true });
  });
  it("install de skill inexistente falha", async () => {
    const s = await novo();
    await expect(s.install("nao-existe")).rejects.toThrow(/catálogo/);
  });
  it("detecta atualização quando a versão do catálogo é maior que a instalada", async () => {
    const item = marketSkills()[0];
    disco.set(`m-${item.slug}.md`, `---\nid: m-${item.slug}\nname: ${item.slug}\ntitle: T\ndescription: d\nversion: 0.0.1\norigin: market\n---\ncorpo`);
    const s = await novo();
    expect(s.market().find((m) => m.slug === item.slug).hasUpdate).toBe(true);
    await s.update(item.slug);
    expect(s.market().find((m) => m.slug === item.slug).hasUpdate).toBe(false);
  });
});

describe("skillService: migração de skills do livro", () => {
  it("move .system/skills do livro aberto para a biblioteca e apaga a cópia do livro", async () => {
    api.listDir.mockResolvedValue([{ name: "minha.md", isDirectory: false }, { name: "pasta", isDirectory: true }, { name: "x.txt", isDirectory: false }]);
    api.readFile.mockResolvedValue("---\nname: minha-skill\ntitle: Minha\ndescription: d\n---\ncorpo da skill");
    const s = await novo({ currentBookPath: "C:\\livros\\book_1\\" });
    expect(api.listDir).toHaveBeenCalledWith("C:/livros/book_1/.system/skills");
    expect(api.readFile).toHaveBeenCalledTimes(1);
    expect(api.deleteFile).toHaveBeenCalledWith("C:/livros/book_1/.system/skills/minha.md");
    expect(disco.has("u-minha-skill.md")).toBe(true);
    expect(disco.get("u-minha-skill.md")).toContain("author: Você");
  });
  // Regressão (bug já corrigido; skillService.ts, load): migrateBookSkills grava os arquivos novos, mas this.files não é recarregado depois;
  // a skill migrada só aparece na próxima load(). Esperado: já aparecer em installed()/get() ao fim do primeiro load.
  it("skill migrada já aparece na biblioteca logo após o load", async () => {
    api.listDir.mockResolvedValue([{ name: "minha.md", isDirectory: false }]);
    api.readFile.mockResolvedValue("---\nname: minha-skill\ntitle: Minha\ndescription: d\n---\ncorpo da skill");
    const s = await novo({ currentBookPath: "/b" });
    expect(s.get("minha-skill")).toBeTruthy();
  });
  it("não migra se já existe skill com o mesmo nome", async () => {
    api.listDir.mockResolvedValue([{ name: "dup.md", isDirectory: false }]);
    api.readFile.mockResolvedValue(`---\nname: ${builtinSkills()[0].slug}\ndescription: d\n---\ncorpo`);
    await novo({ currentBookPath: "/b" });
    expect(api.deleteFile).not.toHaveBeenCalled();
    expect(disco.size).toBe(0);
  });
  it("sem livro aberto não procura nada", async () => {
    await novo({});
    expect(api.listDir).not.toHaveBeenCalled();
  });
});

describe("skillService: estatísticas e estimativas", () => {
  it("recordRun guarda execuções (mais recentes primeiro) e soma os tokens", async () => {
    const s = await novo();
    s.recordRun("a", { ok: true, tokens: 100, trigger: "manual", bookTokens: 1000 });
    s.recordRun("a", { ok: false, tokens: 50, trigger: "sync", bookTokens: 1000, error: "x" });
    s.recordRun("b", { ok: true, tokens: 7, trigger: "manual", bookTokens: 10 });
    expect(s.runs("a").map((r) => r.tokens)).toEqual([50, 100]);
    expect(s.totalTokens("a")).toBe(150);
    expect(s.totalTokens()).toBe(157);
    expect(s.totalTokens("zzz")).toBe(0);
    expect(s.runs("zzz")).toEqual([]);
  });
  it("recordRun mantém só as últimas 100 execuções", async () => {
    const s = await novo();
    for (let i = 0; i < 120; i++) s.recordRun("a", { ok: true, tokens: i, trigger: "m", bookTokens: 1 });
    expect(s.runs("a")).toHaveLength(100);
    expect(s.runs("a")[0].tokens).toBe(119);
  });
  it("estimate: média das execuções bem-sucedidas > teste do autor > nada", async () => {
    const s = await novo();
    const skill = { slug: "a", tokens: { bookTokens: 1000, spent: 500 } };
    expect(s.estimate(skill, 2000)).toEqual({ tokens: 1000, basis: "o teste do autor" });
    s.recordRun("a", { ok: true, tokens: 100, trigger: "m", bookTokens: 1000 });
    s.recordRun("a", { ok: true, tokens: 300, trigger: "m", bookTokens: 1000 });
    s.recordRun("a", { ok: false, tokens: 9999, trigger: "m", bookTokens: 1000 });
    expect(s.estimate(skill, 10000)).toEqual({ tokens: 2000, basis: "suas execuções" });
    expect(s.estimate({ slug: "outra" }, 500)).toEqual({ tokens: 0, basis: null });
  });
  it("bookTokens estima bytes/3,8 e é zero sem livro", async () => {
    expect(await (await novo({ currentBookPath: "C:\\b" })).bookTokens()).toBe(1000);
    expect(api.bookDiskStats).toHaveBeenCalledWith("C:/b");
    expect(await (await novo({})).bookTokens()).toBe(0);
  });
  it("askAlways: obrigatório nos perfis mínimo e econômico", async () => {
    expect((await novo({ aiSettings: { analysis: { profile: "minimal" } } })).askAlways()).toEqual({ value: true, forced: true });
    expect((await novo({ aiSettings: { analysis: { profile: "economic" } } })).askAlways().forced).toBe(true);
    const livre = await novo({ aiSettings: { analysis: { profile: "balanced" } } });
    expect(livre.askAlways()).toEqual({ value: false, forced: false });
    appSettings.set("skills.askAlways", true);
    expect(livre.askAlways()).toEqual({ value: true, forced: false });
    appSettings.set("skills.askAlways", false);
  });
});
