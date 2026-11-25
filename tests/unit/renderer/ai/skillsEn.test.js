import { describe, it, expect, afterEach } from "vitest";
import { parseSkill, setCustomSkills, listSkills, getSkill } from "../../../../src/renderer/ai/skills/index";
import { buildSystemPrompt, buildBookMap } from "../../../../src/renderer/ai/prompts/index";
import { setLanguage, registerMessages } from "../../../../src/shared/i18n";
import aiPrompts from "../../../../src/shared/i18n/en/ai-prompts.json";

const load = (glob) => Object.fromEntries(Object.entries(glob).map(([p, raw]) => [p.split("/").pop(), parseSkill(raw, "builtin")]));
const pt = load(import.meta.glob("../../../../src/renderer/ai/skills/*.md", { query: "?raw", import: "default", eager: true }));
const en = load(import.meta.glob("../../../../src/renderer/ai/skills/en/*.md", { query: "?raw", import: "default", eager: true }));
const ptMarket = load(import.meta.glob("../../../../src/renderer/ai/skills/market/*.md", { query: "?raw", import: "default", eager: true }));
const enMarket = load(import.meta.glob("../../../../src/renderer/ai/skills/market/en/*.md", { query: "?raw", import: "default", eager: true }));

afterEach(() => {
  setLanguage("pt-BR");
  setCustomSkills([]);
});

describe.each([
  ["app", pt, en, 11],
  ["catálogo", ptMarket, enMarket, 6],
])("skills em inglês (%s)", (_n, ptSet, enSet, count) => {
  it("tem uma versão inglesa para cada skill", () => {
    expect(Object.keys(ptSet)).toHaveLength(count);
    expect(Object.keys(enSet).sort()).toEqual(Object.keys(ptSet).sort());
  });
  it("mantém os campos técnicos idênticos e traduz os textos", () => {
    for (const [file, p] of Object.entries(ptSet)) {
      const e = enSet[file];
      for (const k of ["slug", "id", "kind", "tools", "tokens", "version", "author", "triggers", "modes", "native", "web", "compact"]) {
        expect(e[k], `${file}.${k}`).toEqual(p[k]);
      }
      expect(e.inputs).toHaveLength(p.inputs.length);
      expect(e.tags).toHaveLength(p.tags.length);
      expect(e.title).not.toBe(p.title);
      expect(e.description).not.toBe(p.description);
      expect(e.body).not.toBe(p.body);
    }
  });
});

describe("skills: listagem por idioma", () => {
  it("em inglês lista os títulos/descrições em inglês; em português, como estão", () => {
    setCustomSkills([pt["corrigir-pendencias.md"], { ...pt["conexoes-do-livro.md"], edited: true }]);
    setLanguage("en");
    const list = listSkills();
    expect(list.find((s) => s.name === "corrigir-pendencias").description).toBe(en["corrigir-pendencias.md"].description);
    expect(list.find((s) => s.name === "conexoes-do-livro").description).toBe(pt["conexoes-do-livro.md"].description);
    expect(getSkill("corrigir-pendencias").body).toBe(en["corrigir-pendencias.md"].body);
    setLanguage("pt-BR");
    expect(listSkills().find((s) => s.name === "corrigir-pendencias").description).toBe(pt["corrigir-pendencias.md"].description);
  });
  it("sem biblioteca carregada, em inglês usa as skills do app em inglês", () => {
    setLanguage("en");
    const list = listSkills();
    expect(list).toHaveLength(11);
    expect(list.find((s) => s.name === "eventos-do-manuscrito").description).toBe(en["eventos-do-manuscrito.md"].description);
  });
});

describe("prompt de sistema por idioma", () => {
  it("em português mantém o texto de sempre; em inglês usa o prompt e o contexto em inglês", () => {
    registerMessages("en", aiPrompts);
    const state = { currentBookMetadata: { book_title: "Livro X" } };
    const ptText = buildSystemPrompt(state);
    expect(ptText).toContain("## Contexto atual\n- Livro: Livro X\n- Modo de trabalho: Assistente de escrita.");
    expect(ptText).toContain("Você é o assistente de IA do Astra Writer");
    setLanguage("en");
    const enText = buildSystemPrompt(state, true);
    expect(enText).toContain("You are the AI of Astra Writer");
    expect(enText).toContain("## Current context\n- Book: Livro X\n- Working mode: Writing assistant.");
    expect(buildSystemPrompt({}, false)).toContain("(no book selected)");
  });
  it("mapa do livro traduzido", () => {
    registerMessages("en", aiPrompts);
    const files = [{ relPath: "a.md", key: "a", metadata: { aiRead: true, title: "A" } }];
    expect(buildBookMap(files, new Set(["a.md"]))).toContain("A [só leitura] (inalterado desde a última execução)");
    setLanguage("en");
    expect(buildBookMap(files, new Set(["a.md"]))).toContain("A [read-only] (unchanged since the last run)");
  });
});
