import { describe, it, expect } from "vitest";
import { coerceSetting, SETTING_DEFS, appSettings } from "../../../../src/renderer/utils/appSettings";

const def = (id) => SETTING_DEFS.find((d) => d.id === id);

describe("appSettings.coerceSetting", () => {
  it("bool aceita true e 'true' apenas", () => {
    const d = def("ui.night.enabled");
    expect(coerceSetting(d, true)).toBe(true);
    expect(coerceSetting(d, "true")).toBe(true);
    expect(coerceSetting(d, "false")).toBe(false);
    expect(coerceSetting(d, 1)).toBe(false);
  });
  it("number converte, limita a min/max e rejeita não-numéricos", () => {
    const d = def("ui.zoom");
    expect(coerceSetting(d, "120")).toBe(120);
    expect(coerceSetting(d, 5)).toBe(70);
    expect(coerceSetting(d, 999)).toBe(200);
    expect(() => coerceSetting(d, "abc")).toThrow(/número/);
    expect(() => coerceSetting(d, Infinity)).toThrow();
  });
  it("time exige HH:MM válido", () => {
    const d = def("ui.night.from");
    expect(coerceSetting(d, " 07:30 ")).toBe("07:30");
    expect(() => coerceSetting(d, "24:00")).toThrow(/HH:MM/);
    expect(() => coerceSetting(d, "7:30")).toThrow();
    expect(() => coerceSetting(d, "12:60")).toThrow();
  });
  it("select exige uma das opções, exceto fontes do editor (nome livre)", () => {
    expect(coerceSetting(def("ui.theme"), "light")).toBe("light");
    expect(() => coerceSetting(def("ui.theme"), "azul")).toThrow(/Opções: light, dark/);
    expect(coerceSetting(def("editor.fontBody"), "Minha Fonte")).toBe("Minha Fonte");
  });
  it("text converte para string", () => {
    expect(coerceSetting(def("backup.folder"), null)).toBe("");
    expect(coerceSetting(def("backup.folder"), 12)).toBe("12");
  });
  it("ids das definições são únicos e os padrões respeitam os limites", () => {
    const ids = SETTING_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of SETTING_DEFS) {
      if (d.type === "number") {
        expect(d.default).toBeGreaterThanOrEqual(d.min);
        expect(d.default).toBeLessThanOrEqual(d.max);
      }
      expect(["a", "b", "c"]).toContain(d.risk);
    }
  });
});

describe("appSettings (armazenamento)", () => {
  it("get devolve o padrão; set valida, grava e persiste em localStorage", () => {
    expect(appSettings.get("editor.fontSize")).toBe(16);
    expect(appSettings.set("editor.fontSize", "50")).toBe(40);
    expect(appSettings.get("editor.fontSize")).toBe(40);
    expect(JSON.parse(localStorage.getItem("astra.settings.v1"))["editor.fontSize"]).toBe(40);
    expect(() => appSettings.set("editor.fontSize", "x")).toThrow();
    expect(appSettings.get("editor.fontSize")).toBe(40);
  });
  it("valores internos têm padrão próprio", () => {
    expect(appSettings.get("backup.lastAt")).toBe(0);
    expect(appSettings.get("shortcuts.custom")).toEqual({});
  });
});
