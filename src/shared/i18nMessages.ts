/**
 * @file Carrega os dicionários de tradução (`src/shared/i18n/<idioma>/*.json`, um arquivo por área do app) e os registra no núcleo.
 * Os JSON são incluídos pelo Vite em tempo de build (`import.meta.glob`), tanto no processo principal quanto no renderer.
 */

import { registerMessages } from "./i18n.js";

const english = import.meta.glob("./i18n/en/*.json", { eager: true, import: "default" }) as Record<string, Record<string, string>>;

let loaded = false;

/** Registra todos os dicionários (idempotente). */
export function loadMessages(): void {
  if (loaded) return;
  loaded = true;
  for (const file of Object.keys(english).sort()) registerMessages("en", english[file]);
}
