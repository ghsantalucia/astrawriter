/**
 * @file Idioma do app no processo principal: lê/grava a escolha do usuário (`language.json` na pasta de dados), entrega o idioma
 * ao renderer (leitura síncrona no preload) e recarrega a janela quando ele muda.
 * Ordem de decisão: variável `ASTRA_LANG` (testes) → escolha salva → idioma do sistema (`pt*` → português; o resto → inglês).
 */

import fs from "node:fs";
import path from "node:path";
import { app, ipcMain } from "electron";
import { getLanguage, normalizeLanguage, setLanguage } from "../shared/i18n.js";
import { loadMessages } from "../shared/i18nMessages.js";
import type { Language } from "../shared/i18n.js";

function languageFile(): string {
  return path.join(app.getPath("userData"), "language.json");
}

/** Escolha salva pelo usuário, ou null se nunca escolheu. */
function readSaved(): Language | null {
  try {
    const data = JSON.parse(fs.readFileSync(languageFile(), "utf8"));
    return data?.language ? normalizeLanguage(data.language) : null;
  } catch {
    return null;
  }
}

/** Define o idioma do processo principal (chamar depois do `app.whenReady`). */
export function initLanguage(): Language {
  loadMessages();
  const forced = process.env.ASTRA_LANG;
  const chosen = forced ? normalizeLanguage(forced) : readSaved() ?? normalizeLanguage(app.getLocale());
  return setLanguage(chosen);
}

/**
 * Registra os canais IPC do idioma.
 * @param {import('electron').BrowserWindow} mainWindow - Janela principal (recarregada quando o idioma muda).
 */
export function registerLanguageIpc(mainWindow: any): void {
  // Leitura síncrona: o preload precisa do idioma antes de a interface ser desenhada
  ipcMain.on("language-get", (event) => {
    event.returnValue = getLanguage();
  });

  ipcMain.handle("language-set", (_event, code: string) => {
    const language = normalizeLanguage(code);
    if (language === getLanguage()) return language;
    fs.mkdirSync(path.dirname(languageFile()), { recursive: true });
    fs.writeFileSync(languageFile(), JSON.stringify({ language }), "utf8");
    setLanguage(language);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload();
    return language;
  });
}
