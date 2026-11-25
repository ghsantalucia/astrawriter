import { describe, it, expect } from "vitest";
import { compactInstructions, compactDescription, CONCISE_NOTE } from "../../../../src/renderer/ai/compact";

describe("compact.compactInstructions", () => {
  it("tira negrito, citações e linhas horizontais", () => {
    expect(compactInstructions("**Atenção** aqui\n> citado\n---\nfim")).toBe("Atenção aqui\ncitado\n\nfim".replace("\n\nfim", "\n\nfim"));
  });
  it("unifica níveis de título e colapsa linhas em branco e espaços", () => {
    expect(compactInstructions("### Título\n\n\n\ntexto   com   espaços   \n")).toBe("# Título\n\ntexto com espaços");
  });
  it("encurta expressões longas", () => {
    expect(compactInstructions("Por favor, leia. Por exemplo, isto. Ou seja, aquilo.")).toBe("leia. ex., isto. isto é, aquilo.");
    expect(compactInstructions("Você deve ler o arquivo.")).toBe("ler o arquivo.");
    expect(compactInstructions("Lembre-se de que o livro é longo.")).toBe("o livro é longo.");
  });
  it("preserva blocos de código literalmente", () => {
    const entrada = "**x**\n```\n**não mexer**   aqui\n\n\n\nok\n```\n**y**";
    const saida = compactInstructions(entrada);
    expect(saida).toContain("```\n**não mexer**   aqui\n\n\n\nok\n```");
    expect(saida.startsWith("x\n")).toBe(true);
    expect(saida.endsWith("y")).toBe(true);
  });
  it("normaliza CRLF e tolera null", () => {
    expect(compactInstructions("a\r\nb")).toBe("a\nb");
    expect(compactInstructions(null)).toBe("");
  });
  it("nunca aumenta o texto", () => {
    const t = "# A\n\n**negrito** e ---\n> citação\n\n\n\nfim";
    expect(compactInstructions(t).length).toBeLessThanOrEqual(t.length);
  });
});

describe("compact.compactDescription", () => {
  it("mantém só as duas primeiras frases", () => {
    expect(compactDescription("Primeira. Segunda. Terceira.")).toBe("Primeira. Segunda.");
  });
  it("junta quebras de linha e respeita o limite de 240 caracteres", () => {
    const longa = "A".repeat(300) + ". Outra.";
    const r = compactDescription(longa);
    expect(r.length).toBeLessThanOrEqual(240);
    expect(r.endsWith("…")).toBe(true);
    expect(compactDescription("linha 1\nlinha 2")).toBe("linha 1 linha 2");
  });
  it("vazio devolve vazio", () => {
    expect(compactDescription("")).toBe("");
    expect(compactDescription(undefined)).toBe("");
  });
  it("CONCISE_NOTE começa com cabeçalho de estilo", () => {
    expect(CONCISE_NOTE).toContain("# Estilo");
  });
});
