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
  }
}

console.log("[5. SERVICE-MANAGER.JS]");
