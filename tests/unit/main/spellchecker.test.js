import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// Usa o Hunspell (WebAssembly) e os dicionários reais; só a pasta de dados do usuário é falsa.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "astra-spell-"));
vi.mock("electron", async () => {
  const { createElectronMock } = await import("../../helpers/electronMock.js");
  const mock = createElectronMock();
  mock.app.getPath = vi.fn(() => globalThis.__astraSpellDir);
  return mock;
});
globalThis.__astraSpellDir = tmp;

import { findMisspelled, suggestWord, addCustomWord } from "../../../src/main/spellchecker";

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  delete globalThis.__astraSpellDir;
});

describe("spellchecker (Hunspell real)", () => {
  it("pt-BR: reconhece palavras corretas e aponta as desconhecidas", async () => {
    const r = await findMisspelled("pt-BR", ["casa", "kasa", "ação", "asdfgh"]);
    expect(r).toEqual(["kasa", "asdfgh"]);
  }, 60000);
  it("en-US: usa o dicionário do idioma pedido", async () => {
    const r = await findMisspelled("en-US", ["house", "hoouse"]);
    expect(r).toEqual(["hoouse"]);
  }, 60000);
  it("idioma desconhecido cai no pt-BR e variações como 'pt' funcionam", async () => {
    expect(await findMisspelled("pt", ["casa"])).toEqual([]);
    expect(await findMisspelled("xx", ["casa", "kasa"])).toEqual(["kasa"]);
  }, 60000);
  it("apóstrofo tipográfico é tratado como o simples", async () => {
    expect(await findMisspelled("en-US", ["don’t"])).toEqual([]);
  }, 60000);
  it("lista vazia devolve vazio", async () => {
    expect(await findMisspelled("pt-BR", [])).toEqual([]);
  }, 60000);
  it("suggestWord devolve até 6 sugestões", async () => {
    const s = await suggestWord("pt-BR", "kasa");
    expect(s.length).toBeGreaterThan(0);
    expect(s.length).toBeLessThanOrEqual(6);
    expect(s).toContain("casa");
  }, 60000);
  it("addCustomWord grava em disco e a palavra deixa de ser apontada", async () => {
    expect(await findMisspelled("pt-BR", ["xyzzyastra"])).toEqual(["xyzzyastra"]);
    await addCustomWord("  xyzzyastra ");
    expect(await findMisspelled("pt-BR", ["xyzzyastra"])).toEqual([]);
    const salvo = JSON.parse(fs.readFileSync(path.join(tmp, "spell-dictionary.json"), "utf8"));
    expect(salvo.words).toContain("xyzzyastra");
  }, 60000);
  it("addCustomWord ignora texto vazio", async () => {
    await addCustomWord("   ");
    await addCustomWord(null);
    const salvo = JSON.parse(fs.readFileSync(path.join(tmp, "spell-dictionary.json"), "utf8"));
    expect(salvo.words.every((w) => w.trim())).toBe(true);
  });
});
