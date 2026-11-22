/**
 * @file Dublê do módulo "electron" para os testes (Vitest). Cada teste pode sobrescrever partes dele.
 * Uso:  vi.mock("electron", async () => (await import("../../helpers/electronMock.js")).createElectronMock());
 */
import { vi } from "vitest";
import os from "os";

/**
 * Cria um dublê do `electron` com o necessário para importar o processo principal sem o Electron real.
 * @param {Object} [overrides] - Partes a sobrescrever (ex.: `{ ipcMain }`).
 * @returns {Object}
 */
export function createElectronMock(overrides = {}) {
  return {
    app: {
      isPackaged: false,
      getPath: vi.fn(() => os.tmpdir()),
      getVersion: vi.fn(() => "0.0.0-test"),
      getName: vi.fn(() => "Astra Writer"),
      quit: vi.fn(),
      on: vi.fn(),
      whenReady: vi.fn(() => Promise.resolve()),
    },
    ipcMain: { on: vi.fn(), handle: vi.fn() },
    dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn(), showMessageBox: vi.fn() },
    shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() },
    session: { defaultSession: { setSpellCheckerLanguages: vi.fn() } },
    autoUpdater: { on: vi.fn(), setFeedURL: vi.fn(), checkForUpdates: vi.fn(), quitAndInstall: vi.fn() },
    net: { fetch: vi.fn() },
    BrowserWindow: vi.fn(),
    ...overrides,
  };
}
