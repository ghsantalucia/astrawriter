import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { dayOf, formatClock, ProductivityService } from "../../../../src/renderer/services/productivityService";
import { appSettings } from "../../../../src/renderer/utils/appSettings";
import { uiBus } from "../../../../src/renderer/events/uiBus";

const KEY = "astra.productivity.v1";

beforeEach(() => {
  localStorage.removeItem(KEY);
  appSettings.set("productivity.enabled", true);
  appSettings.set("productivity.auto", true);
  appSettings.set("productivity.goalMinutes", 0);
  appSettings.set("productivity.idleMinutes", 2);
  document.body.innerHTML = "";
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("productivityService: formatação", () => {
  it("dayOf usa a data local YYYY-MM-DD", () => {
    expect(dayOf(new Date(2024, 0, 5, 23, 59))).toBe("2024-01-05");
    expect(dayOf(new Date(2024, 11, 31, 0, 0))).toBe("2024-12-31");
  });
  it("formatClock converte milissegundos em HH:MM:SS", () => {
    expect(formatClock(0)).toBe("00:00:00");
    expect(formatClock(59_999)).toBe("00:00:59");
    expect(formatClock(61_000)).toBe("00:01:01");
    expect(formatClock(3_725_000)).toBe("01:02:05");
    expect(formatClock(100 * 3600_000)).toBe("100:00:00");
  });
});

describe("productivityService: registros", () => {
  it("carrega registros salvos, fechando o que ficou aberto", () => {
    localStorage.setItem(KEY, JSON.stringify([{ id: "a", start: "2024-01-01T10:00:00.000Z", activeMs: 5, day: "2024-01-01", open: true }]));
    const s = new ProductivityService();
    expect(s.records[0].open).toBe(false);
    expect(s.records[0].end).toBe("2024-01-01T10:00:00.000Z");
    expect(JSON.parse(localStorage.getItem(KEY))[0].open).toBe(false);
  });
  it("JSON corrompido ou não-lista vira lista vazia", () => {
    localStorage.setItem(KEY, "{quebrado");
    expect(new ProductivityService().records).toEqual([]);
    localStorage.setItem(KEY, '{"a":1}');
    expect(new ProductivityService().records).toEqual([]);
  });
  it("dailyTotals soma por dia, ordena e ignora registros sem tempo", () => {
    const s = new ProductivityService();
    s.records = [
      { id: "1", day: "2024-02-02", activeMs: 1000 },
      { id: "2", day: "2024-02-01", activeMs: 500 },
      { id: "3", day: "2024-02-02", activeMs: 2000 },
      { id: "4", day: "2024-02-03", activeMs: 0 },
    ];
    expect(s.dailyTotals()).toEqual([{ day: "2024-02-01", ms: 500 }, { day: "2024-02-02", ms: 3000 }]);
  });
  it("deleteRecord remove o registro (e zera o atual se for ele); clearRecords apaga tudo", () => {
    const s = new ProductivityService();
    s.records = [{ id: "a", day: "d", activeMs: 1 }, { id: "b", day: "d", activeMs: 1 }];
    s.current = s.records[0];
    s.deleteRecord("a");
    expect(s.current).toBeNull();
    expect(s.records.map((r) => r.id)).toEqual(["b"]);
    s.clearRecords();
    expect(s.records).toEqual([]);
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual([]);
  });
  it("só guarda os últimos 1000 registros", () => {
    const s = new ProductivityService();
    s.records = Array.from({ length: 1100 }, (_, i) => ({ id: String(i), day: "d", activeMs: 1 }));
    s.save();
    const salvos = JSON.parse(localStorage.getItem(KEY));
    expect(salvos).toHaveLength(1000);
    expect(salvos[0].id).toBe("100");
  });
});

describe("productivityService: estado e contagem", () => {
  it("status: pausado manualmente > ausente sem foco > ausente por inatividade > contando", () => {
    const s = new ProductivityService();
    s.focused = true;
    s.lastActivity = Date.now();
    expect(s.status()).toBe("paused");
    s.manualPaused = false;
    expect(s.status()).toBe("running");
    s.focused = false;
    expect(s.status()).toBe("away");
    s.focused = true;
    s.lastActivity = Date.now() - 3 * 60_000;
    expect(s.status()).toBe("away");
    // sem automático, a inatividade não conta
    appSettings.set("productivity.auto", false);
    expect(s.status()).toBe("running");
  });
  it("toggle alterna pausa e recomeça a contagem depois da meta cumprida", () => {
    const s = new ProductivityService();
    expect(s.manualPaused).toBe(true);
    s.toggle();
    expect(s.manualPaused).toBe(false);
    s.goalDone = true;
    s.toggle();
    expect(s.goalDone).toBe(false);
    expect(s.manualPaused).toBe(true);
  });
  it("tick cria um registro e acumula o tempo (no máximo 5 s por passo)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 4, 10, 12, 0, 0));
    const s = new ProductivityService();
    s.manualPaused = false;
    s.focused = true;
    s.lastActivity = Date.now();
    s.last = Date.now();
    vi.setSystemTime(Date.now() + 1000);
    s.lastActivity = Date.now();
    s.tick();
    expect(s.current).toMatchObject({ activeMs: 1000, day: "2024-05-10", open: true });
    vi.setSystemTime(Date.now() + 60_000);
    s.lastActivity = Date.now();
    s.tick();
    expect(s.current.activeMs).toBe(6000);
    expect(s.records).toHaveLength(1);
  });
  it("tick pausado não conta nada", () => {
    const s = new ProductivityService();
    s.tick();
    expect(s.current).toBeNull();
    expect(s.records).toEqual([]);
  });
  it("meta de tempo: ao atingir, fecha o registro, pausa, avisa e marca meta cumprida", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 4, 10, 12, 0, 0));
    appSettings.set("productivity.goalMinutes", 1);
    const s = new ProductivityService();
    vi.spyOn(s, "chime").mockImplementation(() => {});
    const emit = vi.spyOn(uiBus, "emit").mockImplementation(() => {});
    s.manualPaused = false;
    s.focused = true;
    s.last = Date.now();
    s.current = { id: "x", start: new Date().toISOString(), end: new Date().toISOString(), activeMs: 59_000, day: "2024-05-10", open: true };
    s.records.push(s.current);
    vi.setSystemTime(Date.now() + 2000);
    s.lastActivity = Date.now();
    s.tick();
    expect(s.goalDone).toBe(true);
    expect(s.manualPaused).toBe(true);
    expect(s.current).toBeNull();
    expect(s.records[0]).toMatchObject({ activeMs: 60_000, open: false });
    expect(s.chime).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("toast:show", expect.objectContaining({ type: "success" }));
  });
  it("reset encerra o registro atual e deixa pausado", () => {
    const s = new ProductivityService();
    s.manualPaused = false;
    s.current = { id: "x", activeMs: 1, day: "d", open: true };
    s.reset();
    expect(s.current).toBeNull();
    expect(s.manualPaused).toBe(true);
    expect(s.goalDone).toBe(false);
  });
  it("goalMs converte minutos e ignora valores negativos", () => {
    const s = new ProductivityService();
    expect(s.goalMs()).toBe(0);
    appSettings.set("productivity.goalMinutes", 60);
    expect(s.goalMs()).toBe(3_600_000);
  });
});

describe("productivityService: render", () => {
  it("sem a barra no DOM não faz nada", () => {
    expect(() => new ProductivityService().render()).not.toThrow();
  });
  it("mostra o tempo contado ou o que falta para a meta", () => {
    document.body.innerHTML = '<div id="productivity-bar"></div><span id="prod-time"></span><span id="prod-status"></span><button id="prod-toggle"></button>';
    const s = new ProductivityService();
    s.current = { activeMs: 65_000 };
    s.render();
    expect(document.getElementById("prod-time").textContent).toBe("00:01:05");
    expect(document.getElementById("productivity-bar").hidden).toBe(false);
    expect(document.getElementById("productivity-bar").dataset.goal).toBe("off");
    appSettings.set("productivity.goalMinutes", 2);
    s.render();
    expect(document.getElementById("prod-time").textContent).toBe("00:00:55");
    expect(document.getElementById("productivity-bar").dataset.goal).toBe("on");
    s.goalDone = true;
    s.render();
    expect(document.getElementById("prod-status").textContent).toContain("meta cumprida");
    expect(document.getElementById("prod-time").textContent).toBe("00:00:00");
  });
  it("a barra fica oculta com o cronômetro desativado", () => {
    document.body.innerHTML = '<div id="productivity-bar"></div>';
    appSettings.set("productivity.enabled", false);
    new ProductivityService().render();
    expect(document.getElementById("productivity-bar").hidden).toBe(true);
  });
});
