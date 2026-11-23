import { describe, it, expect } from "vitest";
import {
  entityIndexPath,
  indexPathsFor,
  indexLine,
  addIndexLink,
  removeIndexLinks,
} from "../../../../src/renderer/utils/bookIndex";

describe("bookIndex", () => {
  it("entityIndexPath aponta o índice da categoria (inclusive de subpastas)", () => {
    expect(entityIndexPath("assets/characters/c1.md")).toBe("assets/characters/index.md");
    expect(entityIndexPath("assets/places/sub/dir/p.md")).toBe("assets/places/index.md");
    expect(entityIndexPath("/assets/elements/e.md")).toBe("assets/elements/index.md");
    expect(entityIndexPath("assets\\characters\\c1.md")).toBe("assets/characters/index.md");
  });
  it("eventos são listados na linha do tempo", () => {
    expect(entityIndexPath("assets/events/e1.md")).toBe("assets/events/timeline.md");
    expect(entityIndexPath("assets/events/timeline.md")).toBeNull();
  });
  it("entityIndexPath devolve null para o que não entra em índice", () => {
    expect(entityIndexPath("assets/characters/index.md")).toBeNull();
    expect(entityIndexPath("assets/characters/foto.png")).toBeNull();
    expect(entityIndexPath("assets/outros/x.md")).toBeNull();
    expect(entityIndexPath("notes/n.md")).toBeNull();
    expect(entityIndexPath("assets/characters")).toBeNull();
    expect(entityIndexPath("content/chapter_001/a.md")).toBeNull();
  });
  it("indexPathsFor: capítulos vão para content/index.md", () => {
    expect(indexPathsFor("content/chapter_001/scene.md")).toEqual(["content/index.md"]);
    expect(indexPathsFor("assets/characters/c.md")).toEqual(["assets/characters/index.md"]);
    expect(indexPathsFor("notes/n.md")).toEqual([]);
  });
  it("indexLine remove colchetes do título e a barra inicial do caminho", () => {
    expect(indexLine("Ana [a]", "/assets/characters/ana.md")).toBe("- [Ana a](assets/characters/ana.md)");
    expect(indexLine(null, "x.md")).toBe("- [](x.md)");
  });
  it("addIndexLink acrescenta a linha ao final do corpo mantendo o frontmatter", () => {
    const idx = "---\ntitle: Idx\n---\n# Índice\n\n- [A](a.md)";
    const out = addIndexLink(idx, "B", "b.md");
    expect(out.startsWith("---\ntitle: Idx\n---\n")).toBe(true);
    expect(out.endsWith("- [A](a.md)\n- [B](b.md)\n")).toBe(true);
  });
  it("addIndexLink não duplica (ignora caixa, #fragmento e %20)", () => {
    const idx = "# I\n\n- [A](Assets/My%20File.md#auto)";
    expect(addIndexLink(idx, "A", "assets/my file.md")).toBe(idx);
  });
  // Regressão (bug já corrigido; bookIndex.ts, addIndexLink): não remove a barra inicial do caminho ao montar o conjunto
  // (removeIndexLinks remove). Esperado: não duplicar; obtido: acrescenta uma segunda linha.
  it("addIndexLink não duplica quando o caminho informado tem barra inicial", () => {
    const idx = "# I\n\n- [A](assets/a.md)";
    expect(addIndexLink(idx, "A", "/assets/a.md")).toBe(idx);
  });
  it("addIndexLink separa com linha em branco quando a última linha não é item", () => {
    expect(addIndexLink("# Índice", "A", "a.md")).toBe("# Índice\n\n- [A](a.md)\n");
  });
  it("removeIndexLinks remove só as linhas dos arquivos citados", () => {
    const idx = "# I\n- [A](a.md)\n- [B](/b.md#x)\n- [C](c.md)";
    expect(removeIndexLinks(idx, ["a.md", "B.md"])).toBe("# I\n- [C](c.md)");
  });
  it("removeIndexLinks sem correspondência devolve igual", () => {
    const idx = "- [A](a.md)";
    expect(removeIndexLinks(idx, ["z.md"])).toBe(idx);
  });
});
