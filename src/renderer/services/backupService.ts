/**
 * @file Backup dos livros em uma pasta escolhida (um zip por livro, com os rascunhos não sincronizados). A pasta pode ser a
 * de um serviço de nuvem instalado no computador (Google Drive, OneDrive, Dropbox), que sobe as cópias sozinho.
 */

import { appSettings } from "../utils/appSettings.js";

/**
 * Serviço de backup.
 * @class
 */
export class BackupService {
  /**
   * Na primeira vez, usa como pasta de backup a pasta padrão (Documentos/Astra Writer/backups). O autor pode trocá-la.
   * @returns {Promise<void>}
   */
  async init() {
    if (appSettings.get("backup.folder")) return;
    const paths = await window.electronAPI.getPaths();
    if (paths?.backupsDir) appSettings.set("backup.folder", paths.backupsDir);
  }

  /** @returns {boolean} Há pasta de backup configurada? */
  get configured() {
    return Boolean(appSettings.get("backup.folder"));
  }

  /**
   * O backup automático está ligado e já passou o intervalo desde o último?
   * @returns {boolean}
   */
  due() {
    if (!appSettings.get("backup.auto") || !this.configured) return false;
    const last = Number(appSettings.get("backup.lastAt")) || 0;
    return Date.now() - last >= appSettings.get("backup.everyHours") * 3_600_000;
  }

  /**
   * Faz o backup agora.
   * @returns {Promise<{success: boolean, count?: number, error?: string}>}
   */
  async runNow() {
    if (!this.configured) return { success: false, error: "Escolha uma pasta de backup primeiro." };
    const result = await window.electronAPI.backupBooks(appSettings.get("backup.folder"), appSettings.get("backup.keep"));
    if (result?.success) appSettings.set("backup.lastAt", Date.now());
    return result || { success: false, error: "Falha ao fazer o backup." };
  }
}
