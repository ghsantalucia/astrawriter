import { describe, it, expect } from "vitest";
import {
  slugify,
  normalizeOptions,
  flattenVariables,
  editableFields,
  setVariableContent,
  parseSections,
  parseTemplate,
  buildTemplateSteps,
  allFields,
  findMissingRequired,
  resolveTitle,
  applyTemplateValues,
  renderTemplateFile,
  replaceFirstHeading,
  appendToBody,
  TITLE_FIELD_ID,
} from "../../../../src/renderer/utils/template";

const MODELO = `---
title: Personagem
data:
  name:
    placeholder: Nome
    required: true
    content: ""
  group:
    role:
      placeholder: Papel
      options: [Herói, Vilão]
---
Preâmbulo.

## Aparência
> Descreva o rosto.

## História
Texto padrão.
`;

describe("template: slugify e opções", () => {
  it("slugify remove acentos e normaliza", () => {
    expect(slugify("  Olá, Mundo Ção! ")).toBe("ola-mundo-cao");
    expect(slugify(null)).toBe("");
    expect(slugify("---")).toBe("");
  });
  it("normalizeOptions aceita textos e objetos, descarta vazios", () => {
    expect(normalizeOptions(["A", { value: "b", label: "Bê" }, { label: "só rótulo" }, "", { value: "" }])).toEqual([
      { value: "A", label: "A" },
      { value: "b", label: "Bê" },
      { value: "só rótulo", label: "só rótulo" },
    ]);
    expect(normalizeOptions("x")).toEqual([]);
    expect(normalizeOptions(undefined)).toEqual([]);
  });
});

describe("template: variáveis", () => {
  it("flattenVariables acha folhas aninhadas com id pontuado e tipos", () => {
    const vars = flattenVariables({
      a: { placeholder: "A", required: "true", content: 5 },
      g: { b: { type: "textarea" }, c: { options: ["x"] }, d: { type: "EVENTS" }, e: { type: "bogus", placeholder: "E" } },
    });
    expect(vars.map((v) => v.id)).toEqual(["a", "g.b", "g.c", "g.d", "g.e"]);
    expect(vars[0]).toMatchObject({ required: true, content: "5", type: "text", path: ["a"] });
    expect(vars.map((v) => v.type)).toEqual(["text", "textarea", "select", "events", "text"]);
    expect(vars[2].options).toEqual([{ value: "x", label: "x" }]);
  });
  it("flattenVariables tolera entradas inválidas", () => {
    expect(flattenVariables(null)).toEqual([]);
    expect(flattenVariables("x")).toEqual([]);
    expect(flattenVariables({ a: null, b: 3 })).toEqual([]);
  });
  it("editableFields inclui campo Título sintético só quando pedido e faltando", () => {
    const meta = { title: "Ana", data: { age: { placeholder: "Idade", content: "9" } } };
    expect(editableFields(meta).map((f) => f.id)).toEqual(["age"]);
    const com = editableFields(meta, { title: true });
    expect(com[0]).toMatchObject({ id: TITLE_FIELD_ID, value: "Ana", required: true });
    const comVar = editableFields({ title: "Ana", data: { title: { placeholder: "T" } } }, { title: true });
    expect(comVar.map((f) => f.id)).toEqual(["title"]);
  });
  it("editableFields usa o id quando falta placeholder", () => {
    expect(editableFields({ data: { x: { content: "1" } } })[0].label).toBe("x");
  });
  it("setVariableContent cria caminho que falta", () => {
    const data = {};
    setVariableContent(data, ["a", "b"], "v");
    expect(data).toEqual({ a: { b: { content: "v" } } });
    setVariableContent(data, ["a", "b"], "w");
    expect(data.a.b.content).toBe("w");
  });
});

describe("template: seções", () => {
  it("parseSections separa prefácio e seções, com placeholder da citação", () => {
    const r = parseSections("Pre\n\n## Um\n> dica\ncorpo\n\n## Dois\n");
    expect(r.preamble).toBe("Pre");
    expect(r.sections).toHaveLength(2);
    expect(r.sections[0]).toMatchObject({ id: "section-um", title: "Um", placeholder: "dica", raw: "> dica\ncorpo" });
    expect(r.sections[1].raw).toBe("");
  });
  it("parseSections ignora ## em bloco de código e ### ", () => {
    const r = parseSections("## A\n```\n## Falso\n```\n### Sub\nx");
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0].raw).toContain("## Falso");
    expect(r.sections[0].raw).toContain("### Sub");
  });
  it("parseSections gera ids únicos para títulos repetidos ou sem slug", () => {
    const r = parseSections("## Igual\n## Igual\n## !!!\n## ???");
    expect(r.sections.map((s) => s.id)).toEqual(["section-igual", "section-igual-2", "section-secao", "section-secao-2"]);
  });
  it("parseSections aceita ## fechados e CRLF", () => {
    expect(parseSections("## Título ##\r\ntexto").sections[0].title).toBe("Título");
  });
});

describe("template: parse, passos, validação e aplicação", () => {
  const tpl = parseTemplate(MODELO);
  it("parseTemplate lê metadados, variáveis, prefácio e seções", () => {
    expect(tpl.metadata.title).toBe("Personagem");
    expect(tpl.variables.map((v) => v.id)).toEqual(["name", "group.role"]);
    expect(tpl.preamble).toBe("Preâmbulo.");
    expect(tpl.sections.map((s) => s.id)).toEqual(["section-aparencia", "section-historia"]);
  });
  it("parseTemplate tolera conteúdo vazio", () => {
    const t = parseTemplate("");
    expect(t.variables).toEqual([]);
    expect(t.sections).toEqual([]);
  });
  it("buildTemplateSteps cria um passo de variáveis e um por seção", () => {
    const steps = buildTemplateSteps(tpl);
    expect(steps.map((s) => s.id)).toEqual(["variables", "section-aparencia", "section-historia"]);
    expect(steps[0].title).toBe("Informações básicas");
    expect(steps[0].fields[1].type).toBe("select");
    expect(steps[1].fields[0]).toMatchObject({ type: "textarea", rows: 9, required: false });
    expect(buildTemplateSteps(tpl, { variablesTitle: "X" })[0].title).toBe("X");
    expect(allFields(steps)).toHaveLength(4);
  });
  it("sem variáveis não há passo de variáveis", () => {
    expect(buildTemplateSteps(parseTemplate("## A\nx"))[0].id).toBe("section-a");
  });
  it("findMissingRequired considera valores informados e padrão", () => {
    const steps = buildTemplateSteps(tpl);
    expect(findMissingRequired(steps, {}).map((f) => f.id)).toEqual(["name"]);
    expect(findMissingRequired(steps, { name: "  " }).map((f) => f.id)).toEqual(["name"]);
    expect(findMissingRequired(steps, { name: "Ana" })).toEqual([]);
    expect(findMissingRequired(steps, undefined)).toHaveLength(1);
  });
  it("resolveTitle: title > primeira obrigatória preenchida > título do modelo", () => {
    expect(resolveTitle(tpl, { title: " T ", name: "N" })).toBe("T");
    expect(resolveTitle(tpl, { name: " Ana " })).toBe("Ana");
    expect(resolveTitle(tpl, {})).toBe("Personagem");
    expect(resolveTitle({ variables: [], metadata: null }, null)).toBe("");
  });
  it("applyTemplateValues preenche variáveis e seções sem alterar o modelo", () => {
    const copia = JSON.stringify(tpl.metadata);
    const r = applyTemplateValues(tpl, { name: " Ana ", "group.role": "Herói", "section-aparencia": "Alta." });
    expect(r.metadata.data.name).toMatchObject({ content: "Ana", placeholder: "Nome", required: true });
    expect(r.metadata.data.group.role.content).toBe("Herói");
    expect(r.body).toBe("Preâmbulo.\n\n## Aparência\n\nAlta.\n\n## História\n\nTexto padrão.\n");
    expect(JSON.stringify(tpl.metadata)).toBe(copia);
  });
  it("seção sem resposta mantém o texto original, incluindo a citação", () => {
    const r = applyTemplateValues(tpl, {});
    expect(r.body).toContain("## Aparência\n\n> Descreva o rosto.");
  });
  it("renderTemplateFile devolve frontmatter + corpo e faz ida e volta", () => {
    const r = applyTemplateValues(tpl, { name: "Ana" });
    const texto = renderTemplateFile(r);
    expect(texto.startsWith("---")).toBe(true);
    const volta = parseTemplate(texto);
    expect(volta.variables.find((v) => v.id === "name").content).toBe("Ana");
    expect(volta.sections).toHaveLength(2);
  });
});

describe("template: corpo", () => {
  it("replaceFirstHeading troca o primeiro # ou insere no topo", () => {
    expect(replaceFirstHeading("# Velho\n\ntexto\n# Outro", "Novo")).toBe("# Novo\n\ntexto\n# Outro");
    expect(replaceFirstHeading("\n\ntexto", "Novo")).toBe("# Novo\n\ntexto");
    expect(replaceFirstHeading(null, "N")).toBe("# N\n\n");
  });
  it("replaceFirstHeading não confunde ## com título nível 1", () => {
    expect(replaceFirstHeading("## Sub\nx", "T")).toBe("# T\n\n## Sub\nx");
  });
  it("appendToBody preserva frontmatter e separa itens de lista com uma quebra", () => {
    expect(appendToBody("---\na: 1\n---\n- x\n", "- y")).toBe("---\na: 1\n---\n- x\n- y\n");
  });
  it("appendToBody usa linha em branco quando não é lista e lida com corpo vazio", () => {
    expect(appendToBody("texto", "- y")).toBe("texto\n\n- y\n");
    expect(appendToBody("", "- y")).toBe("- y\n");
  });
});
