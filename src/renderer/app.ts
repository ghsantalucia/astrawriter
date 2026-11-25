/**
 * @file Ponto de entrada do frontend (Renderer), responsável por inicializar o container principal da aplicação.
 */

import "./core/i18nInit.js";
import { AppContainer } from "./core/appContainer.js";
import { initSplash, hideSplash } from "./core/splash.js";
import { initTooltips } from "./core/tooltip.js";

// Inicialização principal quando o DOM estiver carregado utilizando o Container IoC
document.addEventListener("DOMContentLoaded", async () => {
  initSplash();
  initTooltips();
  const appContainer = new AppContainer();
  await appContainer.init();
  hideSplash();
});

console.log("[3. APP.JS]");
