import { describe, it, expect } from "vitest";
import {
  flattenBookTree,
  fileTitle,
  isLinkTarget,
  toInternalHref,
  searchLinkTargets,
  splitAliases,
  buildAutoLinkTerms,
  existingPathSet,
} from "../../../../src/renderer/utils/bookFiles";

const ROOT = "C:\\livros\\book_1";
const arq = (rel, key, metadata) => ({ originalPath: `${ROOT}\\${rel.replace(/\//g, "\\")}`, metadata, key });

describe("bookFiles", () => {
  it("flattenBookTree achata pastas, mantém só .md dentro do livro e calcula relPath", () => {
    const tree = {
      files: { a: arq("a.md", "a", { title: "A" }), img: arq("foto.png", "img", {}) },
      folders: {
        assets: { files: { c1: arq("assets/characters/c1.md", "c1", {}) }, folders: {} },
        fora: { files: { x: { originalPath: "D:/outro/x.md" } }, folders: {} },
      },
    };
    const r = flattenBookTree(tree, ROOT + "\\");
    expect(r.map((f) => f.relPath)).toEqual(["a.md", "assets/characters/c1.md"]);
    expect(r[0]).toMatchObject({ key: "a", absPath: "C:/livros/book_1/a.md" });
  });
  it("flattenBookTree usa path se não há originalPath e tolera null", () => {
    expect(flattenBookTree(null, ROOT)).toEqual([]);
    const r = flattenBookTree({ files: { z: { path: "C:/livros/book_1/z.MD" } } }, ROOT);
    expect(r[0].relPath).toBe("z.MD");
  });
  it("fileTitle: title > data.title.content > key", () => {
    expect(fileTitle({ key: "k", metadata: { title: "T" } })).toBe("T");
    expect(fileTitle({ key: "k", metadata: { data: { title: { content: "D" } } } })).toBe("D");
    expect(fileTitle({ key: "k" })).toBe("k");
  });
  it("isLinkTarget exclui modelos, índices e arquivos ilegíveis", () => {
    expect(isLinkTarget({ key: "template" })).toBe(false);
    expect(isLinkTarget({ key: "index" })).toBe(false);
    expect(isLinkTarget({ key: "x", metadata: { humanRead: false } })).toBe(false);
    expect(isLinkTarget({ key: "x", metadata: { humanRead: true } })).toBe(true);
    expect(isLinkTarget({ key: "x" })).toBe(true);
  });
  it("toInternalHref codifica espaços e acentos", () => {
    expect(toInternalHref("assets/a b/ç.md")).toBe("/assets/a%20b/%C3%A7.md");
  });
  it("searchLinkTargets filtra por título/caminho sem acento nem caixa, ordena e limita", () => {
    const files = [
      { key: "b", relPath: "assets/places/b.md", metadata: { title: "Éden" } },
      { key: "a", relPath: "assets/characters/a.md", metadata: { title: "Ana" } },
      { key: "t", relPath: "template.md", metadata: {} },
      { key: "n", relPath: "n.md", metadata: { title: "Oculto", humanRead: false } },
    ];
    expect(searchLinkTargets(files, "eden").map((r) => r.title)).toEqual(["Éden"]);
    expect(searchLinkTargets(files, "CHARACTERS")[0].displayPath).toBe("/assets/characters/a");
    expect(searchLinkTargets(files, "").map((r) => r.title)).toEqual(["Ana", "Éden", "t"]);
    expect(searchLinkTargets(files, "", 1)).toHaveLength(1);
  });
  it("splitAliases separa por vírgula, ponto e vírgula e linhas", () => {
    expect(splitAliases(" a, b;c\n d ,, ")).toEqual(["a", "b", "c", "d"]);
    expect(splitAliases(null)).toEqual([]);
  });
  it("buildAutoLinkTerms usa título e apelidos, ordena do maior para o menor e ignora curtos e o arquivo atual", () => {
    const files = [
      { key: "a", relPath: "assets/characters/a.md", metadata: { title: "Rei Arthur", data: { aliases: { content: "Art, Majestade" } } } },
      { key: "b", relPath: "assets/places/b.md", metadata: { title: "Eldoria" } },
      { key: "c", relPath: "assets/places/c.md", metadata: { title: "eldoria" } },
      { key: "d", relPath: "assets/places/d.md", metadata: { title: "Dorne" } },
      { key: "e", relPath: "content/ch/e.md", metadata: { title: "Capítulo Um" } },
      { key: "f", relPath: "assets/places/f.md", metadata: { title: "Ab" } },
    ];
    const r = buildAutoLinkTerms(files, "assets/places/d.md");
    expect(r.map((t) => t.term)).toEqual(["Majestade", "Rei Arthur", "Eldoria", "Art"].sort((a, b) => b.length - a.length));
    expect(r.find((t) => t.term === "Eldoria").href).toBe("/assets/places/b.md");
    expect(r.some((t) => t.term === "Dorne")).toBe(false);
    expect(r.some((t) => t.term === "Capítulo Um")).toBe(false);
  });
  it("existingPathSet normaliza caixa e acento", () => {
    const s = existingPathSet([{ relPath: "Assets/Éden.md" }]);
    expect(s.has("assets/eden.md")).toBe(true);
  });
});
