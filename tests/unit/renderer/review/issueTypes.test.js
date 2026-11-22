import { describe, it, expect } from "vitest";
import {
  CATEGORIES,
  ISSUE_TYPES,
  typeInfo,
  categoryInfo,
  normalizeSeverity,
} from "../../../../src/renderer/review/issueTypes";

describe("issueTypes: catálogo", () => {
  it("todo tipo aponta para uma categoria existente, com severidade e origem válidas", () => {
    const categorias = new Set(CATEGORIES.map((c) => c.id));
    for (const [id, t] of Object.entries(ISSUE_TYPES)) {
      expect(categorias.has(t.category), id).toBe(true);
      expect(["error", "warning"]).toContain(t.severity);
      expect(["system", "ai"]).toContain(t.source);
      expect(t.label.length).toBeGreaterThan(0);
    }
  });
  it("tipos da categoria 'tips' nunca são erro (vermelho)", () => {
    for (const t of Object.values(ISSUE_TYPES).filter((x) => x.category === "tips")) expect(t.severity).toBe("warning");
  });
  it("toda categoria tem pelo menos um tipo", () => {
    for (const c of CATEGORIES) expect(Object.values(ISSUE_TYPES).some((t) => t.category === c.id), c.id).toBe(true);
  });
  it("ids de categorias são únicos", () => {
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(CATEGORIES.length);
  });
});

describe("issueTypes: funções", () => {
  it("typeInfo devolve o tipo conhecido", () => {
    expect(typeInfo("broken-link")).toBe(ISSUE_TYPES["broken-link"]);
  });
  it("typeInfo de tipo desconhecido cai em dica amarela da IA com o próprio id como rótulo", () => {
    expect(typeInfo("xyz")).toEqual({ label: "xyz", category: "tips", severity: "warning", source: "ai", description: "" });
  });
  it("categoryInfo acha por id ou devolve undefined", () => {
    expect(categoryInfo("links").label).toBe("Links");
    expect(categoryInfo("nada")).toBeUndefined();
  });
  it("normalizeSeverity: tips é sempre warning; senão só 'error' vale erro", () => {
    expect(normalizeSeverity("tips", "error")).toBe("warning");
    expect(normalizeSeverity("links", "error")).toBe("error");
    expect(normalizeSeverity("links", "warning")).toBe("warning");
    expect(normalizeSeverity("links", "qualquer")).toBe("warning");
    expect(normalizeSeverity("links", undefined)).toBe("warning");
  });
});
