// @vitest-environment node
/**
 * Integração: handlers IPC do processo principal com disco real (pasta temporária via ASTRA_DATA_DIR).
 * Só o módulo "electron" é dublê; todo o resto (ipc-handlers, changelog, busca, export, importação...) é o real.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-ipc-"));
const userData = path.join(dataDir, "userData");
process.env.ASTRA_DATA_DIR = dataDir;

const dialogMock = { showOpenDialog: vi.fn(), showSaveDialog: vi.fn(), showMessageBox: vi.fn() };
globalThis.__userData = userData;
globalThis.__dialog = dialogMock;
globalThis.__ipcHandlers = {};

vi.mock("electron", async () => {
  const { createElectronMock } = await import("../helpers/electronMock.js");
  const { vi: v } = await import("vitest");
  const handlers = globalThis.__ipcHandlers;
  return createElectronMock({
    app: {
      isPackaged: false,
      getPath: v.fn(() => globalThis.__userData),
      getVersion: v.fn(() => "9.9.9"),
      getName: v.fn(() => "Astra Writer"),
      quit: v.fn(),
      on: v.fn(),
    },
    ipcMain: { on: v.fn(), handle: v.fn((ch, fn) => { handlers[ch] = fn; }) },
    dialog: globalThis.__dialog,
  });
});

let invoke;
let booksRoot;

beforeAll(async () => {
  const { setupIpcHandlers } = await import("../../src/main/ipc-handlers");
  setupIpcHandlers(null);
  invoke = (ch, ...args) => globalThis.__ipcHandlers[ch]({}, ...args);
  booksRoot = path.join(dataDir, "books");
  fs.mkdirSync(booksRoot, { recursive: true });
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const w = (p, c) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, c, "utf8");
};

/** Cria um livro mínimo e devolve o caminho. */
function makeBook(name = "book_001") {
  const b = path.join(booksRoot, name);
  w(path.join(b, "config.json"), JSON.stringify({ book_title: "Livro Teste", ai_lock: false }));
  w(path.join(b, "content", "chapter_001", "folder.yml"), "title: Cap 1\naiWrite: false\nhumanRead: true\n");
  w(path.join(b, "content", "chapter_001", "1_outline.md"), "---\ntitle: Esboço\n---\nO dragão dorme na montanha.\n");
  w(path.join(b, "content", "chapter_001", "2_chapter.md"), "---\ntitle: Texto\naiWrite: true\n---\nTexto oficial do capítulo.\n");
  w(path.join(b, "assets", "characters", "ana.md"), "---\ntitle: Ana\ntags: [heroina]\ndata:\n  idade:\n    content: vinte e três\n---\nGuerreira.\n");
  w(path.join(b, "notes", "template.md"), "---\ntitle: Modelo\n---\nsegredoUnico\n");
  return b;
}

describe("IPC: caminhos e listagens", () => {
  it("get-paths respeita ASTRA_DATA_DIR e get-app-version vem do app", async () => {
    const p = await invoke("get-paths");
    expect(p.booksDir).toBe(booksRoot);
    expect(p.backupsDir).toBe(path.join(dataDir, "backups"));
    expect(await invoke("get-app-version")).toBe("9.9.9");
  });

  it("get-books-list lê o config.json de cada livro", async () => {
    makeBook("book_010");
    const list = await invoke("get-books-list");
    const b = list.find((x) => x.folderName === "book_010");
    expect(b.book_title).toBe("Livro Teste");
    expect(b.fullPath).toBe(path.join(booksRoot, "book_010"));
  });
});

describe("IPC: get-tree com rascunhos e permissões herdadas", () => {
  it("monta a árvore, herda permissões da pasta e prioriza .md.temp", async () => {
    const b = makeBook("book_020");
    w(path.join(b, "content", "chapter_001", "1_outline.md.temp"), "---\ntitle: Esboço rascunho\n---\nNovo texto.\n");
    const tree = await invoke("get-tree", b);
    const ch = tree.folders.content.folders.chapter_001;
    expect(ch.metadata.aiWrite).toBe(false);
    // arquivo sem flag herda da pasta; arquivo com flag própria prevalece
    expect(ch.files["1_outline"].metadata.aiWrite).toBe(false);
    expect(ch.files["1_outline"].metadata.humanRead).toBe(true);
    expect(ch.files["2_chapter"].metadata.aiWrite).toBe(true);
    // rascunho tem prioridade
    expect(ch.files["1_outline"].isTemp).toBe(true);
    expect(ch.files["1_outline"].path.endsWith("1_outline.md.temp")).toBe(true);
    expect(ch.files["1_outline"].originalPath.endsWith("1_outline.md")).toBe(true);
    expect(ch.files["1_outline"].metadata.title).toBe("Esboço rascunho");
    expect(ch.files["2_chapter"].isTemp).toBe(false);
  });

  it("rascunho sem oficial (.md.temp isolado) também aparece, e caminho inexistente devolve null", async () => {
    const b = makeBook("book_021");
    w(path.join(b, "content", "chapter_002", "1_outline.md.temp"), "---\ntitle: Novo\n---\nx\n");
    const tree = await invoke("get-tree", b);
    const f = tree.folders.content.folders.chapter_002.files["1_outline"];
    expect(f.isTemp).toBe(true);
    expect(await invoke("get-tree", path.join(booksRoot, "nao-existe"))).toBeNull();
    expect(await invoke("get-tree", "")).toBeNull();
  });
});

describe("IPC: arquivos (salvar, ler, renomear, copiar, excluir, rascunho)", () => {
  it("save-file cria pastas pai; read-file lê; read-file de inexistente devolve null", async () => {
    const f = path.join(booksRoot, "book_030", "content", "a", "b.md");
    expect((await invoke("save-file", f, "olá")).success).toBe(true);
    expect(await invoke("read-file", f)).toBe("olá");
    expect(await invoke("read-file", f + ".x")).toBeNull();
    expect(await invoke("read-file", "")).toBeNull();
  });

  it("fluxo de rascunho: grava .md.temp, get-tree aponta para ele, apagar o .temp volta ao oficial", async () => {
    const b = makeBook("book_031");
    const official = path.join(b, "content", "chapter_001", "2_chapter.md");
    await invoke("save-file", official + ".temp", "---\ntitle: Texto\n---\nRascunho.\n");
    let t = await invoke("get-tree", b);
    expect(t.folders.content.folders.chapter_001.files["2_chapter"].isTemp).toBe(true);
    // o oficial permanece intacto
    expect(await invoke("read-file", official)).toContain("Texto oficial");
    expect((await invoke("delete-file", official + ".temp")).success).toBe(true);
    t = await invoke("get-tree", b);
    expect(t.folders.content.folders.chapter_001.files["2_chapter"].isTemp).toBe(false);
  });

  it("delete-file avisa quando o arquivo não existe", async () => {
    const r = await invoke("delete-file", path.join(booksRoot, "nada.md"));
    expect(r.success).toBe(false);
    expect((await invoke("delete-file", "")).success).toBe(false);
  });

  it("rename-path renomeia e nunca sobrescreve o destino", async () => {
    const b = makeBook("book_032");
    const a = path.join(b, "notes", "x.md");
    const c = path.join(b, "notes", "y.md");
    w(a, "x");
    w(c, "y");
    const bad = await invoke("rename-path", a, c);
    expect(bad.success).toBe(false);
    expect(fs.readFileSync(c, "utf8")).toBe("y");
    const ok = await invoke("rename-path", a, path.join(b, "notes", "z.md"));
    expect(ok.success).toBe(true);
    expect(fs.existsSync(a)).toBe(false);
    expect((await invoke("rename-path", a, path.join(b, "q.md"))).success).toBe(false);
    expect((await invoke("rename-path", "", "")).success).toBe(false);
  });

  it("copy-folder clona recursivamente e recusa destino existente; delete-folder apaga tudo", async () => {
    const b = makeBook("book_033");
    const dest = path.join(booksRoot, "book_033_copia");
    expect((await invoke("copy-folder", b, dest)).success).toBe(true);
    expect(fs.existsSync(path.join(dest, "assets", "characters", "ana.md"))).toBe(true);
    expect((await invoke("copy-folder", b, dest)).success).toBe(false);
    expect((await invoke("delete-folder", dest)).success).toBe(true);
    expect(fs.existsSync(dest)).toBe(false);
    expect((await invoke("delete-folder", dest)).success).toBe(false);
  });

  it("list-dir devolve nome e isDirectory; inexistente devolve []", async () => {
    const b = makeBook("book_034");
    const l = await invoke("list-dir", b);
    expect(l).toContainEqual({ name: "content", isDirectory: true });
    expect(l).toContainEqual({ name: "config.json", isDirectory: false });
    expect(await invoke("list-dir", path.join(b, "xx"))).toEqual([]);
  });
});

describe("IPC: busca no livro", () => {
  it("acha por título, conteúdo, variável e tag; ignora template.md e .system; rascunho vale mais que o oficial", async () => {
    const b = makeBook("book_040");
    w(path.join(b, ".system", "oculto.md"), "dragão escondido");
    const porConteudo = await invoke("search-book", b, "dragão");
    expect(porConteudo.map((r) => r.relativePath)).toContain("content/chapter_001/1_outline.md");
    expect(porConteudo.some((r) => r.relativePath.includes(".system"))).toBe(false);
    expect((await invoke("search-book", b, "segredoUnico")).length).toBe(0); // template.md fora
    expect((await invoke("search-book", b, "vinte e três"))[0].title).toBe("Ana"); // variável
    expect((await invoke("search-book", b, "#heroina"))[0].matchType).toBe("tag");
    expect((await invoke("search-book", b, "Ana"))[0].matchType).toBe("title");
    // com rascunho, busca o texto do rascunho
    w(path.join(b, "content", "chapter_001", "1_outline.md.temp"), "---\ntitle: Esboço\n---\nfênix voando\n");
    expect((await invoke("search-book", b, "fenix")).length).toBe(1); // tolerante a acento
    expect((await invoke("search-book", b, "dragão")).length).toBe(0);
  });

  it("vários termos separados por vírgula: casa com qualquer; termo vazio devolve []", async () => {
    const b = makeBook("book_041");
    const r = await invoke("search-book", b, "dragão, guerreira");
    expect(r.length).toBe(2);
    expect(await invoke("search-book", b, "  ")).toEqual([]);
  });

  // Regressão (bug já corrigido): src/main/ipc-handlers.ts (search-book): path.normalize("") vira "." e a busca varre a pasta de trabalho do app.
  // Esperado: [] quando o livro não é informado.
  it("search-book sem caminho do livro devolve [] (não varre o diretório atual)", async () => {
    expect(await invoke("search-book", "", "Astra Writer")).toEqual([]);
    // varre o projeto: o termo abaixo existe neste próprio arquivo de teste
  });
});

describe("IPC: changelog do livro", () => {
  it("registra criação/alteração, histórico do arquivo, prévia e restauração", async () => {
    const b = makeBook("book_050");
    const f = path.join(b, "notes", "diario.md");
    w(f, "v1");
    const c1 = await invoke("changelog-record", b, { actor: { type: "user" }, action: "create", filePath: f, before: null, after: "v1" });
    expect(c1.success).toBe(true);
    w(f, "v2");
    const c2 = await invoke("changelog-record", b, { actor: { type: "ai", provider: "mock" }, action: "update", filePath: f, before: "v1", after: "v2" });
    expect(c2.entry.meta.added).toBeGreaterThan(0);
    // sem mudança: nada é registrado
    const nada = await invoke("changelog-record", b, { actor: { type: "user" }, action: "update", filePath: f, before: "v2", after: "v2" });
    expect(nada.entry).toBeNull();

    const hist = await invoke("changelog-file-history", b, "notes/diario.md");
    expect(hist.entries.length).toBeGreaterThanOrEqual(2);
    const page = await invoke("changelog-page", b, null);
    expect(page.entries[0].id).toBeGreaterThan(page.entries[page.entries.length - 1].id); // mais recente primeiro

    const prev = await invoke("changelog-preview", b, f, c1.entry.id);
    expect(prev.success).toBe(true);
    const rest = await invoke("changelog-restore", b, f, c1.entry.id, { type: "user" });
    expect(rest.success).toBe(true);
    expect(fs.readFileSync(f, "utf8")).toBe("v1");
  });

  it("arquivo fora do livro ou em pasta oculta não é registrado", async () => {
    const b = makeBook("book_051");
    const r = await invoke("changelog-record", b, { actor: { type: "user" }, action: "create", filePath: path.join(b, ".system", "x.md"), before: null, after: "x" });
    expect(r.entry).toBeNull();
  });

  it("autosave: uma sessão = um único registro com 'saves' incrementado", async () => {
    const b = makeBook("book_052");
    const f = path.join(b, "notes", "auto.md");
    const p = { sessionId: "sess-1", filePath: f, before: "a", actor: { type: "user" } };
    const e1 = await invoke("changelog-autosave", b, { ...p, after: "ab" });
    const e2 = await invoke("changelog-autosave", b, { ...p, after: "abc" });
    expect(e1.entry.id).toBe(e2.entry.id);
    expect(e2.entry.meta.saves).toBe(2);
  });
});

describe("IPC: varredura do livro (scan-book) e estatísticas", () => {
  it("devolve só o que mudou (hash), usa o rascunho e ignora pastas ocultas", async () => {
    const b = makeBook("book_060");
    w(path.join(b, ".system", "x.md"), "oculto");
    const first = await invoke("scan-book", b, {});
    expect(first.every((f) => f.changed && f.content !== null)).toBe(true);
    expect(first.some((f) => f.rel.startsWith(".system"))).toBe(false);
    const known = Object.fromEntries(first.map((f) => [f.rel, f.hash]));
    const second = await invoke("scan-book", b, known);
    expect(second.every((f) => !f.changed && f.content === null)).toBe(true);
    // rascunho novo muda o hash do arquivo
    w(path.join(b, "content", "chapter_001", "2_chapter.md.temp"), "rascunho novo");
    const third = await invoke("scan-book", b, known);
    const ch = third.find((f) => f.rel === "content/chapter_001/2_chapter.md");
    expect(ch.changed).toBe(true);
    expect(ch.isTemp).toBe(true);
    expect(ch.content).toBe("rascunho novo");
    // 'only' restringe a leitura
    const onlyOne = await invoke("scan-book", b, {}, ["content/chapter_001/2_chapter.md"]);
    expect(onlyOne.filter((f) => f.content !== null).length).toBe(1);
  });

  it("rascunho sem oficial é marcado como isNew; book-disk-stats separa changelog", async () => {
    const b = makeBook("book_061");
    w(path.join(b, "notes", "novo.md.temp"), "x");
    const r = await invoke("scan-book", b, {});
    expect(r.find((f) => f.rel === "notes/novo.md").isNew).toBe(true);
    await invoke("changelog-record", b, { actor: { type: "user" }, action: "create", filePath: path.join(b, "notes", "novo.md"), before: null, after: "x" });
    const s = await invoke("book-disk-stats", b);
    expect(s.changelogFiles).toBeGreaterThan(0);
    expect(s.files).toBeGreaterThan(3);
  });
});

describe("IPC: log de erros da IA", () => {
  it("grava, lê do mais recente ao mais antigo, trunca campos grandes e limpa", async () => {
    await invoke("ai-log-clear");
    await invoke("ai-log-error", { provider: "gemini", message: "erro 1", status: 429 });
    await invoke("ai-log-error", { provider: "openai", message: "x".repeat(5000) });
    const log = await invoke("ai-log-read");
    expect(log.length).toBe(2);
    expect(log[0].provider).toBe("openai");
    expect(log[0].message.endsWith("[truncado]")).toBe(true);
    expect(log[1].status).toBe(429);
    await invoke("ai-log-clear");
    expect(await invoke("ai-log-read")).toEqual([]);
  });
});

describe("IPC: configurações de IA", () => {
  it("save-ai-settings/get-ai-settings fazem ida e volta; sem arquivo é null", async () => {
    fs.rmSync(path.join(userData, "ai-settings.json"), { force: true });
    expect(await invoke("get-ai-settings")).toBeNull();
    await invoke("save-ai-settings", { activeAccount: "mock", x: 1 });
    expect(await invoke("get-ai-settings")).toEqual({ activeAccount: "mock", x: 1 });
  });
});

describe("IPC: skills do usuário", () => {
  it("salva, lista, apaga e recusa nomes inseguros", async () => {
    expect((await invoke("skills-save", "revisar.md", "---\nname: Revisar\n---\nCorpo")).success).toBe(true);
    expect((await invoke("skills-list")).map((s) => s.file)).toContain("revisar.md");
    expect((await invoke("skills-save", "../fuga.md", "x")).success).toBe(false);
    expect((await invoke("skills-save", "sem-extensao", "x")).success).toBe(false);
    expect(fs.existsSync(path.join(userData, "fuga.md"))).toBe(false);
    expect((await invoke("skills-delete", "revisar.md")).success).toBe(true);
    expect((await invoke("skills-list")).map((s) => s.file)).not.toContain("revisar.md");
  });
});

describe("IPC: templates (perfis)", () => {
  it("lê original, salva edição, restaura e gerencia perfis do usuário", async () => {
    const profiles = await invoke("templates-profiles");
    expect(profiles.map((p) => p.id)).toEqual(expect.arrayContaining(["assistant", "coauthor", "autonomous"]));
    const original = await invoke("templates-original", "assistant", "character");
    expect(typeof original).toBe("string");
    expect((await invoke("templates-read", "assistant", "character")).edited).toBe(false);
    await invoke("templates-save", "assistant", "character", "# minha ficha");
    const r = await invoke("templates-read", "assistant", "character");
    expect(r).toEqual({ body: "# minha ficha", edited: true });
    expect(await invoke("templates-original", "assistant", "character")).toBe(original); // original intacto
    await invoke("templates-restore", "assistant", "character");
    expect((await invoke("templates-read", "assistant", "character")).body).toBe(original);

    const c = await invoke("templates-create-profile", { name: "Meu perfil", from: "coauthor" });
    expect(c.success).toBe(true);
    expect((await invoke("templates-read", c.id, "place")).body).toBeTruthy();
    expect((await invoke("templates-rename-profile", c.id, "Outro")).success).toBe(true);
    expect((await invoke("templates-profiles")).find((p) => p.id === c.id).label).toBe("Outro");
    expect((await invoke("templates-delete-profile", "assistant")).success).toBe(false); // do app não apaga
    expect((await invoke("templates-delete-profile", c.id)).success).toBe(true);
    expect((await invoke("templates-save", "inexistente", "character", "x")).success).toBe(false);
    expect((await invoke("templates-create-profile", { name: "", from: "assistant" })).success).toBe(false);
  });
});

describe("IPC: exportar", () => {
  beforeEach(() => dialogMock.showSaveDialog.mockReset());

  it("export-file grava Markdown no destino escolhido e acrescenta a extensão", async () => {
    const out = path.join(dataDir, "saida", "capitulo");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    dialogMock.showSaveDialog.mockResolvedValue({ canceled: false, filePath: out });
    const r = await invoke("export-file", { format: "md", title: "Cap", markdown: "# Cap\n\ntexto", html: "<h1>Cap</h1>" });
    expect(r.path).toBe(out + ".md");
    expect(fs.readFileSync(out + ".md", "utf8")).toBe("# Cap\n\ntexto");
    expect((await invoke("export-file", { format: "xyz" })).success).toBe(false);
    dialogMock.showSaveDialog.mockResolvedValue({ canceled: true });
    expect((await invoke("export-file", { format: "md", title: "x", markdown: "", html: "" })).canceled).toBe(true);
  });

  it("export-book 'project' gera zip sem .system nem rascunhos; 'single' junta capítulos; 'chapters' numera", async () => {
    const JSZip = require("jszip");
    const b = makeBook("book_070");
    w(path.join(b, ".system", "changelog", "x.json"), "{}");
    w(path.join(b, "content", "chapter_001", "2_chapter.md.temp"), "rascunho");
    const zipOut = path.join(dataDir, "proj.zip");
    dialogMock.showSaveDialog.mockResolvedValue({ canceled: false, filePath: zipOut });
    const r = await invoke("export-book", { kind: "project", title: "Meu Livro", bookPath: b });
    expect(r.success).toBe(true);
    const zip = await JSZip.loadAsync(fs.readFileSync(zipOut));
    const names = Object.keys(zip.files);
    expect(names.some((n) => n.includes(".system"))).toBe(false);
    expect(names.some((n) => n.endsWith(".temp"))).toBe(false);
    expect(names).toContain("Meu Livro/config.json");

    const chapters = [{ title: "Um", markdown: "# Um\n\na", html: "<p>a</p>" }, { title: "Dois", markdown: "# Dois\n\nb", html: "<p>b</p>" }];
    const single = path.join(dataDir, "livro.md");
    dialogMock.showSaveDialog.mockResolvedValue({ canceled: false, filePath: single });
    const rs = await invoke("export-book", { kind: "single", format: "md", title: "Meu Livro", chapters });
    expect(rs.count).toBe(2);
    const txt = fs.readFileSync(single, "utf8");
    expect(txt.startsWith("# Meu Livro")).toBe(true);
    expect(txt).toContain("---");

    const cz = path.join(dataDir, "caps.zip");
    dialogMock.showSaveDialog.mockResolvedValue({ canceled: false, filePath: cz });
    await invoke("export-book", { kind: "chapters", format: "md", title: "Meu Livro", chapters });
    const z2 = await JSZip.loadAsync(fs.readFileSync(cz));
    expect(Object.keys(z2.files).sort()).toEqual(["01 - Um.md", "02 - Dois.md"]);

    expect((await invoke("export-book", { kind: "chapters", title: "x", chapters: [] })).success).toBe(false);
    expect((await invoke("export-book", { kind: "bogus", title: "x" })).success).toBe(false);
    expect((await invoke("export-book", { kind: "project", title: "x", bookPath: "/nada" })).success).toBe(false);
  });

  it("round-trip: exporta o projeto e importa de volta como novo livro (sem .system, título marcado como importado)", async () => {
    const b = makeBook("book_071");
    w(path.join(b, ".system", "changelog", "x.json"), "{}");
    const zipOut = path.join(dataDir, "rt.zip");
    dialogMock.showSaveDialog.mockResolvedValue({ canceled: false, filePath: zipOut });
    await invoke("export-book", { kind: "project", title: "Livro Teste", bookPath: b });
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [zipOut] });
    const r = await invoke("import-book");
    expect(r.success).toBe(true);
    expect(r.title).toBe("Livro Teste (importado)");
    expect(fs.existsSync(path.join(r.bookPath, "content", "chapter_001", "2_chapter.md"))).toBe(true);
    expect(fs.existsSync(path.join(r.bookPath, ".system"))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(r.bookPath, "config.json"), "utf8")).book_title).toBe("Livro Teste (importado)");
    expect(/^book_\d{3}$/.test(r.folderName)).toBe(true);
  });
});

describe("IPC: importar livro (zip) com segurança", () => {
  const zipWith = async (files, name) => {
    const JSZip = require("jszip");
    const z = new JSZip();
    for (const [k, v] of Object.entries(files)) z.file(k, v);
    const f = path.join(dataDir, name);
    fs.writeFileSync(f, await z.generateAsync({ type: "nodebuffer" }));
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [f] });
  };

  it("recusa zip sem config.json, zip inválido e config inválido; cancelar é tratado", async () => {
    await zipWith({ "content/a.md": "x" }, "semconfig.zip");
    expect((await invoke("import-book")).error).toMatch(/config\.json/);
    const bad = path.join(dataDir, "lixo.zip");
    fs.writeFileSync(bad, "isso não é zip");
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [bad] });
    expect((await invoke("import-book")).success).toBe(false);
    await zipWith({ "config.json": "{{", "content/a.md": "x" }, "cfgruim.zip");
    expect((await invoke("import-book")).error).toMatch(/inválido/);
    await zipWith({ "config.json": "{}" }, "semestrutura.zip");
    expect((await invoke("import-book")).error).toMatch(/estrutura/);
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    expect((await invoke("import-book")).canceled).toBe(true);
  });

  it("recusa 'zip slip' sem deixar arquivo fora da pasta do livro", async () => {
    await zipWith({ "config.json": "{}", "content/a.md": "x", "content/../../fuga.md": "pwn" }, "slip.zip");
    await invoke("import-book");
    expect(fs.existsSync(path.join(dataDir, "fuga.md"))).toBe(false);
    expect(fs.existsSync(path.join(booksRoot, "fuga.md"))).toBe(false);
  });

  it("importa zip com pasta única na raiz e ignora .system e .temp", async () => {
    await zipWith({
      "MeuLivro/config.json": JSON.stringify({ book_title: "Zip Raiz", explorer_state: { open_file: "C:/outro/pc.md", open_folders: ["a"] } }),
      "MeuLivro/content/chapter_001/1.md": "oi",
      "MeuLivro/content/chapter_001/1.md.temp": "rascunho",
      "MeuLivro/.system/log.json": "{}",
    }, "pasta.zip");
    const r = await invoke("import-book");
    expect(r.success).toBe(true);
    expect(r.files).toBe(2); // config + 1.md
    const cfg = JSON.parse(fs.readFileSync(path.join(r.bookPath, "config.json"), "utf8"));
    expect(cfg.explorer_state.open_file).toBeNull();
    expect(cfg.explorer_state.open_folders).toEqual([]);
    expect(fs.existsSync(path.join(r.bookPath, "content", "chapter_001", "1.md.temp"))).toBe(false);
  });
});

describe("IPC: importar livro por arquivo (txt, md, docx)", () => {
  const pick = (f) => dialogMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [f] });

  it("txt: separa os capítulos pelos títulos 'Capítulo N' e usa o título do início", async () => {
    const f = path.join(dataDir, "meu_romance.txt");
    fs.writeFileSync(f, "A TRAVESSIA\n\nCapítulo 1\n\nPrimeira cena aqui,\nContinua na linha seguinte\n\nCapítulo 2\n\nSegunda cena.\n");
    pick(f);
    const r = await invoke("extract-book-file");
    expect(r.success).toBe(true);
    expect(r.format).toBe("txt");
    expect(r.title).toBe("A TRAVESSIA");
    expect(r.chapters.map((c) => c.title)).toEqual(["Capítulo 1", "Capítulo 2"]);
    expect(r.chapters[0].text).toContain("Primeira cena aqui, Continua na linha seguinte");
    expect(r.chapters[1].words).toBe(2);
  });

  it("md: usa o nível de título que se repete; sem capítulos gera aviso e usa o nome do arquivo", async () => {
    const f = path.join(dataDir, "livro-md.md");
    fs.writeFileSync(f, "# Ato Um\n\ntexto a\n\n# Ato Dois\n\ntexto b\n");
    pick(f);
    const r = await invoke("extract-book-file");
    expect(r.chapters.map((c) => c.title)).toEqual(["Ato Um", "Ato Dois"]);

    const g = path.join(dataDir, "so_texto.txt");
    fs.writeFileSync(g, ["Um parágrafo qualquer sem título.", "Outro parágrafo.", "Mais um parágrafo.", "E o quarto parágrafo."].join("\n\n"));
    pick(g);
    const r2 = await invoke("extract-book-file");
    expect(r2.chapters.length).toBe(1);
    expect(r2.title).toBe("so texto");
  });

  // Regressão (bug já corrigido): o aviso "Não encontrei títulos de capítulo" era checado depois de o texto sem capítulos
  // virar "Capítulo 1" e nunca aparecia.
  it("texto sem títulos de capítulo gera o aviso prometido", async () => {
    const g = path.join(dataDir, "sem_titulos.txt");
    fs.writeFileSync(g, ["Um parágrafo qualquer sem título.", "Outro parágrafo.", "Mais um parágrafo.", "E o quarto parágrafo."].join("\n\n"));
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [g] });
    const r = await invoke("extract-book-file");
    expect(r.warnings.length).toBe(1);
  });

  // Regressão (bug já corrigido): src/main/book-import-file.ts (splitChapters, ~linha 150): um texto curto de 1 a 3 parágrafos sem capítulos tem o
  // primeiro parágrafo tomado como título do livro e some; com 1 parágrafo, devolve zero capítulos (o aviso diz "ficou em um capítulo").
  it("texto de um parágrafo sem capítulos não pode perder o conteúdo", async () => {
    const g = path.join(dataDir, "um_paragrafo.txt");
    fs.writeFileSync(g, "Apenas um parágrafo sem capítulos.");
    pick(g);
    const r = await invoke("extract-book-file");
    expect(r.chapters.length).toBe(1);
    expect(r.chapters[0].text).toContain("Apenas um parágrafo");
  });

  it("docx pequeno gerado no teste (via html-to-docx) é lido com títulos", async () => {
    const htmlToDocx = require("html-to-docx");
    const buf = await htmlToDocx("<h1>Capítulo 1</h1><p>Alfa beta gama.</p><h1>Capítulo 2</h1><p>Delta.</p>", null, {});
    const f = path.join(dataDir, "doc.docx");
    fs.writeFileSync(f, Buffer.from(buf));
    pick(f);
    const r = await invoke("extract-book-file");
    expect(r.success).toBe(true);
    expect(r.chapters.map((c) => c.title)).toEqual(["Capítulo 1", "Capítulo 2"]);
    expect(r.chapters[0].text).toContain("Alfa beta gama.");
  });

  it("formato não suportado, arquivo vazio e cancelamento", async () => {
    const f = path.join(dataDir, "x.xyz");
    fs.writeFileSync(f, "a");
    pick(f);
    expect((await invoke("extract-book-file")).error).toMatch(/Formato/);
    const g = path.join(dataDir, "vazio.txt");
    fs.writeFileSync(g, "   \n  ");
    pick(g);
    expect((await invoke("extract-book-file")).error).toMatch(/texto/);
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    expect((await invoke("extract-book-file")).canceled).toBe(true);
  });
});

describe("IPC: primeira abertura (Manual de Uso)", () => {
  it("sem ASTRA_INSTALL_MANUAL não instala; com a variável instala uma vez e devolve o caminho uma única vez", async () => {
    const { installManualBook } = await import("../../src/main/first-run");
    const flag = path.join(userData, "first-run.json");
    fs.rmSync(flag, { force: true });
    // pasta de livros vazia (primeira abertura de verdade)
    for (const name of fs.readdirSync(booksRoot)) fs.rmSync(path.join(booksRoot, name), { recursive: true, force: true });
    delete process.env.ASTRA_INSTALL_MANUAL;
    expect(installManualBook()).toBeNull();

    process.env.ASTRA_INSTALL_MANUAL = "1";
    try {
      const target = installManualBook();
      expect(target).toBeTruthy();
      expect(target.startsWith(booksRoot)).toBe(true);
      expect(fs.existsSync(path.join(target, "config.json"))).toBe(true);
      const cfg = JSON.parse(fs.readFileSync(path.join(target, "config.json"), "utf8"));
      const open = cfg.explorer_state?.open_file;
      if (open) expect(path.isAbsolute(open)).toBe(true);
      expect(installManualBook()).toBeNull(); // só uma vez
      expect(await invoke("take-first-run-book")).toBe(target);
      expect(await invoke("take-first-run-book")).toBeNull(); // devolvido uma única vez
      // se o usuário apagar o manual, ele não volta
      fs.rmSync(target, { recursive: true, force: true });
      expect(installManualBook()).toBeNull();
    } finally {
      delete process.env.ASTRA_INSTALL_MANUAL;
    }
  });

  it("se a pasta de livros já tem livros (marcador perdido), não cria o manual e registra o marcador", async () => {
    const { installManualBook } = await import("../../src/main/first-run");
    const flag = path.join(userData, "first-run.json");
    fs.rmSync(flag, { force: true });
    for (const name of fs.readdirSync(booksRoot)) fs.rmSync(path.join(booksRoot, name), { recursive: true, force: true });
    fs.mkdirSync(path.join(booksRoot, "book_001"), { recursive: true });
    process.env.ASTRA_INSTALL_MANUAL = "1";
    try {
      expect(installManualBook()).toBeNull();
      expect(fs.readdirSync(booksRoot)).toEqual(["book_001"]); // nenhum livro novo
      expect(fs.existsSync(flag)).toBe(true); // não tenta de novo
      expect(await invoke("take-first-run-book")).toBeNull(); // e não abre nada
    } finally {
      delete process.env.ASTRA_INSTALL_MANUAL;
    }
  });
});
