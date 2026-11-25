import { describe, it, expect } from "vitest";
import { sha1 } from "../../../../src/renderer/utils/hash";

describe("hash.sha1", () => {
  it("calcula o SHA-1 conhecido de 'abc'", async () => {
    expect(await sha1("abc")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });
  it("texto vazio, null e undefined dão o hash da string vazia", async () => {
    const vazio = "da39a3ee5e6b4b0d3255bfef95601890afd80709";
    expect(await sha1("")).toBe(vazio);
    expect(await sha1(null)).toBe(vazio);
    expect(await sha1(undefined)).toBe(vazio);
  });
  it("é determinístico, tem 40 hex e diferencia textos", async () => {
    const a = await sha1("olá");
    expect(a).toMatch(/^[0-9a-f]{40}$/);
    expect(await sha1("olá")).toBe(a);
    expect(await sha1("ola")).not.toBe(a);
  });
  it("converte não-strings em texto", async () => {
    expect(await sha1(123)).toBe(await sha1("123"));
  });
});
