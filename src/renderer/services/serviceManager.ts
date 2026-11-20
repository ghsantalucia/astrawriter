// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Agregador central de serviços (Facade). Instancia e gerencia o acesso
 * a todos os serviços de domínio da aplicação de forma centralizada.
 */

import { FileService } from "./fileService.js";
import { BookService } from "./bookService.js";
import { AiService } from "./aiService.js";
import { CreationService } from "./creationService.js";
import { SearchService } from "./searchService.js";
import { ChangelogService } from "./changelogService.js";
import { DeletionService } from "./deletionService.js";
import { FolderService } from "./folderService.js";
import { IssueService } from "./issueService.js";
import { AnalysisService } from "./analysisService.js";
import { SkillService } from "./skillService.js";
import { AiChangeService } from "./aiChangeService.js";
import { AppearanceService } from "./appearanceService.js";
import { NarratorService } from "./narratorService.js";
import { ProductivityService } from "./productivityService.js";
import { ShortcutService } from "./shortcutService.js";
import { BackupService } from "./backupService.js";
import { StartupService } from "./startupService.js";
import { SkillRunnerService } from "./skillRunnerService.js";

/**
 * Gerencia todas as classes de serviços.
 * @class
 */
export class ServiceManager {
  /**
   * Inicializa e agrupa todos os serviços da aplicação.
   * @param {Object} state - Instância do estado global da aplicação.
   * @constructor
   */
  constructor(state) {
    this.state = state;

    // Instancia os serviços injetando as dependências necessárias
    this.changelog = new ChangelogService(this.state);
    this.file = new FileService(this.state, this.changelog);
    this.book = new BookService(this.state, this.file);
    this.creation = new CreationService(this.state, this.changelog);
    this.deletion = new DeletionService(this.state, this.changelog);
    this.folders = new FolderService(this.state, this.changelog);
    this.search = new SearchService();
    this.issues = new IssueService(this.state, this.changelog, this.file);
    this.skills = new SkillService(this.state);
    this.templates = this.creation.templates;
    this.aiChanges = new AiChangeService(this.state);
    this.analysis = new AnalysisService(this.state, this.changelog, this.file, this.issues);
    this.ai = new AiService(
      this.state,
      this.file,
      this.creation,
      this.changelog,
      {
        folders: this.folders,
        deletion: this.deletion,
        bookService: this.book,
        issues: this.issues,
        analysis: this.analysis,
      },
    );

    // Skills: execução (manual, por gatilho ou a pedido da IA)
    this.skillRunner = new SkillRunnerService(this, this.state);
    this.ai.skillLibrary = this.skills;
    this.ai.skillRunner = this.skillRunner;
    // Central do Sistema: aparência, narrador, cronômetro, atalhos, backup e rotina de inicialização
    this.appearance = new AppearanceService();
    this.narrator = new NarratorService(this.state);
    this.productivity = new ProductivityService();
    this.shortcuts = new ShortcutService();
    this.backup = new BackupService();
    this.startup = new StartupService(this);
    this.ai.backupService = this.backup;
    this.ai.productivityService = this.productivity;
  }
}

console.log("[5. SERVICE-MANAGER.JS]");
