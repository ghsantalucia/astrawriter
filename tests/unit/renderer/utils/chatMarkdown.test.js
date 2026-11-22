import { describe, it, expect } from "vitest";
import { renderChatMarkdown } from "../../../../src/renderer/utils/chatMarkdown";

// Obs.: o DOMPurify roda sobre o happy-dom, que não implementa a sanitização completa (script/onerror/javascript:
// passam); essa verificação de segurança fica para o E2E no Electron real.
describe("chatMarkdown.renderChatMarkdown", () => {
  it("converte negrito, listas e quebras de linha simples", () => {
    const html = renderChatMarkdown("**oi**\nlinha 2\n\n- a\n- b");
    expect(html).toContain("<strong>oi</strong>");
    expect(html).toContain("<br");
    expect(html).toContain("<li>a</li>");
  });
  it("vazio/null devolve string vazia", () => {
    expect(renderChatMarkdown("")).toBe("");
    expect(renderChatMarkdown(null)).toBe("");
  });
  it("interpreta tabelas GFM e código inline", () => {
    const html = renderChatMarkdown("|a|b|\n|-|-|\n|1|2|\n\n`x`");
    expect(html).toContain("<th>a</th>");
    expect(html).toContain("<td>2</td>");
    expect(html).toContain("<code>x</code>");
  });
});
