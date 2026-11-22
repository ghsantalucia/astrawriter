import { describe, it, expect } from "vitest";
import { applyAutoLinksToMarkdown } from "../../../../src/renderer/utils/autoLinkText";

const terms = [
  { term: "Rei Arthur", href: "assets/characters/arthur.md" },
  { term: "Arthur", href: "assets/characters/arthur2.md" },
  { term: "Eldoria", href: "assets/places/eldoria.md" },
];

describe("autoLinkText.applyAutoLinksToMarkdown", () => {
  it("sem termos devolve o corpo intacto", () => {
    expect(applyAutoLinksToMarkdown("texto", [])).toEqual({ body: "texto", count: 0 });
  });
  it("cria link com o marcador #auto preservando o texto original", () => {
    const r = applyAutoLinksToMarkdown("Viajou até Eldoria ontem.", terms);
    expect(r.body).toBe("Viajou até [Eldoria](assets/places/eldoria.md#auto) ontem.");
    expect(r.count).toBe(1);
  });
  it("ignora maiúsculas e acentos mas mantém a grafia do texto", () => {
    const r = applyAutoLinksToMarkdown("ELDORIA e eldoria", terms);
    expect(r.body).toBe("[ELDORIA](assets/places/eldoria.md#auto) e [eldoria](assets/places/eldoria.md#auto)");
    expect(r.count).toBe(2);
    const acento = applyAutoLinksToMarkdown("Um Éden", [{ term: "eden", href: "e.md" }]);
    expect(acento.body).toBe("Um [Éden](e.md#auto)");
  });
  it("exige palavra inteira", () => {
    expect(applyAutoLinksToMarkdown("Arthurian e Eldorias", terms)).toEqual({ body: "Arthurian e Eldorias", count: 0 });
  });
  it("termo maior vence o menor sobreposto", () => {
    const r = applyAutoLinksToMarkdown("O Rei Arthur chegou. Arthur sorriu.", terms);
    expect(r.body).toBe("O [Rei Arthur](assets/characters/arthur.md#auto) chegou. [Arthur](assets/characters/arthur2.md#auto) sorriu.");
    expect(r.count).toBe(2);
  });
  it("não mexe em código inline, links, imagens e HTML", () => {
    const md = "`Eldoria` [Eldoria](x.md) ![Eldoria](i.png) <a title=\"Eldoria\">Eldoria</a>";
    const r = applyAutoLinksToMarkdown(md, terms);
    // só o texto entre as tags <a>…</a> é texto livre
    expect(r.body).toBe("`Eldoria` [Eldoria](x.md) ![Eldoria](i.png) <a title=\"Eldoria\">[Eldoria](assets/places/eldoria.md#auto)</a>");
    expect(r.count).toBe(1);
  });
  it("não mexe em blocos de código cercados nem em código indentado", () => {
    const md = "Eldoria\n```\nEldoria\n```\n~~~\nEldoria\n~~~\n    Eldoria\n\tEldoria\nEldoria";
    const r = applyAutoLinksToMarkdown(md, terms);
    expect(r.count).toBe(2);
    const linhas = r.body.split("\n");
    expect(linhas[0]).toContain("#auto");
    expect(linhas[2]).toBe("Eldoria");
    expect(linhas[5]).toBe("Eldoria");
    expect(linhas[7]).toBe("    Eldoria");
    expect(linhas[8]).toBe("\tEldoria");
    expect(linhas[9]).toContain("#auto");
  });
  it("linka também em títulos", () => {
    expect(applyAutoLinksToMarkdown("# Eldoria", terms).body).toBe("# [Eldoria](assets/places/eldoria.md#auto)");
  });
  it("corpo null vira texto vazio", () => {
    expect(applyAutoLinksToMarkdown(null, terms)).toEqual({ body: "", count: 0 });
  });
  it("termo vazio é ignorado", () => {
    expect(applyAutoLinksToMarkdown("abc", [{ term: "", href: "x.md" }]).count).toBe(0);
  });
});
