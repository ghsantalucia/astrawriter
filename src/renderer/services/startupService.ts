// @ts-nocheck
/**
 * @file Rotina de inicialização: assim que o app abre, em segundo plano e sem travar nada, verifica atualizações e faz o
 * backup automático (se estiver ligado e vencido). Só aparece janela quando há uma decisão a tomar (atualização pronta),
 * uma de cada vez e em fila; o resto é um aviso discreto.
 */

import { uiBus } from "../events/uiBus.js";
import { appSettings } from "../utils/appSettings.js";

/**
 * Serviço da rotina de inicialização.
 * @class
 */
export class StartupService {
  /**
   * @param {Object} services - Serviços (backup).
   */
  constructor(services) {
    this.services = services;
    /** Fila de janelas: cada uma só abre depois que a anterior foi respondida. */
    this.queue = Promise.resolve();
    this.updatePrompted = false;
  }

  /**
   * Abre uma janela com botões e espera a escolha (em fila).
   * @param {Object} options - `title`, `html` e `buttons: [{text, class, value}]`.
   * @returns {Promise<any>} O `value` do botão escolhido (`null` se fechou no X).
   * @private
   */
  ask({ title, html, buttons }) {
    const run = () =>
      new Promise((resolve) => {
        uiBus.emit("modal:open", {
          id: `startup-${Date.now()}`,
          title,
          content: `<div class="cn-confirm">${html}</div>`,
          onClose: () => resolve(null),
          buttons: buttons.map((b) => ({
            text: b.text,
            class: b.class,
            onClick: (modal) => {
              resolve(b.value);
              modal.close();
            },
          })),
        });
      });
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  /**
   * Roda a rotina.
   * @returns {Promise<void>}
   */
  async run() {
    await Promise.allSettled([this.checkUpdates(), this.checkBackup()]);
    // Skills recorrentes com o gatilho "ao abrir o app"
    this.services.skillRunner.fire("app-start", {});
  }

  /**
   * Atualização: liga a verificação automática (app instalado) e, quando uma versão fica pronta, pergunta se reinicia.
   * @returns {Promise<void>}
   * @private
   */
  async checkUpdates() {
    window.electronAPI.onUpdateStatus?.((status) => {
      if (status?.state === "ready" && !this.updatePrompted) this.promptUpdate(status);
    });
    if (!appSettings.get("updates.auto")) return;
    const result = await window.electronAPI.configureAutoUpdate(true);
    // Sem o atualizador (desenvolvimento ou sistema sem suporte): só avisa se há versão nova nas releases
    if (!result?.supported) {
      const info = await window.electronAPI.checkUpdate();
      if (info?.status === "available") uiBus.emit("toast:show", { message: `Há uma nova versão do app: ${info.latest}. Veja em Configurações → Central do Sistema → Atualização.`, type: "info" });
    }
  }

  /**
   * Pergunta se o usuário quer reiniciar para instalar a atualização baixada.
   * @param {{version?: string}} status - Estado da atualização.
   * @returns {Promise<void>}
   * @private
   */
  async promptUpdate(status) {
    this.updatePrompted = true;
    const choice = await this.ask({
      title: "Atualização pronta",
      html: `<p>Uma nova versão do Astra Writer${status.version ? ` (<strong>${status.version}</strong>)` : ""} foi baixada.</p><p>Reiniciar agora para instalar? Seus livros e configurações são mantidos. Se escolher depois, a atualização é instalada na próxima vez que você abrir o app.</p>`,
      buttons: [
        { text: "Depois", class: "btn-secondary", value: "later" },
        { text: "Reiniciar e atualizar", class: "btn-primary", value: "install" },
      ],
    });
    if (choice === "install") window.electronAPI.installUpdate();
  }

  /**
   * Backup automático: se está ligado e vencido, roda em segundo plano e avisa quando termina.
   * @returns {Promise<void>}
   * @private
   */
  async checkBackup() {
    const backup = this.services.backup;
    await backup.init();
    if (!backup.due()) return;
    const result = await backup.runNow();
    uiBus.emit("toast:show", {
      message: result.success ? `Backup automático concluído: ${result.count} ${result.count === 1 ? "livro copiado" : "livros copiados"}.` : `O backup automático falhou: ${result.error}`,
      type: result.success ? "success" : "error",
    });
  }
}
