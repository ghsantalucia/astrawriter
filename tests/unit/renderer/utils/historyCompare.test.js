import { describe, it, expect } from "vitest";
import { buildComparison } from "../../../../src/renderer/utils/historyCompare";

describe("historyCompare.buildComparison", () => {
  it("textos idênticos: identical true e sem marcação de diferença", () => {
    const r = buildComparison("---\na: 1\n---\nOlá\n\nMundo", "---\na: 1\n---\nOlá\n\nMundo");
    expect(r.identical).toBe(true);
    expect(r.metadataOnly).toBe(false);
    expect(r.currentHtml).not.toContain("diff-seg-removed");
    expect(r.versionHtml).not.toContain("diff-seg-added");
  });
  it("marca trechos removidos à esquerda e adicionados à direita", () => {
    const r = buildComparison("um\ndois", "um\ntrês");
    expect(r.identical).toBe(false);
    expect(r.currentHtml).toContain("diff-seg-removed");
    expect(r.currentHtml).toContain("dois");
    expect(r.versionHtml).toContain("diff-seg-added");
    expect(r.versionHtml).toContain("três");
    expect(r.currentHtml).not.toContain("três");
  });
  it("só mudou o frontmatter: metadataOnly true", () => {
    const r = buildComparison("---\na: 1\n---\ncorpo", "---\na: 2\n---\ncorpo");
    expect(r.metadataOnly).toBe(true);
    expect(r.identical).toBe(false);
  });
  it("envolve cada trecho em div.diff-seg com o Markdown interpretado", () => {
    const r = buildComparison("**forte**", "**forte**");
    expect(r.currentHtml).toContain('<div class="diff-seg">');
    expect(r.currentHtml).toContain("<strong>forte</strong>");
  });
  it("aceita null/undefined", () => {
    const r = buildComparison(null, undefined);
    expect(r.identical).toBe(true);
    expect(r.currentHtml).toBe("");
    expect(r.versionHtml).toBe("");
  });
});
