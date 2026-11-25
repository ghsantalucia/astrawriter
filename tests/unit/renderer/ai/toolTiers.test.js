import { describe, it, expect, vi, beforeEach } from "vitest";

// Registro de tools falso: o módulo real puxa o app inteiro.
const { NOMES, registro } = vi.hoisted(() => ({
  NOMES: ["show_buttons", "read_file", "write_file", "replace_in_file", "append_to_file", "list_files", "extra_tool", "outra_tool"],
  registro: { execute: vi.fn(async (name) => ({ output: `ok:${name}`, isError: false })) },
}));

vi.mock("../../../../src/renderer/ai/aiTools", () => {
  const defs = NOMES.map((name) => ({
    name,
    description: name === "extra_tool" ? "Faz algo extra. Depois faz mais coisa." : `Descrição de ${name}.`,
    parameters: { type: "object", properties: {} },
  }));
  return {
    toolRegistry: {
      tools: new Map(defs.map((d) => [d.name, d])),
      getDefinitions: () => defs,
      execute: registro.execute,
    },
  };
});

import { ToolView, TOOLS_MODES, SPECS_TOOL } from "../../../../src/renderer/ai/toolTiers";

const nomes = (view) => view.getDefinitions().map((d) => d.name);
let livro = 0;
const novoLivro = () => `livro-${++livro}`;

beforeEach(() => registro.execute.mockClear());

describe("toolTiers.ToolView: modos", () => {
  it("modo desconhecido vira 'all'", () => {
    expect(TOOLS_MODES).toEqual(["minimal", "summary", "popular", "all"]);
    expect(new ToolView("zzz", novoLivro()).mode).toBe("all");
  });
  it("all: todas as tools completas, sem sumário nem get_tool_specs", () => {
    const v = new ToolView("all", novoLivro());
    expect(nomes(v).sort()).toEqual([...NOMES].sort());
    expect(v.usesSummary).toBe(false);
    expect(v.promptNote()).toBe("");
  });
  it("minimal: só show_buttons e read_file, e o aviso de que não escreve", () => {
    const v = new ToolView("minimal", novoLivro());
    expect(nomes(v).sort()).toEqual(["read_file", "show_buttons"]);
    expect(v.usesSummary).toBe(false);
    expect(v.promptNote()).toContain("Modo de uso mínimo");
  });
  it("summary: edição pontual completa + get_tool_specs; sumário lista as demais", () => {
    const v = new ToolView("summary", novoLivro());
    expect(nomes(v).sort()).toEqual(["append_to_file", "get_tool_specs", "replace_in_file", "show_buttons"].sort());
    expect(v.usesSummary).toBe(true);
    const nota = v.promptNote();
    expect(nota).toContain("- extra_tool: Faz algo extra.");
    expect(nota).not.toContain("- replace_in_file:");
    expect(nota).toContain(SPECS_TOOL);
  });
  it("popular: acrescenta as mais usadas existentes", () => {
    const v = new ToolView("popular", novoLivro());
    expect(nomes(v)).toEqual(expect.arrayContaining(["read_file", "write_file", "list_files", "get_tool_specs"]));
    expect(nomes(v)).not.toContain("extra_tool");
  });
  it("allow (execução de skill): só as tools declaradas existentes mais as do chat, sem sumário", () => {
    const v = new ToolView("summary", novoLivro(), ["read_file", "inexistente"]);
    expect(nomes(v).sort()).toEqual(["read_file", "show_buttons"]);
    expect(v.usesSummary).toBe(false);
  });
  it("compact mantém as descrições curtas (duas primeiras frases)", () => {
    const d = new ToolView("all", novoLivro(), null, true).getDefinitions().find((x) => x.name === "extra_tool");
    expect(d.description).toBe("Faz algo extra. Depois faz mais coisa.");
  });
});

describe("toolTiers.ToolView: liberação por get_tool_specs", () => {
  it("get_tool_specs libera a tool pelo resto da sessão do livro", async () => {
    const book = novoLivro();
    const v = new ToolView("summary", book);
    expect(nomes(v)).not.toContain("extra_tool");
    const r = await v.execute(SPECS_TOOL, { names: ["extra_tool", "nao_existe"] });
    expect(r.isError).toBe(false);
    const dados = JSON.parse(r.output);
    expect(dados.liberadas.map((d) => d.name)).toEqual(["extra_tool"]);
    expect(dados.desconhecidas).toEqual(["nao_existe"]);
    // nova visão do mesmo livro mantém a liberação
    expect(nomes(new ToolView("summary", book))).toContain("extra_tool");
  });
  it("trocar de livro zera as tools liberadas", async () => {
    const a = novoLivro();
    await new ToolView("summary", a).execute(SPECS_TOOL, { names: ["extra_tool"] });
    expect(nomes(new ToolView("summary", novoLivro()))).not.toContain("extra_tool");
  });
  it("specs sem nomes ou só com desconhecidos é erro", () => {
    const v = new ToolView("summary", novoLivro());
    expect(v.specs({}).isError).toBe(true);
    expect(v.specs({ names: [] }).isError).toBe(true);
    expect(v.specs({ names: ["xxx"] }).isError).toBe(true);
    expect(v.specs(undefined).output).toContain("names");
  });
});

describe("toolTiers.ToolView.execute", () => {
  it("recusa tool não liberada no modo sumário, orientando a usar get_tool_specs", async () => {
    const r = await new ToolView("summary", novoLivro()).execute("extra_tool", {}, {});
    expect(r.isError).toBe(true);
    expect(r.output).toContain(SPECS_TOOL);
    expect(registro.execute).not.toHaveBeenCalled();
  });
  it("recusa tool fora do modo mínimo", async () => {
    const r = await new ToolView("minimal", novoLivro()).execute("write_file", {}, {});
    expect(r.isError).toBe(true);
    expect(r.output).toContain("não está disponível");
  });
  it("executa tool oferecida, repassando argumentos e contexto", async () => {
    const ctx = { x: 1 };
    const r = await new ToolView("minimal", novoLivro()).execute("read_file", { path: "a" }, ctx);
    expect(r.output).toBe("ok:read_file");
    expect(registro.execute).toHaveBeenCalledWith("read_file", { path: "a" }, ctx);
  });
  it("get_tool_specs fora do modo sumário não é tratada como especial", async () => {
    const r = await new ToolView("all", novoLivro()).execute(SPECS_TOOL, { names: ["x"] }, {});
    expect(r.isError).toBe(true);
    expect(registro.execute).not.toHaveBeenCalled();
  });
});
