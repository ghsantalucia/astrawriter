/**
 * @file Declarações globais do projeto (módulos de recursos do Vite e as APIs expostas pelo preload).
 */

declare module "*.hbs?raw" {
  const source: string;
  export default source;
}

declare module "*.md?raw" {
  const source: string;
  export default source;
}

/** Variáveis injetadas pelo plugin do Electron Forge (processo principal). */
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

interface Window {
  /** API exposta pelo preload (src/preload/preload.ts). */
  electronAPI: any;
  api: any;
  [key: string]: any;
}
