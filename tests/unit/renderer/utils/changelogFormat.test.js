import { describe, it, expect } from "vitest";
import { formatDateTime, describeActor, displayPath, summarizeEntry, toViewEntry } from "../../../../src/renderer/utils/changelogFormat";

describe("changelogFormat", () => {
  it("formatDateTime formata em horário local DD/MM/AAAA HH:MM:SS", () => {
    const d = new Date(2024, 0, 5, 7, 8, 9);
    expect(formatDateTime(d.toISOString())).toBe("05/01/2024 07:08:09");
  });
  it("formatDateTime devolve traço para vazio ou inválido", () => {
    expect(formatDateTime("")).toBe("—");
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("lixo")).toBe("—");
  });
  it("describeActor distingue IA, sistema e usuário", () => {
    expect(describeActor({ type: "ai", provider: "p", model: "m" })).toEqual({ label: "Assistente", detail: "p · m", className: "actor-ai" });
    expect(describeActor({ type: "ai", model: "m" }).detail).toBe("m");
    expect(describeActor({ type: "system" }).className).toBe("actor-system");
    expect(describeActor(undefined)).toEqual({ label: "Usuário", detail: "", className: "actor-user" });
  });
  it("displayPath traduz '.' conforme a ação", () => {
    expect(displayPath(".", "setting")).toBe("(configurações)");
    expect(displayPath(".", "update")).toBe("(livro inteiro)");
    expect(displayPath("a/b.md", "update")).toBe("a/b.md");
  });
  it("summarizeEntry cobre ações de arquivo", () => {
    expect(summarizeEntry({ action: "update", meta: { added: 3, removed: 1 } })).toBe("+3 / −1 linhas");
    expect(summarizeEntry({ action: "update" })).toBe("+0 / −0 linhas");
    expect(summarizeEntry({ action: "delete", meta: { removed: 4 } })).toBe("arquivo excluído (4 linhas guardadas)");
    expect(summarizeEntry({ action: "create" })).toBe("arquivo criado");
    expect(summarizeEntry({ action: "read" })).toBe("arquivo lido");
    expect(summarizeEntry({ action: "read", meta: { tool: "t", count: 2 } })).toBe("lido por t (2 arquivos)");
    expect(summarizeEntry({ action: "read", meta: { tool: "t" } })).toBe("lido por t");
    expect(summarizeEntry({ action: "restore", meta: { toEntryId: 7, removed: 2 } })).toContain("#7");
    expect(summarizeEntry({ action: "move", meta: { from: "x.md" } })).toBe("movido de x.md");
    expect(summarizeEntry({ action: "autosave", meta: { saves: 3, added: 1, removed: 2 } })).toContain("3x");
    expect(summarizeEntry({ action: "autosave" })).toContain("1x");
    expect(summarizeEntry({ action: "original" })).toContain("antes do primeiro registro");
    expect(summarizeEntry({ action: "desconhecida" })).toBe("");
  });
  it("summarizeEntry cobre configurações", () => {
    expect(summarizeEntry({ action: "setting", meta: { setting: "ai.model", from: "a", to: "b" } })).toBe("modelo de IA: a → b");
    expect(summarizeEntry({ action: "setting", meta: { setting: "ui.zoom", from: 1, to: 2 } })).toBe("ui.zoom: 1 → 2");
  });
  it("summarizeEntry cobre revisões", () => {
    const r = (meta) => summarizeEntry({ action: "review", meta });
    expect(r({ kind: "found", count: 3, types: { spell: 2, link: 1 } })).toBe("3 issue(s) encontrado(s) (2× spell, 1× link)");
    expect(r({ kind: "found", count: 1 })).toBe("1 issue(s) encontrado(s)");
    expect(r({ kind: "scan", count: 2 })).toBe("varredura: 2 issue(s) em ? arquivo(s)");
    expect(r({ kind: "type-dismissed", type: "spell" })).toBe("tipo dispensado: spell");
    expect(r({ kind: "type-restored", type: "spell" })).toBe("tipo reativado: spell");
    expect(r({ kind: "dictionary", word: "xis" })).toBe('"xis" adicionada ao dicionário do livro (0 issue(s) removido(s))');
    expect(r({ kind: "analysis", count: 2 })).toContain("2 arquivo(s), 0 verificação(ões), 0 pendência(s)");
    expect(r({ kind: "qualquer" })).toBe("qualquer");
    expect(r({})).toBe("revisão");
  });
  it("toViewEntry monta os dados de exibição", () => {
    const v = toViewEntry({ id: 1, action: "update", path: "a.md", ts: new Date(2024, 5, 1, 10, 0, 0).toISOString(), content: "x", actor: { type: "ai", provider: "p", model: "m" }, meta: { added: 1, removed: 0 } });
    expect(v).toMatchObject({ id: 1, time: "01/06/2024 10:00:00", actorLabel: "Assistente", actorDetail: "p · m", actorClass: "actor-ai", path: "a.md", purged: false, hasContent: true, summary: "+1 / −0 linhas" });
  });
  it("toViewEntry: registro purgado sem conteúdo; 'original' sem autor; sem ts mostra traço", () => {
    expect(toViewEntry({ action: "update", path: "a", content: "x", purged: true })).toMatchObject({ purged: true, hasContent: false, time: "—" });
    expect(toViewEntry({ action: "original", path: "a" }).actorLabel).toBe("");
  });
});
