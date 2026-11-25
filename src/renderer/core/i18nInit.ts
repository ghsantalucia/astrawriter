/**
 * @file Prepara a tradução do renderer. Deve ser o PRIMEIRO import de `app.ts`: ao ser avaliado, define o idioma (vindo do processo
 * principal pelo preload) e registra o helper `{{t "texto"}}` do Handlebars, antes de qualquer tela ou texto ser criado.
 */

import Handlebars from "handlebars";
import { setLanguage, t } from "../../shared/i18n.js";
import { loadMessages } from "../../shared/i18nMessages.js";

loadMessages();
setLanguage((window as any).electronAPI?.language);

/**
 * Helper de templates: `{{t "Salvar"}}` ou `{{t "Olá, {name}" name=usuario}}`.
 * O resultado passa pelo escape normal do Handlebars; para textos com HTML (`<strong>`), use `{{{t "..."}}}`.
 */
Handlebars.registerHelper("t", function (source: string, options: any) {
  return t(source, options?.hash);
});
