import { describe, it, expect } from "vitest";
import { canDeleteFile, isChapterFolder, chapterNumber } from "../../../../src/renderer/utils/deletePermission";

describe("deletePermission.canDeleteFile", () => {
  const livre = { humanWrite: true, aiWrite: true };
  it("arquivos de content/ nunca são excluídos individualmente", () => {
    expect(canDeleteFile(livre, "content/chapter_001/a.md")).toBe(false);
    expect(canDeleteFile({ ...livre, userDelete: true }, "Content/x.md")).toBe(false);
    expect(canDeleteFile({ ...livre, aiDelete: true }, "/content/x.md", "ai")).toBe(false);
  });
  it("index.md e template.md são protegidos em qualquer pasta", () => {
    expect(canDeleteFile({ ...livre, userDelete: true }, "assets/characters/index.md")).toBe(false);
    expect(canDeleteFile(livre, "assets/characters/TEMPLATE.md")).toBe(false);
  });
  it("o usuário exclui o que pode editar", () => {
    expect(canDeleteFile({ humanWrite: true }, "notes/n.md")).toBe(true);
    expect(canDeleteFile({ humanWrite: false }, "notes/n.md")).toBe(false);
    expect(canDeleteFile({}, "notes/n.md")).toBe(false);
    expect(canDeleteFile(null, "notes/n.md")).toBe(false);
  });
  it("userDelete:false bloqueia o usuário", () => {
    expect(canDeleteFile({ humanWrite: true, userDelete: false }, "notes/n.md")).toBe(false);
  });
  it("a IA só exclui com aiDelete:true explícito e aiWrite", () => {
    expect(canDeleteFile({ aiWrite: true }, "notes/n.md", "ai")).toBe(false);
    expect(canDeleteFile({ aiWrite: true, aiDelete: true }, "notes/n.md", "ai")).toBe(true);
    expect(canDeleteFile({ aiWrite: false, aiDelete: true }, "notes/n.md", "ai")).toBe(false);
    expect(canDeleteFile({ aiWrite: true, aiDelete: false }, "notes/n.md", "ai")).toBe(false);
  });
  it("aiDelete/userDelete de um não afetam o outro", () => {
    expect(canDeleteFile({ humanWrite: true, aiDelete: true }, "n.md", "user")).toBe(true);
    expect(canDeleteFile({ aiWrite: true, userDelete: true }, "n.md", "ai")).toBe(false);
  });
  it("userDelete:true libera o usuário (precisa poder editar)", () => {
    expect(canDeleteFile({ humanWrite: true, userDelete: true }, "n.md")).toBe(true);
    expect(canDeleteFile({ humanWrite: false, userDelete: true }, "n.md")).toBe(false);
  });
});

describe("deletePermission: pastas de capítulo", () => {
  it("isChapterFolder reconhece content/chapter_N", () => {
    expect(isChapterFolder("content/chapter_002")).toBe(true);
    expect(isChapterFolder("/content/chapter_002/")).toBe(true);
    expect(isChapterFolder("content\\CHAPTER_10")).toBe(true);
  });
  it("isChapterFolder rejeita outros caminhos", () => {
    expect(isChapterFolder("content/chapter_002/scene.md")).toBe(false);
    expect(isChapterFolder("content/capitulo")).toBe(false);
    expect(isChapterFolder("notes/chapter_001")).toBe(false);
    expect(isChapterFolder("chapter_001")).toBe(false);
  });
  it("chapterNumber extrai o número", () => {
    expect(chapterNumber("chapter_003")).toBe(3);
    expect(chapterNumber("chapter_120")).toBe(120);
    expect(chapterNumber("capitulo_1")).toBeNull();
    expect(chapterNumber("chapter_1x")).toBeNull();
    expect(chapterNumber(undefined)).toBeNull();
  });
});
