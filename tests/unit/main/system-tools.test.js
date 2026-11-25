import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

vi.mock("electron", async () => (await import("../../helpers/electronMock.js")).createElectronMock());

import { app, dialog } from "electron";
import { compareVersions, backupBooks, appDiskUsage, exportAllBooks, uninstallApp } from "../../../src/main/system-tools";

describe("system-tools.compareVersions", () => {
  it("compara numericamente por segmento", () => {
    expect(compareVersions("1.1.0", "1.0.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.9", "1.1.0")).toBeLessThan(0);
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0);
  });
  it("ignora prefixo v e sufixo de pré-lançamento", () => {
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("V2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2.3-beta.1", "1.2.3")).toBe(0);
  });
  it("completa segmentos que faltam com zero e tolera vazio/lixo", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.0.1", "1.2")).toBeGreaterThan(0);
    expect(compareVersions(undefined, "0.0.0")).toBe(0);
    expect(compareVersions("", "0.0.1")).toBeLessThan(0);
    expect(compareVersions("abc", "0")).toBe(0);
  });
});

describe("system-tools: backup e uso de disco (pasta de dados isolada)", () => {
  let tmp;
  const original = process.env.ASTRA_DATA_DIR;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "astra-sys-"));
    process.env.ASTRA_DATA_DIR = path.join(tmp, "dados");
    app.getPath.mockImplementation(() => path.join(tmp, "userData"));
    fs.mkdirSync(path.join(tmp, "userData"), { recursive: true });
    const livro = path.join(tmp, "dados", "books", "book_1");
    fs.mkdirSync(path.join(livro, "content"), { recursive: true });
    fs.mkdirSync(path.join(livro, ".system", "changelog"), { recursive: true });
    fs.writeFileSync(path.join(livro, "config.json"), JSON.stringify({ book_title: "Meu: Livro?" }));
    fs.writeFileSync(path.join(livro, "content", "a.md"), "12345");
    fs.writeFileSync(path.join(livro, ".system", "changelog", "l.jsonl"), "123");
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ASTRA_DATA_DIR;
    else process.env.ASTRA_DATA_DIR = original;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("backupBooks sem destino é erro", async () => {
    expect(await backupBooks("")).toEqual({ success: false, error: "Escolha uma pasta de destino." });
  });
  it("backupBooks cria um zip por livro com nome seguro e conteúdo do livro", async () => {
    const dest = path.join(tmp, "backup");
    const r = await backupBooks(dest);
    expect(r.success).toBe(true);
    expect(r.count).toBe(1);
    const nome = path.basename(r.files[0]);
    expect(nome).toMatch(/^Meu Livro \[book_1\] \d{4}-\d{2}-\d{2}_\d{4}\.zip$/);
    const JSZip = require("jszip");
    const zip = await JSZip.loadAsync(fs.readFileSync(r.files[0]));
    const nomes = Object.keys(zip.files);
    expect(nomes.some((n) => n.endsWith("content/a.md"))).toBe(true);
    expect(nomes.every((n) => n.startsWith("Meu Livro/"))).toBe(true);
  });
  it("backupBooks mantém só as últimas 'keep' cópias do livro", async () => {
    const dest = path.join(tmp, "backup");
    fs.mkdirSync(dest, { recursive: true });
    for (const d of ["2020-01-01_0000", "2021-01-01_0000", "2022-01-01_0000"]) {
      fs.writeFileSync(path.join(dest, `Meu Livro [book_1] ${d}.zip`), "z");
    }
    fs.writeFileSync(path.join(dest, "Outro [book_9] 2019-01-01_0000.zip"), "z");
    const r = await backupBooks(dest, 2);
    expect(r.success).toBe(true);
    const restantes = fs.readdirSync(dest).filter((n) => n.startsWith("Meu Livro [book_1]"));
    expect(restantes).toHaveLength(2);
    expect(restantes).not.toContain("Meu Livro [book_1] 2020-01-01_0000.zip");
    expect(restantes).not.toContain("Meu Livro [book_1] 2021-01-01_0000.zip");
    expect(fs.existsSync(path.join(dest, "Outro [book_9] 2019-01-01_0000.zip"))).toBe(true);
  });
  it("backupBooks sem livros devolve contagem 0", async () => {
    fs.rmSync(path.join(tmp, "dados"), { recursive: true });
    expect(await backupBooks(path.join(tmp, "b2"))).toMatchObject({ success: true, count: 0, files: [] });
  });
  it("appDiskUsage separa livros e histórico (.system) e não soma a instalação em desenvolvimento", async () => {
    const u = await appDiskUsage();
    expect(u.books).toBeGreaterThanOrEqual(5 + "{\"book_title\":\"Meu: Livro?\"}".length);
    expect(u.history).toBe(3);
    expect(u.install).toBeNull();
    expect(u.packaged).toBe(false);
    expect(u.total).toBe(u.books + u.history + u.userData);
  });
  it("exportAllBooks: cancelar devolve canceled; escolher pasta faz o backup nela", async () => {
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    expect(await exportAllBooks({})).toEqual({ success: false, canceled: true });
    const dest = path.join(tmp, "exportados");
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [dest] });
    const r = await exportAllBooks({});
    expect(r).toMatchObject({ success: true, count: 1, folder: dest });
  });
});

describe("system-tools.uninstallApp", () => {
  it("só funciona no app instalado", () => {
    app.isPackaged = false;
    expect(uninstallApp()).toMatchObject({ success: false, error: expect.stringContaining("só está disponível") });
  });
});
