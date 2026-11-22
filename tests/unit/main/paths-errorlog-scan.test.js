import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

vi.mock("electron", async () => (await import("../../helpers/electronMock.js")).createElectronMock());

import { app } from "electron";
import { booksDir, ensureBooksDir, migrateLegacyBooks, templatesDir, iconPath, appRoot } from "../../../src/main/paths";
import { appendAiError, readAiErrors, clearAiErrors, errorLogPath } from "../../../src/main/ai-error-log";
import { scanBook, sumDir, bookDiskStats } from "../../../src/main/book-scan";

let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "astra-unit-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const escreve = (p, c = "x") => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, c);
};

describe("paths", () => {
  const dataDirOriginal = process.env.ASTRA_DATA_DIR;
  const execOriginal = process.execPath;
  afterEach(() => {
    if (dataDirOriginal === undefined) delete process.env.ASTRA_DATA_DIR;
    else process.env.ASTRA_DATA_DIR = dataDirOriginal;
    process.execPath = execOriginal;
    app.isPackaged = false;
  });

  it("booksDir usa ASTRA_DATA_DIR/books quando definido (isolamento dos testes)", () => {
    process.env.ASTRA_DATA_DIR = tmp;
    expect(booksDir()).toBe(path.join(tmp, "books"));
  });
  it("em desenvolvimento, booksDir fica na raiz do projeto (cwd)", () => {
    delete process.env.ASTRA_DATA_DIR;
    expect(appRoot()).toBe(process.cwd());
    expect(booksDir()).toBe(path.join(process.cwd(), "books"));
  });
  it("empacotado, booksDir fica em Documentos/Astra Writer/books", () => {
    delete process.env.ASTRA_DATA_DIR;
    app.isPackaged = true;
    app.getPath.mockImplementation((n) => path.join(tmp, n));
    expect(booksDir()).toBe(path.join(tmp, "documents", "Astra Writer", "books"));
  });
  it("templatesDir e iconPath em desenvolvimento apontam para o projeto", () => {
    expect(templatesDir()).toBe(path.join(process.cwd(), "templates", "book"));
    expect(iconPath()).toBe(path.join(process.cwd(), "public", "icon.ico"));
  });
  it("ensureBooksDir cria a pasta de livros isolada", () => {
    process.env.ASTRA_DATA_DIR = path.join(tmp, "dados");
    ensureBooksDir();
    expect(fs.statSync(path.join(tmp, "dados", "books")).isDirectory()).toBe(true);
  });
  it("migrateLegacyBooks não faz nada em desenvolvimento", () => {
    process.env.ASTRA_DATA_DIR = tmp;
    expect(migrateLegacyBooks()).toEqual([]);
  });
  it("migrateLegacyBooks copia livros da pasta antiga sem sobrescrever os existentes e mantém a origem", () => {
    process.env.ASTRA_DATA_DIR = path.join(tmp, "dados");
    app.isPackaged = true;
    const instalacao = path.join(tmp, "instalacao");
    process.execPath = path.join(instalacao, "app.exe");
    escreve(path.join(instalacao, "books", "book_1", "a.md"), "A");
    escreve(path.join(instalacao, "books", "book_1", "sub", "b.md"), "B");
    escreve(path.join(instalacao, "books", "book_2", "c.md"), "C-antigo");
    escreve(path.join(instalacao, "books", "solto.txt"), "ignorado");
    escreve(path.join(tmp, "dados", "books", "book_2", "c.md"), "C-novo");
    const moved = migrateLegacyBooks();
    expect(moved).toEqual(["book_1"]);
    expect(fs.readFileSync(path.join(tmp, "dados", "books", "book_1", "sub", "b.md"), "utf8")).toBe("B");
    expect(fs.readFileSync(path.join(tmp, "dados", "books", "book_2", "c.md"), "utf8")).toBe("C-novo");
    expect(fs.existsSync(path.join(instalacao, "books", "book_1", "a.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmp, "dados", "books", "solto.txt"))).toBe(false);
    // idempotente: segunda execução não migra de novo
    expect(migrateLegacyBooks()).toEqual([]);
  });
});

describe("ai-error-log", () => {
  it("errorLogPath fica em <dados>/ai/errors.log", () => {
    expect(errorLogPath("/d")).toBe(path.join("/d", "ai", "errors.log"));
  });
  it("lê vazio quando o log não existe", async () => {
    expect(await readAiErrors(tmp)).toEqual([]);
  });
  it("acrescenta registros e lê do mais recente para o mais antigo", async () => {
    await appendAiError(tmp, { provider: "claude", model: "m", status: 429, message: "primeiro", details: { quota: 1 }, book: "book_1" });
    await appendAiError(tmp, { message: "segundo" });
    const lista = await readAiErrors(tmp);
    expect(lista.map((e) => e.message)).toEqual(["segundo", "primeiro"]);
    expect(lista[1]).toMatchObject({ provider: "claude", model: "m", status: 429, book: "book_1", details: '{"quota":1}' });
    expect(new Date(lista[1].ts).toString()).not.toBe("Invalid Date");
  });
  it("corta campos muito longos", async () => {
    await appendAiError(tmp, { message: "x".repeat(5000) });
    const [e] = await readAiErrors(tmp);
    expect(e.message.endsWith("… [truncado]")).toBe(true);
    expect(e.message.length).toBeLessThan(4100);
  });
  it("linha corrompida vira registro com a própria linha como mensagem", async () => {
    await appendAiError(tmp, { message: "ok" });
    fs.appendFileSync(errorLogPath(tmp), "linha quebrada\n");
    const lista = await readAiErrors(tmp);
    expect(lista[0]).toEqual({ ts: null, message: "linha quebrada" });
    expect(lista[1].message).toBe("ok");
  });
  it("poda o log mantendo os registros mais recentes quando passa de 256 KB", async () => {
    for (let i = 0; i < 80; i++) await appendAiError(tmp, { message: `erro-${i}-${"y".repeat(3900)}` });
    const tamanho = fs.statSync(errorLogPath(tmp)).size;
    expect(tamanho).toBeLessThanOrEqual(256 * 1024);
    const lista = await readAiErrors(tmp);
    expect(lista[0].message.startsWith("erro-79-")).toBe(true);
    expect(lista.length).toBeLessThan(80);
    expect(lista.every((e) => e.message.startsWith("erro-"))).toBe(true);
  });
  it("clearAiErrors apaga o log (e não falha se não existe)", async () => {
    await appendAiError(tmp, { message: "x" });
    await clearAiErrors(tmp);
    expect(fs.existsSync(errorLogPath(tmp))).toBe(false);
    await expect(clearAiErrors(tmp)).resolves.toBeUndefined();
  });
});

describe("book-scan", () => {
  it("lista .md e .md.temp, ignora pastas ocultas e outros arquivos, com caminho relativo com /", async () => {
    escreve(path.join(tmp, "a.md"), "A");
    escreve(path.join(tmp, "sub", "b.md"), "B");
    escreve(path.join(tmp, ".system", "x.md"), "oculto");
    escreve(path.join(tmp, "foto.png"), "bin");
    const r = await scanBook(tmp);
    expect(r.map((f) => f.rel).sort()).toEqual(["a.md", "sub/b.md"]);
    expect(r.find((f) => f.rel === "sub/b.md")).toMatchObject({ isTemp: false, isNew: false, changed: true, content: "B" });
  });
  it("hash conhecido igual: não mudou e o conteúdo não é devolvido", async () => {
    escreve(path.join(tmp, "a.md"), "A");
    const [primeiro] = await scanBook(tmp);
    const [segundo] = await scanBook(tmp, { "a.md": primeiro.hash });
    expect(segundo).toMatchObject({ changed: false, content: null, hash: primeiro.hash });
    escreve(path.join(tmp, "a.md"), "A2");
    const [terceiro] = await scanBook(tmp, { "a.md": primeiro.hash });
    expect(terceiro).toMatchObject({ changed: true, content: "A2" });
    expect(terceiro.hash).toMatch(/^[0-9a-f]{40}$/);
  });
  it("o rascunho .md.temp tem prioridade sobre o oficial; rascunho sem oficial é novo", async () => {
    escreve(path.join(tmp, "a.md"), "oficial");
    escreve(path.join(tmp, "a.md.temp"), "rascunho");
    escreve(path.join(tmp, "n.md.temp"), "novo");
    const r = await scanBook(tmp);
    const a = r.find((f) => f.rel === "a.md");
    expect(a).toMatchObject({ isTemp: true, isNew: false, content: "rascunho" });
    expect(a.path).toBe(path.join(tmp, "a.md"));
    expect(r.find((f) => f.rel === "n.md")).toMatchObject({ isTemp: true, isNew: true, content: "novo" });
  });
  it("com 'only' só lê os arquivos pedidos; os demais voltam sem conteúdo e com o hash conhecido", async () => {
    escreve(path.join(tmp, "a.md"), "A");
    escreve(path.join(tmp, "b.md"), "B");
    const r = await scanBook(tmp, { "b.md": "h-antigo" }, ["a.md"]);
    expect(r.find((f) => f.rel === "a.md").content).toBe("A");
    expect(r.find((f) => f.rel === "b.md")).toMatchObject({ changed: false, content: null, hash: "h-antigo" });
  });
  it("pasta inexistente devolve lista vazia", async () => {
    expect(await scanBook(path.join(tmp, "nao-existe"))).toEqual([]);
  });
  it("sumDir soma arquivos e bytes recursivamente (e 0 se a pasta não existe)", async () => {
    escreve(path.join(tmp, "a.txt"), "12345");
    escreve(path.join(tmp, "d", "b.txt"), "123");
    expect(await sumDir(tmp)).toEqual({ files: 2, bytes: 8 });
    expect(await sumDir(path.join(tmp, "nada"))).toEqual({ files: 0, bytes: 0 });
  });
  it("bookDiskStats separa conteúdo, changelog e chat; .system não conta como arquivo do livro", async () => {
    escreve(path.join(tmp, "a.md"), "1234567890");
    escreve(path.join(tmp, ".system", "changelog", "logs", "l.jsonl"), "123456");
    escreve(path.join(tmp, ".system", "chatlog", "c.jsonl"), "1234");
    escreve(path.join(tmp, ".system", "review", "state.json"), "12");
    const s = await bookDiskStats(tmp);
    expect(s).toEqual({ files: 1, bytes: 12, systemFiles: 1, changelogBytes: 6, changelogFiles: 1, chatlogBytes: 4 });
  });
});
