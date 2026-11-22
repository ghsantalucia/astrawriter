import { describe, it, expect, afterEach } from "vitest";
import {
  parseSkill,
  autoSkillColor,
  builtinSkills,
  marketSkills,
  builtinSkillNames,
  setCustomSkills,
  listSkills,
  getSkill,
} from "../../../../src/renderer/ai/skills/index";

const arquivo = (frontmatter, corpo = "Instruções.") => `---\n${frontmatter}\n---\n${corpo}\n`;

describe("skills: parseSkill", () => {
  it("lê os campos básicos e aplica padrões", () => {
    const s = parseSkill(arquivo("name: minha-skill\ntitle: Minha Skill\ndescription: Faz algo"), "user");
    expect(s).toMatchObject({
      slug: "minha-skill",
      id: "minha-skill",
      title: "Minha Skill",
      description: "Faz algo",
      author: "Desconhecido",
      version: "1.0.0",
      kind: "once",
      triggers: [],
      tools: [],
      tags: [],
      tokens: null,
      compact: true,
      native: false,
      web: false,
      inputs: [],
      modes: [],
      edited: false,
      sourceSlug: null,
      origin: "user",
      body: "Instruções.",
    });
  });
  it("sem name não é uma skill", () => {
    expect(parseSkill(arquivo("title: Sem nome"), "user")).toBeNull();
    expect(parseSkill("texto solto", "user")).toBeNull();
  });
  it("title cai para o name; id vem do campo id quando existe", () => {
    const s = parseSkill(arquivo("name: abc\nid: outro-id"), "builtin");
    expect(s.title).toBe("abc");
    expect(s.id).toBe("outro-id");
  });
  it("kind só aceita recurring; qualquer outro vale once", () => {
    expect(parseSkill(arquivo("name: a\nkind: recurring"), "user").kind).toBe("recurring");
    expect(parseSkill(arquivo("name: a\nkind: diaria"), "user").kind).toBe("once");
  });
  it("lê listas (triggers, tools, tags, modes) e converte itens em texto", () => {
    const s = parseSkill(arquivo("name: a\ntriggers: [sync, 5]\ntools: [read_file, list_files]\ntags: [x, y]\nmodes: [draft]"), "user");
    expect(s.triggers).toEqual(["sync", "5"]);
    expect(s.tools).toEqual(["read_file", "list_files"]);
    expect(s.tags).toEqual(["x", "y"]);
    expect(s.modes).toEqual(["draft"]);
  });
  it("lista que não é array vira vazia", () => {
    expect(parseSkill(arquivo("name: a\ntools: read_file"), "user").tools).toEqual([]);
  });
  it("flags native, web e edited exigem true; compact só é desligado por false", () => {
    const s = parseSkill(arquivo("name: a\nnative: true\nweb: true\nedited: true\ncompact: false"), "user");
    expect(s).toMatchObject({ native: true, web: true, edited: true, compact: false });
    const t = parseSkill(arquivo('name: a\nnative: "true"\nweb: sim\ncompact: nao'), "user");
    expect(t).toMatchObject({ native: false, web: false, compact: true });
  });
  it("tokens: lê bookTokens e spent numéricos; ignora lixo", () => {
    expect(parseSkill(arquivo("name: a\ntokens:\n  bookTokens: 1200\n  spent: 345"), "user").tokens).toEqual({ bookTokens: 1200, spent: 345 });
    expect(parseSkill(arquivo("name: a\ntokens:\n  bookTokens: abc"), "user").tokens).toEqual({ bookTokens: 0, spent: 0 });
    expect(parseSkill(arquivo("name: a\ntokens: 5"), "user").tokens).toBeNull();
  });
  it("inputs: itens simples viram texto", () => {
    const s = parseSkill(arquivo("name: a\ninputs:\n  - Nome do personagem\n  - Idade"), "user");
    expect(s.inputs).toEqual(["Nome do personagem", "Idade"]);
  });
  it("inputs: item com ': ' sem aspas (vira objeto no YAML) é juntado de volta em texto", () => {
    const s = parseSkill(arquivo("name: a\ninputs:\n  - Descreva o autor: nome e obra\n  - Outra pergunta"), "user");
    expect(s.inputs).toEqual(["Descreva o autor: nome e obra", "Outra pergunta"]);
  });
  it("inputs: itens vazios são descartados", () => {
    const s = parseSkill(arquivo('name: a\ninputs:\n  - ""\n  - Algo'), "user");
    expect(s.inputs).toEqual(["Algo"]);
  });
  it("origin do frontmatter vence o parâmetro; sourceSlug é lido", () => {
    const s = parseSkill(arquivo("name: a\norigin: market\nsourceSlug: original"), "user");
    expect(s.origin).toBe("market");
    expect(s.sourceSlug).toBe("original");
  });
  it("o corpo vem sem espaços nas pontas e sem o frontmatter", () => {
    const s = parseSkill("---\nname: a\n---\n\n\n  Passo 1\n\nPasso 2  \n\n", "user");
    expect(s.body).toBe("Passo 1\n\nPasso 2");
  });
  it("details em bloco YAML (|) preserva as quebras de linha", () => {
    const s = parseSkill("---\nname: a\ndetails: |\n  Linha 1\n\n  Linha 2\n---\ncorpo", "user");
    expect(s.details).toContain("Linha 1");
    expect(s.details).toContain("Linha 2");
    expect(s.details).toContain("\n");
  });
});

describe("skills: catálogo embutido", () => {
  it("há skills do app e do catálogo, todas com nome único e origem correta", () => {
    const nativas = builtinSkills();
    const loja = marketSkills();
    expect(nativas.length).toBeGreaterThan(0);
    expect(loja.length).toBeGreaterThan(0);
    expect(new Set(nativas.map((s) => s.slug)).size).toBe(nativas.length);
    expect(nativas.every((s) => s.origin === "builtin")).toBe(true);
    expect(loja.every((s) => s.origin === "market")).toBe(true);
    expect(builtinSkillNames().sort()).toEqual(nativas.map((s) => s.slug).sort());
  });
  it("toda skill tem descrição, corpo de instruções e só tools no formato snake_case", () => {
    for (const s of [...builtinSkills(), ...marketSkills()]) {
      expect(s.description.length, s.slug).toBeGreaterThan(0);
      expect(s.body.length, s.slug).toBeGreaterThan(20);
      for (const t of s.tools) expect(t, `${s.slug}:${t}`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
  it("a skill grounding-realista do catálogo permite pesquisa na web", () => {
    const g = marketSkills().find((s) => s.slug === "grounding-realista");
    expect(g).toBeTruthy();
    expect(g.web).toBe(true);
    expect(g.tools).toContain("register_issues");
  });
  it("nenhum item de inputs das skills embutidas é objeto (ficam sempre em texto)", () => {
    for (const s of [...builtinSkills(), ...marketSkills()]) {
      for (const i of s.inputs) expect(typeof i).toBe("string");
    }
  });
});

describe("skills: biblioteca (listSkills/getSkill)", () => {
  afterEach(() => setCustomSkills([]));

  it("antes da biblioteca carregar valem as skills do app", () => {
    setCustomSkills([]);
    const nomes = listSkills().map((s) => s.name);
    expect(nomes.sort()).toEqual(builtinSkillNames().sort());
    const primeira = builtinSkills()[0];
    expect(getSkill(primeira.slug)).toBe(primeira);
  });
  it("com a biblioteca carregada só valem as instaladas, marcando as não-nativas como custom", () => {
    setCustomSkills([
      { slug: "a", description: "Da", origin: "builtin" },
      { slug: "b", description: "Db", origin: "user" },
    ]);
    expect(listSkills()).toEqual([
      { name: "a", description: "Da", custom: false },
      { name: "b", description: "Db", custom: true },
    ]);
    expect(getSkill("b").slug).toBe("b");
    expect(getSkill(builtinSkills()[0].slug)).toBeUndefined();
    expect(getSkill("nao-existe")).toBeUndefined();
  });
});

describe("skills: autoSkillColor", () => {
  it("devolve #rrggbb estável para o mesmo nome", () => {
    const c = autoSkillColor("minha-skill");
    expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(autoSkillColor("minha-skill")).toBe(c);
  });
  it("nomes diferentes costumam ter cores diferentes e vazio usa um padrão", () => {
    const cores = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(autoSkillColor));
    expect(cores.size).toBeGreaterThan(3);
    expect(autoSkillColor("")).toBe(autoSkillColor(undefined));
  });
});
