import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  REVIEW_DIR,
  systemPath,
  readSystemJson,
  writeSystemJson,
  EMPTY,
  loadReviewData,
} from "../../../../src/renderer/review/reviewStore";

let arquivos;
beforeEach(() => {
  arquivos = new Map();
  window.electronAPI = {
    readFile: vi.fn(async (p) => (arquivos.has(p) ? arquivos.get(p) : null)),
    saveFile: vi.fn(async (p, conteudo) => {
      arquivos.set(p, conteudo);
      return { success: true };
    }),
  };
});
afterEach(() => {
  delete window.electronAPI;
});

describe("reviewStore", () => {
  it("systemPath normaliza barras e junta com uma só barra", () => {
    expect(systemPath("C:\\livros\\book_1\\", ".system/x.json")).toBe("C:/livros/book_1/.system/x.json");
    expect(systemPath("/a/b///", "c")).toBe("/a/b/c");
  });
  it("readSystemJson devolve o padrão quando o arquivo não existe ou está vazio", async () => {
    expect(await readSystemJson("/b", "x.json", { a: 1 })).toEqual({ a: 1 });
    arquivos.set("/b/x.json", "");
    expect(await readSystemJson("/b", "x.json", { a: 1 })).toEqual({ a: 1 });
  });
  it("readSystemJson devolve o padrão para JSON corrompido ou não-objeto", async () => {
    arquivos.set("/b/x.json", "{quebrado");
    expect(await readSystemJson("/b", "x.json", "pad")).toBe("pad");
    arquivos.set("/b/x.json", "123");
    expect(await readSystemJson("/b", "x.json", "pad")).toBe("pad");
    arquivos.set("/b/x.json", "null");
    expect(await readSystemJson("/b", "x.json", "pad")).toBe("pad");
  });
  it("readSystemJson devolve o padrão se a leitura lança erro", async () => {
    window.electronAPI.readFile = vi.fn(async () => {
      throw new Error("falhou");
    });
    expect(await readSystemJson("/b", "x.json", { v: 0 })).toEqual({ v: 0 });
  });
  it("writeSystemJson grava JSON e informa sucesso/falha", async () => {
    expect(await writeSystemJson("/b", "d/y.json", { a: [1] })).toBe(true);
    expect(JSON.parse(arquivos.get("/b/d/y.json"))).toEqual({ a: [1] });
    window.electronAPI.saveFile = vi.fn(async () => ({ success: false }));
    expect(await writeSystemJson("/b", "y.json", {})).toBe(false);
    window.electronAPI.saveFile = vi.fn(async () => undefined);
    expect(await writeSystemJson("/b", "y.json", {})).toBe(false);
  });
  it("loadReviewData sem arquivos devolve os estados vazios", async () => {
    const d = await loadReviewData("/b");
    expect(d.state).toEqual(EMPTY.state());
    expect(d.registered).toEqual({ version: 1, issues: [] });
    expect(d.dismissed).toEqual({ version: 1, issues: {}, types: {} });
    expect(d.dictionary).toEqual({ version: 1, words: [] });
    expect(d.settings).toEqual({ version: 1, enabled: true });
  });
  it("loadReviewData mescla o salvo sobre o padrão (campos novos continuam presentes)", async () => {
    arquivos.set(`/b/${REVIEW_DIR}/dictionary.json`, JSON.stringify({ words: ["xis"] }));
    arquivos.set(`/b/${REVIEW_DIR}/settings.json`, JSON.stringify({ enabled: false }));
    const d = await loadReviewData("/b");
    expect(d.dictionary).toEqual({ version: 1, words: ["xis"] });
    expect(d.settings.enabled).toBe(false);
  });
  it("cada chamada de EMPTY cria objetos novos (sem estado compartilhado)", () => {
    const a = EMPTY.registered();
    a.issues.push(1);
    expect(EMPTY.registered().issues).toEqual([]);
  });
});
