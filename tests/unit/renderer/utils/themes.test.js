import { describe, it, expect, beforeEach } from "vitest";
import {
  THEME_VARS,
  BASE_COLORS,
  PRESET_THEMES,
  customThemes,
  allThemes,
  findTheme,
  isHexColor,
  saveCustomTheme,
  deleteCustomTheme,
  themeCss,
  applyThemeCss,
} from "../../../../src/renderer/utils/themes";
import { appSettings } from "../../../../src/renderer/utils/appSettings";

beforeEach(() => {
  appSettings.set("themes.custom", []);
  appSettings.set("ui.themePreset", "astra");
});

describe("themes", () => {
  it("todo tema predefinido define todas as variáveis nos dois modos, em hex", () => {
    for (const t of PRESET_THEMES) {
      for (const modo of ["light", "dark"]) {
        for (const v of THEME_VARS) expect(isHexColor(t[modo][v.id]), `${t.id}/${modo}/${v.id}`).toBe(true);
      }
    }
  });
  it("só o Astra é o padrão e usa as cores base", () => {
    expect(PRESET_THEMES.filter((t) => t.isDefault).map((t) => t.id)).toEqual(["astra"]);
    expect(findTheme("astra").light).toBe(BASE_COLORS.light);
  });
  it("ids únicos entre os temas", () => {
    const ids = PRESET_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("isHexColor valida só #rrggbb", () => {
    expect(isHexColor("#a1B2c3")).toBe(true);
    expect(isHexColor("#abc")).toBe(false);
    expect(isHexColor("a1b2c3")).toBe(false);
    expect(isHexColor("#12345g")).toBe(false);
    expect(isHexColor(null)).toBe(false);
  });
  it("findTheme resolve ids antigos (oceano, floresta, sepia)", () => {
    expect(findTheme("oceano").id).toBe("netuno");
    expect(findTheme("floresta").id).toBe("terra");
    expect(findTheme("sepia").id).toBe("saturno");
    expect(findTheme("nao-existe")).toBeUndefined();
  });
  it("saveCustomTheme guarda só cores válidas (as inválidas caem no Astra claro) e limita o nome", () => {
    const id = saveCustomTheme({ name: "  " + "x".repeat(60), light: { "--accent": "#112233", "--text": "vermelho", "--outra": "#000000" }, dark: {} });
    const t = findTheme(id);
    expect(t.name).toHaveLength(40);
    expect(t.builtin).toBe(false);
    expect(t.light["--accent"]).toBe("#112233");
    expect(t.light["--text"]).toBe(BASE_COLORS.light["--text"]);
    expect(t.light["--outra"]).toBeUndefined();
    expect(Object.keys(t.light)).toEqual(THEME_VARS.map((v) => v.id));
    expect(customThemes()).toHaveLength(1);
    expect(allThemes()).toHaveLength(PRESET_THEMES.length + 1);
  });
  it("saveCustomTheme com o mesmo id atualiza em vez de duplicar; nome vazio vira 'Meu tema'", () => {
    const id = saveCustomTheme({ id: "meu", name: "A", light: {}, dark: {} });
    saveCustomTheme({ id, name: "", light: {}, dark: {} });
    expect(customThemes()).toHaveLength(1);
    expect(findTheme("meu").name).toBe("Meu tema");
  });
  it("deleteCustomTheme apaga e volta ao Astra se estava em uso", () => {
    saveCustomTheme({ id: "t1", name: "T1", light: {}, dark: {} });
    saveCustomTheme({ id: "t2", name: "T2", light: {}, dark: {} });
    appSettings.set("ui.themePreset", "t1");
    deleteCustomTheme("t1");
    expect(customThemes().map((t) => t.id)).toEqual(["t2"]);
    expect(appSettings.get("ui.themePreset")).toBe("astra");
    appSettings.set("ui.themePreset", "t2");
    deleteCustomTheme("inexistente");
    expect(appSettings.get("ui.themePreset")).toBe("t2");
  });
  it("themeCss: vazio para o padrão/nulo; só variáveis CSS para os demais", () => {
    expect(themeCss(null)).toBe("");
    expect(themeCss(findTheme("astra"))).toBe("");
    const css = themeCss(findTheme("netuno"));
    expect(css).toContain(":root {");
    expect(css).toContain("body.dark-theme {");
    expect(css).toContain("--accent: #0a7ea4;");
    expect(css).toContain("--accent: #4cc9f0;");
    expect(css).toContain("--scrollbar-thumb:");
    // nenhuma declaração fora de variáveis (sem CSS livre)
    const declaracoes = css.split("\n").map((l) => l.trim()).filter((l) => l.endsWith(";"));
    expect(declaracoes.every((l) => l.startsWith("--"))).toBe(true);
  });
  it("applyThemeCss cria e reaproveita o style#astra-theme", () => {
    applyThemeCss(findTheme("terra"));
    expect(document.querySelectorAll("#astra-theme")).toHaveLength(1);
    expect(document.getElementById("astra-theme").textContent).toContain("--accent: #2e7d4f;");
    applyThemeCss(null);
    expect(document.querySelectorAll("#astra-theme")).toHaveLength(1);
    expect(document.getElementById("astra-theme").textContent).toBe("");
  });
});
