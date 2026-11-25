import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("electron", async () => (await import("../../helpers/electronMock.js")).createElectronMock());

import { setLanguage } from "../../../src/shared/i18n";
import { loadMessages } from "../../../src/shared/i18nMessages";
import { blocksFromText, splitChapters } from "../../../src/main/book-import-file";

const p = (text) => ({ type: "p", text });
const h = (text, level = 1) => ({ type: "heading", level, text });
const longText = "palavra ".repeat(80);

describe("importador de arquivo: bilíngue", () => {
  beforeEach(() => loadMessages());
  afterEach(() => setLanguage("pt-BR"));

  it("reconhece 'Chapter N' e 'Capítulo N' (em qualquer idioma ativo)", () => {
    for (const lang of ["pt-BR", "en"]) {
      setLanguage(lang);
      const b = blocksFromText("Chapter 1\nText.\nCapítulo 2\nMore.\nCHAPTER III: Return\nEnd.");
      expect(b.filter((x) => x.type === "heading").map((x) => x.text)).toEqual(["Chapter 1", "Capítulo 2", "CHAPTER III: Return"]);
    }
  });

  it("em português gera 'Prólogo' e 'Capítulo 1'", () => {
    setLanguage("pt-BR");
    const r = splitChapters([h("Chapter 1"), p("a"), h("Chapter 2"), p("b")].slice(0, 0).concat([p(longText), h("Capítulo 1"), p("a"), h("Capítulo 2"), p("b")]), "Livro");
    expect(r.chapters[0].title).toBe("Prólogo");
    expect(splitChapters([p("texto sozinho")], "x").chapters[0].title).toBe("Capítulo 1");
  });

  it("em inglês gera 'Prologue', 'Chapter 1' e o título padrão em inglês", () => {
    setLanguage("en");
    const r = splitChapters([p(longText), h("Chapter 1"), p("a"), h("Chapter 2"), p("b")], "Book");
    expect(r.chapters[0].title).toBe("Prologue");
    expect(splitChapters([p("lonely text")], "x").chapters[0].title).toBe("Chapter 1");
    expect(r.warnings).toEqual([]);
    expect(splitChapters([p("lonely text")], "x").warnings[0]).toMatch(/No chapter titles found/);
  });
});
