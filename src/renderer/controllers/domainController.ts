/**
 * @file Gerencia e despacha os eventos de negócio e domínio vindos do domainBus para os handlers específicos.
 */

import { domainBus } from "../events/domainBus.js";
import { uiBus } from "../events/uiBus.js";
import { normalizePath } from "../utils/helpers.js";
import * as config from "./handlers/configHandler.js";
import * as aiReview from "./handlers/aiReviewHandler.js";

/**
 * Controller responsável pelas regras de negócio, IA e manipulação de dados.
 * @class
 */
export class DomainController {
  declare services: any;
  declare state: any;

  /**
   * Cria uma instância do DomainController e registra os ouvintes de eventos de domínio.
   * @param {import('../services/serviceManager.js').ServiceManager} services - Instância centralizada dos serviços.
   */
  constructor(services, state) {
    this.services = services;
    this.state = state;
    this.registerEvents();
  }

  /**
   * Registra todos os escutadores do barramento de domínio.
   * @private
   */
  registerEvents() {
    // Evento de alteração de arquivo em disco
    domainBus.on("fs:temp-changed", (filePath) => {
      // ...
    });

    // A IA vai editar arquivos: trava o projeto (ai_lock no config.json do livro)
    domainBus.on("ai:edit-started", ({ bookPath }) => {
      this.services.book.setAiLock(bookPath, true);
    });

    // A IA terminou: libera o projeto e pede a revisão dos arquivos alterados
    domainBus.on("ai:edit-finished", async ({ bookPath, files }) => {
      this.services.changelog.endAiSessions();
      await this.services.book.setAiLock(bookPath, false);
      if (files.length === 0) return;
      // Modo autônomo: a IA grava direto (sem a janela de revisão) e os arquivos ficam marcados até o autor abri-los
      if (this.state.currentBookMetadata?.ai_mode === "autonomous") {
        const applied = await aiReview.autoApplyAiEdits({ files }, this.services.file, this.state);
        await this.services.aiChanges.mark(applied);
        return;
      }
      uiBus.emit("ai-review:open", { files });
    });

    // Variáveis de um arquivo foram alteradas (ex.: nome de um personagem)
    domainBus.on("file:variables-changed", (payload) => {
      // TODO: tratar a alteração de variáveis. Mudar uma variável como o nome de um personagem deve disparar
      // os fluxos de correção (ex.: renomear referências em outros arquivos do livro, revisar consistência com
      // a IA, atualizar índices). `payload.changes` traz `{ id, previous, value }` de cada variável alterada.
    });

    // Evento disparado quando um livro é selecionado
    domainBus.on("fs:config-changed", async (payload) => {
      config.onConfigChanged(payload, this.state, this.services.book);
    });
  }
}
