import { describe, it, expect, vi } from "vitest";
import { isAppLink, parseAppLink, openAppLink } from "../../../../src/renderer/utils/appLinks";

describe("appLinks", () => {
  it("isAppLink reconhece o esquema app: sem diferenciar maiúsculas", () => {
    expect(isAppLink("app:settings")).toBe(true);
    expect(isAppLink("  APP:settings")).toBe(true);
    expect(isAppLink("https://x.com")).toBe(false);
    expect(isAppLink("")).toBe(false);
    expect(isAppLink(null)).toBe(false);
  });
  it("interpreta settings", () => {
    expect(parseAppLink("app:settings")).toEqual({ type: "settings" });
    expect(parseAppLink("app:/settings")).toEqual({ type: "settings" });
  });
  it("settings com subcaminho é inválido", () => {
    expect(parseAppLink("app:settings/x")).toBeNull();
  });
  it("interpreta centrais com e sem aba", () => {
    expect(parseAppLink("app:central/ai")).toEqual({ type: "central", central: "ai" });
    expect(parseAppLink("app:central/ai/model")).toEqual({ type: "central", central: "ai", tab: "model" });
    expect(parseAppLink("app:central/SYSTEM/Some-tab")).toEqual({ type: "central", central: "system", tab: "some-tab" });
  });
  it("ignora query e fragmento", () => {
    expect(parseAppLink("app:central/book?x=1#y")).toEqual({ type: "central", central: "book" });
  });
  it("rejeita central desconhecida, aba inválida, caminho longo e links não-app", () => {
    expect(parseAppLink("app:central/foo")).toBeNull();
    expect(parseAppLink("app:central/ai/a1")).toBeNull();
    expect(parseAppLink("app:central/ai/model/extra")).toBeNull();
    expect(parseAppLink("app:")).toBeNull();
    expect(parseAppLink("file.md")).toBeNull();
  });
  it("openAppLink emite o evento certo e devolve true", () => {
    const uiBus = { emit: vi.fn() };
    expect(openAppLink("app:settings", uiBus)).toBe(true);
    expect(uiBus.emit).toHaveBeenCalledWith("settings:open");
    expect(openAppLink("app:central/ai/model", uiBus)).toBe(true);
    expect(uiBus.emit).toHaveBeenLastCalledWith("central:open", { central: "ai", tab: "model" });
  });
  it("openAppLink com link inválido não emite nada", () => {
    const uiBus = { emit: vi.fn() };
    expect(openAppLink("app:central/zzz", uiBus)).toBe(false);
    expect(uiBus.emit).not.toHaveBeenCalled();
  });
});
