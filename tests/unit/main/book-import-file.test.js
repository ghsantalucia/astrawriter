import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

vi.mock("electron", async () => (await import("../../helpers/electronMock.js")).createElectronMock());

import { dialog } from "electron";
import { blocksFromText, splitChapters, extractBookFromFile } from "../../../src/main/book-import-file";

const p = (text) => ({ type: "p", text });
const h = (text, level = 1) => ({ type: "heading", level, text });

describe("book-import-file.blocksFromText", () => {
  it("separa parágrafos por linha em branco", () => {
    expect(blocksFromText("Um.\n\nDois.")).toEqual([p("Um."), p("Dois.")]);
  });
  it("une linhas quebradas no meio da frase (PDF) e separa quando a anterior termina a frase", () => {
    expect(blocksFromText("A frase continua\nna linha seguinte.\nNova frase aqui.")).toEqual([p("A frase continua na linha seguinte."), p("Nova frase aqui.")]);
  });
  it("reconhece títulos Markdown com o nível", () => {
    expect(blocksFromText("# Livro\n\n## Parte\ntexto")).toEqual([h("Livro", 1), h("Parte", 2), p("texto")]);
  });
  it("reconhece 'Capítulo N', 'CAPÍTULO IV: ...' e 'Chapter 2' como títulos de nível 1", () => {
    const b = blocksFromText("Capítulo 1\nTexto.\nCAPÍTULO IV: A volta\nMais.\nChapter 2\nFim.");
    expect(b.filter((x) => x.type === "heading").map((x) => x.text)).toEqual(["Capítulo 1", "CAPÍTULO IV: A volta", "Chapter 2"]);
    expect(b.every((x) => x.type === "p" || x.level === 1)).toBe(true);
  });
  it("linha comum que só menciona 'capítulo' não é título", () => {
    expect(blocksFromText("Neste capítulo falamos de tudo.")).toEqual([p("Neste capítulo falamos de tudo.")]);
  });
  it("normaliza CRLF e CR e ignora texto vazio", () => {
    expect(blocksFromText("A.\r\n\r\nB.\rC.")).toEqual([p("A."), p("B."), p("C.")]);
    expect(blocksFromText("   \n\n  ")).toEqual([]);
    expect(blocksFromText("")).toEqual([]);
  });
});

describe("book-import-file.splitChapters", () => {
  it("separa por títulos 'Capítulo N' e usa o título curto do começo como título do livro", () => {
    const blocks = [p("MINHA OBRA"), h("Capítulo 1"), p("Texto um."), h("Capítulo 2"), p("Texto dois com palavras.")];
    const r = splitChapters(blocks, "padrão");
    expect(r.title).toBe("MINHA OBRA");
    expect(r.chapters.map((c) => c.title)).toEqual(["Capítulo 1", "Capítulo 2"]);
    expect(r.chapters[1]).toMatchObject({ text: "Texto dois com palavras.", words: 4 });
    expect(r.warnings).toEqual([]);
  });
  it("sem 'Capítulo N', usa o nível de título que se repete (2 ou mais vezes)", () => {
    const blocks = [h("Livro", 1), h("Início", 2), p("a"), h("Meio", 2), p("b")];
    const r = splitChapters(blocks, "x");
    expect(r.title).toBe("Livro");
    expect(r.chapters.map((c) => c.title)).toEqual(["Início", "Meio"]);
  });
  it("subtítulos dentro do capítulo viram '## ...'", () => {
    const blocks = [h("Capítulo 1"), p("a"), h("Cena", 2), p("b"), h("Capítulo 2"), p("c")];
    const r = splitChapters(blocks, "x");
    expect(r.chapters[0].text).toBe("a\n\n## Cena\n\nb");
  });
  it("sem nenhum título de capítulo: o texto longo vai todo para 'Capítulo 1' e o título padrão é mantido", () => {
    const longo = "Esta é uma frase bem longa que passa de cento e vinte caracteres, para não ser tomada como o título do livro pelo importador de arquivos.";
    const r = splitChapters([p(longo), p("Outro parágrafo.")], "Fallback");
    expect(r.title).toBe("Fallback");
    expect(r.chapters).toHaveLength(1);
    expect(r.chapters[0]).toMatchObject({ title: "Capítulo 1", text: `${longo}

Outro parágrafo.` });
  });
  // Regressão (bug já corrigido; book-import-file.ts, splitChapters): a mensagem "Não encontrei títulos de capítulo: o texto todo ficou em um
  // capítulo" só é gerada se `chapters` estiver vazio, mas nesse caso o texto já foi colocado em "Capítulo 1" (o que a
  // torna inalcançável para documentos reais). Esperado: aviso quando nenhum título de capítulo foi reconhecido.
  it("avisa o autor quando nenhum título de capítulo foi reconhecido", () => {
    const longo = "Esta é uma frase bem longa que passa de cento e vinte caracteres, para não ser tomada como o título do livro pelo importador de arquivos.";
    expect(splitChapters([p(longo)], "x").warnings.length).toBeGreaterThan(0);
  });
  it("documento de um único parágrafo curto: o texto vira o capítulo (nada se perde)", () => {
    const r = splitChapters([p("Só texto aqui.")], "Fallback");
    expect(r.title).toBe("Fallback");
    expect(r.chapters).toEqual([{ title: "Capítulo 1", text: "Só texto aqui.", words: 3 }]);
  });
  it("documento sem blocos devolve aviso e usa o título alternativo", () => {
    const r = splitChapters([], "Vazio");
    expect(r).toEqual({ title: "Vazio", chapters: [], warnings: [expect.stringContaining("Não encontrei títulos")] });
  });
  it("prefácio longo (400+ caracteres) antes do primeiro capítulo vira 'Prólogo'", () => {
    const longo = "palavra ".repeat(80);
    const blocks = [p("TÍTULO"), p(longo), h("Capítulo 1"), p("a"), h("Capítulo 2"), p("b")];
    const r = splitChapters(blocks, "x");
    expect(r.chapters.map((c) => c.title)).toEqual(["Prólogo", "Capítulo 1", "Capítulo 2"]);
    expect(r.title).toBe("TÍTULO");
  });
  it("prefácio curto é descartado e o título do capítulo é limpo e limitado a 120 caracteres", () => {
    const blocks = [h("Capítulo   1    " + "x".repeat(200) ), p("a"), h("Capítulo 2"), p("b")];
    const r = splitChapters(blocks, "x");
    expect(r.chapters[0].title.length).toBeLessThanOrEqual(120);
    expect(r.chapters[0].title).not.toMatch(/\s{2,}/);
  });
  it("apenas um 'Capítulo N' não basta para dividir pelo padrão (cai para níveis repetidos)", () => {
    const r = splitChapters([h("Capítulo 1"), p("a"), p("b")], "x");
    expect(r.chapters).toHaveLength(1);
    expect(r.chapters[0].title).toBe("Capítulo 1");
  });
});

describe("book-import-file.extractBookFromFile", () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "astra-import-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    vi.restoreAllMocks();
  });
  const escolhe = (file) => dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [file] });

  it("cancelar a escolha devolve canceled", async () => {
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    expect(await extractBookFromFile({})).toEqual({ success: false, canceled: true });
  });
  it("importa um .md com capítulos, usando o nome do arquivo como título alternativo", async () => {
    const file = path.join(tmp, "meu_livro-novo.md");
    fs.writeFileSync(file, "# Capítulo 1\n\nPrimeiro texto.\n\n# Capítulo 2\n\nSegundo texto.\n");
    escolhe(file);
    const r = await extractBookFromFile({});
    expect(r).toMatchObject({ success: true, format: "md" });
    expect(r.chapters.map((c) => c.title)).toEqual(["Capítulo 1", "Capítulo 2"]);
    expect(r.chapters[0].text).toBe("Primeiro texto.");
    expect(r.title).toBe("meu livro novo");
  });
  it("importa .txt", async () => {
    const file = path.join(tmp, "a.txt");
    fs.writeFileSync(file, "Capítulo 1\nTexto A.\nCapítulo 2\nTexto B.");
    escolhe(file);
    const r = await extractBookFromFile({});
    expect(r.success).toBe(true);
    expect(r.chapters).toHaveLength(2);
    expect(r.format).toBe("txt");
  });
  it("arquivo sem texto é erro amigável", async () => {
    const file = path.join(tmp, "vazio.txt");
    fs.writeFileSync(file, "   \n");
    escolhe(file);
    const r = await extractBookFromFile({});
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Não encontrei texto/);
  });
  it("formato não suportado é erro", async () => {
    const file = path.join(tmp, "a.xyz");
    fs.writeFileSync(file, "x");
    escolhe(file);
    const r = await extractBookFromFile({});
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Formato não suportado/);
  });
  it("arquivo inexistente vira erro, sem lançar exceção", async () => {
    escolhe(path.join(tmp, "nao-existe.txt"));
    const r = await extractBookFromFile({});
    expect(r.success).toBe(false);
    expect(typeof r.error).toBe("string");
  });
  it("importa .odt (zip com content.xml)", async () => {
    const JSZip = require("jszip");
    const zip = new JSZip();
    zip.file("content.xml", '<office:text><text:h text:outline-level="1">Capítulo 1</text:h><text:p>Olá &amp; mundo<text:line-break/>fim.</text:p><text:h text:outline-level="1">Capítulo 2</text:h><text:p>Outro.</text:p></office:text>');
    const file = path.join(tmp, "livro.odt");
    fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }));
    escolhe(file);
    const r = await extractBookFromFile({});
    expect(r.success).toBe(true);
    expect(r.chapters.map((c) => c.title)).toEqual(["Capítulo 1", "Capítulo 2"]);
    expect(r.chapters[0].text).toBe("Olá & mundo fim.");
  });
  it(".odt sem content.xml é erro", async () => {
    const JSZip = require("jszip");
    const zip = new JSZip();
    zip.file("outro.xml", "x");
    const file = path.join(tmp, "ruim.odt");
    fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }));
    escolhe(file);
    const r = await extractBookFromFile({});
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/conteúdo legível/);
  });
});
