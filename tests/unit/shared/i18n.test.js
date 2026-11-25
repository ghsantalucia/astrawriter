import { describe, it, expect, beforeEach } from "vitest";
import { t, setLanguage, getLanguage, normalizeLanguage, registerMessages } from "../../../src/shared/i18n";
import { loadMessages } from "../../../src/shared/i18nMessages";

describe("i18n", () => {
  beforeEach(() => {
    setLanguage("pt-BR");
  });

  it("normaliza códigos de idioma", () => {
    expect(normalizeLanguage("en-US")).toBe("en");
    expect(normalizeLanguage("pt_BR")).toBe("pt-BR");
    expect(normalizeLanguage("fr")).toBe("pt-BR");
    expect(normalizeLanguage(undefined)).toBe("pt-BR");
  });

  it("em português devolve o próprio texto e interpola parâmetros", () => {
    expect(t("Salvar")).toBe("Salvar");
    expect(t("Olá, {name}!", { name: "Ana" })).toBe("Olá, Ana!");
    expect(t("Sem parâmetro {x}")).toBe("Sem parâmetro {x}");
  });

  it("em inglês usa o dicionário e cai no português quando falta a tradução", () => {
    registerMessages("en", { "Olá, {name}!": "Hello, {name}!" });
    setLanguage("en");
    expect(getLanguage()).toBe("en");
    expect(t("Olá, {name}!", { name: "Ana" })).toBe("Hello, Ana!");
    expect(t("Texto sem tradução")).toBe("Texto sem tradução");
  });

  it("carrega os dicionários JSON do app", () => {
    loadMessages();
    setLanguage("en");
    expect(t("Idioma")).toBe("Language");
  });
});
