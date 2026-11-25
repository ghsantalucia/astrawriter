import { describe, it, expect } from "vitest";
import {
  PROFILES,
  PROFILE_OPTIONS,
  DEFAULT_PROFILE,
  detectProfile,
  resolveAnalysis,
  toSaved,
} from "../../../../src/renderer/ai/profiles";

const perfil = (id) => PROFILES.find((p) => p.id === id);

describe("profiles: consistência", () => {
  it("todo perfil define todas as opções com valores válidos", () => {
    for (const p of PROFILES) {
      for (const o of PROFILE_OPTIONS) {
        expect(p.values, `${p.id}.${o.id}`).toHaveProperty(o.id);
        if (o.type === "bool") expect(typeof p.values[o.id]).toBe("boolean");
        if (o.type === "select") expect(o.choices.map((c) => c.value)).toContain(p.values[o.id]);
      }
    }
  });
  it("ids únicos e o perfil padrão existe", () => {
    expect(new Set(PROFILES.map((p) => p.id)).size).toBe(PROFILES.length);
    expect(perfil(DEFAULT_PROFILE)).toBeTruthy();
  });
  it("orçamento e histórico crescem do mais econômico ao mais completo", () => {
    const ordem = ["minimal", "economic", "balanced", "complete", "ultra"].map(perfil);
    for (let i = 1; i < ordem.length; i++) {
      expect(ordem[i].values.budgetTokens).toBeGreaterThanOrEqual(ordem[i - 1].values.budgetTokens);
      expect(ordem[i].values.historyLimit).toBeGreaterThanOrEqual(ordem[i - 1].values.historyLimit);
    }
  });
  it("nenhum perfil liga o modo apenas conversa", () => {
    expect(PROFILES.every((p) => p.values.chatOnly === false)).toBe(true);
  });
});

describe("profiles: detectProfile", () => {
  it("reconhece cada perfil pelos próprios valores", () => {
    for (const p of PROFILES) expect(detectProfile(p.values)).toBe(p.id);
  });
  it("uma opção diferente leva a custom", () => {
    expect(detectProfile({ ...perfil("balanced").values, tone: true })).toBe("custom");
    expect(detectProfile({})).toBe("custom");
  });
});

describe("profiles: resolveAnalysis", () => {
  it("sem nada salvo vale o perfil padrão", () => {
    const r = resolveAnalysis(undefined);
    expect(r.profile).toBe(DEFAULT_PROFILE);
    expect(r).toMatchObject(perfil(DEFAULT_PROFILE).values);
    expect(resolveAnalysis({}).profile).toBe(DEFAULT_PROFILE);
  });
  it("perfil nomeado define tudo, ignorando opções soltas", () => {
    const r = resolveAnalysis({ profile: "ultra", tone: false, budgetTokens: 1 });
    expect(r).toEqual({ ...perfil("ultra").values, profile: "ultra" });
  });
  it("custom usa as opções salvas e completa o resto com o Equilibrado", () => {
    const r = resolveAnalysis({ profile: "custom", tone: true, historyLimit: 6 });
    expect(r.tone).toBe(true);
    expect(r.historyLimit).toBe(6);
    expect(r.timeline).toBe(perfil("balanced").values.timeline);
    expect(r.profile).toBe("custom");
  });
  it("configuração antiga (autoAnalyze/verify/budgetTokens) vira personalizada equivalente", () => {
    const r = resolveAnalysis({ autoAnalyze: true, budgetTokens: 12345 });
    expect(r.autoAnalyze).toBe(true);
    expect(r.verify).toBe(true);
    expect(r.budgetTokens).toBe(12345);
    expect(r.profile).toBe("custom");
  });
  it("verify salvo como false é respeitado", () => {
    expect(resolveAnalysis({ verify: false }).verify).toBe(false);
  });
  // Regressão (bug já corrigido; profiles.ts, resolveAnalysis): o laço copia raw.budgetTokens sem validar e o `if (budget > 0)` só
  // sobrescreve quando válido; "abc" ou -5 permanecem como budgetTokens. Esperado: cair no orçamento do perfil padrão.
  it("orçamento inválido ou negativo é ignorado", () => {
    const base = perfil(DEFAULT_PROFILE).values.budgetTokens;
    expect(resolveAnalysis({ autoAnalyze: true, budgetTokens: "abc" }).budgetTokens).toBe(base);
    expect(resolveAnalysis({ autoAnalyze: true, budgetTokens: -5 }).budgetTokens).toBe(base);
  });
  it("opções soltas que coincidem com um perfil são detectadas como esse perfil", () => {
    const r = resolveAnalysis({ ...perfil("economic").values });
    expect(r.profile).toBe("economic");
  });
  it("toSaved acrescenta o id do perfil", () => {
    expect(toSaved("custom", { a: 1 })).toEqual({ a: 1, profile: "custom" });
  });
});
