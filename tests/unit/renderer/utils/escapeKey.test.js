import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { setupEscapeKey } from "../../../../src/renderer/utils/escapeKey";
import { uiBus } from "../../../../src/renderer/events/uiBus";

// O ouvinte é global (document, captura): liga uma vez e troca o gerenciador de modais por teste.
const manager = { activeModals: [] };

function esc(target = document.body, init = {}) {
  const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
}

describe("escapeKey.setupEscapeKey", () => {
  let emit;
  beforeAll(() => setupEscapeKey({ modalManager: manager }));
  beforeEach(() => {
    manager.activeModals = [];
    emit = vi.spyOn(uiBus, "emit").mockImplementation(() => {});
    document.body.innerHTML = "";
    delete document.body.dataset.recordingShortcut;
  });
  afterEach(() => emit.mockRestore());

  it("ignora outras teclas", () => {
    document.body.innerHTML = '<div id="settings-container" class="open"></div>';
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(emit).not.toHaveBeenCalled();
  });
  it("fecha a gaveta de configurações primeiro, mesmo com modal aberto", () => {
    document.body.innerHTML = '<div id="settings-container" class="open"></div>';
    const close = vi.fn();
    manager.activeModals = [{ close, modalConfig: {} }];
    const ev = esc();
    expect(emit).toHaveBeenCalledWith("settings:close");
    expect(close).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(true);
  });
  it("fecha só o modal do topo da pilha", () => {
    const baixo = { close: vi.fn(), modalConfig: {} };
    const topo = { close: vi.fn(), modalConfig: {} };
    manager.activeModals = [baixo, topo];
    esc();
    expect(topo.close).toHaveBeenCalledTimes(1);
    expect(baixo.close).not.toHaveBeenCalled();
  });
  it("modal com closable:false não fecha e bloqueia o que está embaixo", () => {
    document.body.innerHTML = '<div id="central-overlay"></div>';
    const m = { close: vi.fn(), modalConfig: { closable: false } };
    manager.activeModals = [m];
    const ev = esc();
    expect(m.close).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(true);
  });
  it("fecha a central quando visível e ignora quando oculta", () => {
    document.body.innerHTML = '<div id="central-overlay" class="hidden"></div>';
    esc();
    expect(emit).not.toHaveBeenCalled();
    document.getElementById("central-overlay").classList.remove("hidden");
    esc();
    expect(emit).toHaveBeenCalledWith("central:close");
  });
  it("fecha a gaveta do chat, mas não se o foco está no editor", () => {
    document.body.innerHTML = '<div id="chat-container" class="expanded"></div><div id="markdown-editor"><p id="p"></p></div>';
    esc(document.getElementById("p"));
    expect(emit).not.toHaveBeenCalled();
    esc(document.body);
    expect(emit).toHaveBeenCalledWith("ai-chat:toggle");
    expect(emit).toHaveBeenCalledWith("explorer:keyboard-restore");
  });
  it("menus abertos tratam o próprio Esc (nada é fechado)", () => {
    document.body.innerHTML = '<div id="settings-container" class="open"></div><div class="dropdown open"></div>';
    esc();
    expect(emit).not.toHaveBeenCalled();
  });
  it("gravando atalho: Esc não fecha nada", () => {
    document.body.innerHTML = '<div id="settings-container" class="open"></div>';
    document.body.dataset.recordingShortcut = "1";
    esc();
    expect(emit).not.toHaveBeenCalled();
  });
  it("evento já tratado (defaultPrevented) é ignorado", () => {
    document.body.innerHTML = '<div id="settings-container" class="open"></div>';
    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    ev.preventDefault();
    document.body.dispatchEvent(ev);
    expect(emit).not.toHaveBeenCalled();
  });
});
