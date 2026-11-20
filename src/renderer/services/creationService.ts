// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Serviço responsável pela criação de livros, capítulos, fichas (personagens, ambientes, sistemas) e anotações.
 *
 * É o ponto único desse fluxo: tanto o wizard da interface quanto as ferramentas da IA usam os mesmos
 * métodos (`getSpec` descreve os passos/campos e `create` executa), garantindo o mesmo passo a passo.
 * Ao concluir, o serviço notifica os dois barramentos (`book:created`, `chapter:created`, `file:created`).
 */

import { uiBus } from "../events/uiBus.js";
import { domainBus } from "../events/domainBus.js";
import { addEntityToIndex } from "./indexService.js";
import { normalizePath } from "../utils/helpers.js";
import { collectEventNames } from "../utils/eventNames.js";
import { TemplateService, mergeTemplate } from "./templateService.js";
import { flattenBookTree } from "../utils/bookFiles.js";
import {
  parseMarkdown,
  stringifyFrontmatter,
  stringifyYaml,
  parseYaml,
} from "../utils/markdown.js";
import {
  parseTemplate,
  buildTemplateSteps,
  findMissingRequired,
  allFields,
  resolveTitle,
  applyTemplateValues,
  renderTemplateFile,
  replaceFirstHeading,
  appendToBody,
} from "../utils/template.js";

/** Tipos de criação suportados. */
export const CREATION_KINDS = ["book", "chapter", "entity", "note"];

/** Prefixo do nome numerado dos arquivos de ficha, por pasta (ex.: character_001.md). */
const ENTITY_FILE_PREFIX = {
  characters: "character",
  places: "place",
  elements: "element",
  events: "event",
};

/**
 * Cópia das permissões sem `aiWrite` (para os arquivos que herdam essa permissão da pasta).
 * @param {Object} flags - Permissões.
 * @returns {Object}
 */
function withoutAiWrite(flags) {
  const { aiWrite, ...rest } = flags;
  return rest;
}

/** Permissões padrão de um arquivo novo quando o modelo não as define. */
const DEFAULT_FILE_FLAGS = {
  humanRead: true,
  humanWrite: true,
  aiRead: true,
  aiWrite: true,
  advanced: false,
  userDelete: true,
};

/**
 * Formata um número com zeros à esquerda.
 * @param {number} n - Número.
 * @param {number} [size=3] - Quantidade mínima de dígitos.
 * @returns {string}
 */
function pad(n, size = 3) {
  return String(n).padStart(size, "0");
}

/**
 * Calcula o próximo número livre de uma sequência, a partir dos nomes existentes.
 * @param {string[]} names - Nomes de arquivos/pastas existentes.
 * @param {RegExp} regex - Expressão com um grupo de captura numérico.
 * @returns {number} Maior número encontrado + 1 (ou 1).
 */
function nextNumber(names, regex) {
  let max = 0;
  for (const name of names) {
    const match = regex.exec(name);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return max + 1;
}

/**
 * Valida um caminho de pasta relativo à raiz do livro (sem `..`, sem pastas ocultas e sem caminho absoluto).
 * @param {string} folder - Caminho relativo (ex.: assets/characters).
 * @returns {string} Caminho normalizado, sem barras nas pontas.
 */
function sanitizeFolder(folder) {
  const clean = normalizePath(String(folder || "")).replace(/^\/+|\/+$/g, "");
  const segments = clean.split("/");

  if (
    !clean ||
    /^[a-z]:/i.test(clean) ||
    segments.some((s) => !s || s === "." || s === ".." || s.startsWith("."))
  ) {
    throw new Error(`Pasta inválida: "${folder}".`);
  }
  return clean;
}

/**
 * Serviço de criação de conteúdo a partir dos modelos (templates) do projeto.
 * @class
 */
export class CreationService {
  /**
   * Cria uma instância do CreationService.
   * @param {Object} state - Instância do gerenciador de estado global.
   */
  constructor(state, changelog = null) {
    this.state = state;
    /** Serviço do changelog (registra o que foi criado e por quem). */
    this.changelog = changelog;
    /** @type {{booksDir: string, templatesDir: string}|null} */
    this._paths = null;
    /** Perfis de template (corpo dos templates de fichas e capítulos). */
    this.templates = new TemplateService();
  }

  // ========== Infraestrutura ========== //

  /**
   * Retorna (com cache) a pasta dos livros e a pasta do template de livro.
   * @returns {Promise<{booksDir: string, templatesDir: string}>} Caminhos normalizados (com `/`).
   */
  async getPaths() {
    if (!this._paths) {
      const paths = await window.electronAPI.getPaths();
      this._paths = {
        booksDir: normalizePath(paths.booksDir),
        templatesDir: normalizePath(paths.templatesDir),
      };
    }
    return this._paths;
  }

  /**
   * Retorna o caminho do livro atual ou lança erro se nenhum estiver selecionado.
   * @returns {string} Caminho normalizado do livro.
   */
  requireBookPath() {
    if (!this.state.currentBookPath)
      throw new Error("Nenhum livro selecionado.");
    return normalizePath(this.state.currentBookPath).replace(/\/+$/, "");
  }

  /**
   * Lê um arquivo de texto do disco (sempre o original, sem considerar rascunhos).
   * @param {string} path - Caminho do arquivo.
   * @returns {Promise<string|null>} Conteúdo ou null se não existir.
   */
  async readText(path) {
    return window.electronAPI.readFile(path);
  }

  /**
   * Grava um arquivo de texto no disco, lançando erro em caso de falha.
   * @param {string} path - Caminho do arquivo.
   * @param {string} content - Conteúdo a gravar.
   * @returns {Promise<void>}
   */
  async writeText(path, content) {
    const result = await window.electronAPI.saveFile(path, content);
    if (!result?.success) {
      throw new Error(`Falha ao gravar "${path}": ${result?.error || "erro"}`);
    }
  }

  /**
   * Lista as entradas de um diretório.
   * @param {string} dir - Caminho do diretório.
   * @returns {Promise<Array<{name: string, isDirectory: boolean}>>}
   */
  async listDir(dir) {
    return (await window.electronAPI.listDir(dir)) || [];
  }

  /**
   * Lê e interpreta um modelo, lançando erro descritivo se ele não existir.
   * @param {string} path - Caminho do arquivo-modelo.
   * @returns {Promise<import("../utils/template.js").ParsedTemplate>}
   */
  async loadTemplate(path) {
    const raw = await this.readText(path);
    if (raw === null) throw new Error(`Modelo não encontrado: ${path}`);
    return parseTemplate(raw);
  }

  // ========== Descrição dos passos (wizard / IA) ========== //

  /**
   * Descreve o passo a passo da criação (título, passos e campos), igual para a UI e para a IA.
   * @param {Object} params
   * @param {"book"|"chapter"|"entity"|"note"} params.kind - Tipo de criação.
   * @param {string} [params.folder] - Pasta da ficha, relativa ao livro (apenas `entity`).
   * @returns {Promise<{kind: string, title: string, submitLabel: string, allowSkip: boolean, context: Object, steps: import("../utils/template.js").WizardStep[]}>}
   */
  async getSpec({ kind, folder } = {}) {
    switch (kind) {
      case "book":
        return this.getBookSpec();
      case "chapter":
        return this.getChapterSpec();
      case "entity":
        return this.getEntitySpec(folder);
      case "note":
        return this.getNoteSpec(folder);
      default:
        throw new Error(
          `Tipo de criação desconhecido: "${kind}". Use: ${CREATION_KINDS.join(", ")}.`,
        );
    }
  }

  /**
   * Passos de criação de um livro, montados a partir de `content/plot.md` do template.
   * @returns {Promise<Object>} Especificação (ver {@link CreationService#getSpec}).
   */
  async getBookSpec() {
    const { templatesDir } = await this.getPaths();
    const template = await this.loadTemplate(`${templatesDir}/content/plot.md`);

    const steps = buildTemplateSteps(template);
    // Perfil dos templates: acompanha o modo da IA escolhido, mas o autor pode trocar (perfis fixos ou os dele)
    const profiles = await this.templates.profiles().catch(() => []);
    const first = steps[0];
    if (first && profiles.length) {
      const modeField = first.fields.find((f) => f.id === "ai_mode");
      first.fields.push({
        id: "template_profile",
        label: "Perfil dos templates",
        type: "select",
        options: profiles.map((p) => ({ value: p.id, label: p.builtin ? p.label : `${p.label} (seu)` })),
        value: this.templates.profileForMode(modeField?.value),
        hint: "Define o modelo de cada ficha e capítulo. Escolhido automaticamente pelo modo da IA; mude se quiser. Dá para editar os templates em Central do Sistema → Templates.",
        required: false,
        follows: { field: "ai_mode", map: { assistant: "assistant", coauthor: "coauthor", autonomous: "autonomous" } },
      });
    }

    return {
      kind: "book",
      title: "Novo livro",
      submitLabel: "Criar livro",
      allowSkip: false,
      context: {},
      steps,
    };
  }

  /**
   * Passos de criação de um capítulo: título (com sugestão automática) e planejamento opcional.
   * @returns {Promise<Object>} Especificação (ver {@link CreationService#getSpec}).
   */
  async getChapterSpec() {
    const info = await this.getNextChapterInfo();

    return {
      kind: "chapter",
      title: "Novo capítulo",
      submitLabel: "Criar capítulo",
      allowSkip: false,
      context: { number: info.number, folderName: info.folderName },
      steps: [
        {
          id: "chapter",
          title: "Dados do capítulo",
          description:
            "Informe o título e, se quiser, deixe anotado o planejamento do capítulo.",
          fields: [
            {
              id: "title",
              label: "Título do capítulo",
              type: "text",
              placeholder: info.defaultTitle,
              required: true,
              value: info.defaultTitle,
            },
            {
              id: "plan",
              label: "Planejamento do capítulo (opcional)",
              type: "textarea",
              placeholder:
                "Brainstorm, lista de desejos, cenas que precisam acontecer… pode ser em lista ou texto livre.",
              hint: "Será salvo no esboço do capítulo e pode alimentar a IA como prompt.",
              required: false,
              value: "",
              rows: 12,
            },
          ],
        },
      ],
    };
  }

  /**
   * Passos de criação de uma ficha, montados a partir do `template.md` da pasta.
   * @param {string} folder - Pasta da ficha, relativa ao livro (ex.: assets/characters).
   * @returns {Promise<Object>} Especificação (ver {@link CreationService#getSpec}).
   */
  async getEntitySpec(folder) {
    const {
      template,
      folderTitle,
      folder: cleanFolder,
    } = await this.loadEntityTemplate(folder);

    const steps = buildTemplateSteps(template, {
      variablesTitle: "Dados principais",
    });
    // Eventos já citados em "antes"/"depois" de outras fichas, mas que ainda não têm ficha, viram sugestão de nome
    if (cleanFolder === "assets/events" && this.state.currentBookMap) {
      const { pending } = collectEventNames(flattenBookTree(this.state.currentBookMap, this.requireBookPath()));
      const titleField = steps[0]?.fields?.find((f) => f.id === "title");
      if (titleField && pending.length) {
        titleField.suggestions = pending;
        titleField.hint = "Eventos já citados em outras fichas e ainda sem ficha aparecem como sugestão ao digitar.";
      }
    }

    return {
      kind: "entity",
      title: folderTitle ? `Nova ficha — ${folderTitle}` : "Nova ficha",
      submitLabel: "Criar",
      allowSkip: true,
      context: { folder: cleanFolder },
      steps,
    };
  }

  /**
   * Passos de criação de uma anotação: apenas o nome.
   * @param {string} [folder] - Pasta do usuário (em `notes/`) onde a anotação será criada; omitida = raiz de `notes`.
   * @returns {Promise<Object>} Especificação (ver {@link CreationService#getSpec}).
   */
  async getNoteSpec(folder) {
    return {
      kind: "note",
      title: "Nova anotação",
      submitLabel: "Criar anotação",
      allowSkip: false,
      context: folder ? { folder: sanitizeFolder(folder) } : {},
      steps: [
        {
          id: "note",
          title: "Nome da anotação",
          fields: [
            {
              id: "title",
              label: "Nome da anotação",
              type: "text",
              placeholder: "Ex.: Ideias para o final",
              required: true,
              value: "",
            },
          ],
        },
      ],
    };
  }

  // ========== Consultas auxiliares ========== //

  /**
   * Calcula o próximo capítulo a ser criado (número, nome da pasta e título sugerido).
   * @returns {Promise<{number: number, folderName: string, defaultTitle: string}>}
   */
  async getNextChapterInfo() {
    const book = this.requireBookPath();
    const entries = await this.listDir(`${book}/content`);
    const number = nextNumber(
      entries.filter((e) => e.isDirectory).map((e) => e.name),
      /^chapter_(\d+)$/i,
    );

    return {
      number,
      folderName: `chapter_${pad(number)}`,
      defaultTitle: `Capítulo ${pad(number, 2)}`,
    };
  }

  /**
   * Localiza o modelo de uma pasta de fichas (do livro; se faltar, o do template global).
   * @param {string} folder - Pasta relativa ao livro.
   * @returns {Promise<{template: import("../utils/template.js").ParsedTemplate, folder: string, folderTitle: string}>}
   */
  async loadEntityTemplate(folder) {
    const book = this.requireBookPath();
    const cleanFolder = sanitizeFolder(folder);
    const { templatesDir } = await this.getPaths();

    // Pastas do usuário não têm modelo próprio: valem o da categoria (ou da pasta-mãe mais próxima que tenha um)
    let raw = null;
    const segments = cleanFolder.split("/");
    for (let depth = segments.length; depth >= 2 && raw === null; depth--) {
      const candidate = segments.slice(0, depth).join("/");
      raw = await this.readText(`${book}/${candidate}/template.md`);
      if (raw === null) {
        raw = await this.readText(`${templatesDir}/${candidate}/template.md`);
      }
    }
    if (raw === null) {
      throw new Error(`A pasta "${cleanFolder}" não possui um template.md.`);
    }

    const folderYml = await this.readText(`${book}/${cleanFolder}/folder.yml`);
    const folderTitle = folderYml
      ? String(parseYaml(folderYml).title || "")
      : "";

    return { template: parseTemplate(raw), folder: cleanFolder, folderTitle };
  }

  /**
   * Lista as pastas do livro atual que aceitam novas fichas (possuem `template.md`).
   * @returns {Promise<Array<{folder: string, title: string, aiWrite: boolean}>>}
   */
  async listEntityFolders() {
    const tree = await window.electronAPI.getTree(this.requireBookPath());
    const folders = [];

    const walk = (node, prefix) => {
      for (const [name, sub] of Object.entries(node?.folders || {})) {
        const path = prefix ? `${prefix}/${name}` : name;
        if (sub.files?.template) {
          folders.push({
            folder: path,
            title: sub.metadata?.title || name,
            aiWrite: sub.metadata?.aiWrite === true,
          });
        }
        walk(sub, path);
      }
    };
    walk(tree, "");

    return folders;
  }

  /**
   * Retorna os metadados (folder.yml) de uma pasta do livro atual, como as permissões da IA.
   * @param {string} folder - Pasta relativa ao livro.
   * @returns {Promise<Object>} Metadados da pasta (vazio se não existir).
   */
  async getFolderMetadata(folder) {
    const tree = await window.electronAPI.getTree(this.requireBookPath());
    let node = tree;

    for (const name of sanitizeFolder(folder).split("/")) {
      node = node?.folders?.[name];
      if (!node) return {};
    }
    return node.metadata || {};
  }

  // ========== Validação ========== //

  /**
   * Combina os valores informados com os valores padrão dos campos.
   * @param {import("../utils/template.js").WizardStep[]} steps - Passos do formulário.
   * @param {Object<string, string>} [values] - Valores informados por id de campo.
   * @returns {Object<string, string>} Valores efetivos (apenas campos conhecidos).
   */
  resolveValues(steps, values = {}) {
    const resolved = {};
    for (const field of allFields(steps)) {
      resolved[field.id] = String(
        values?.[field.id] ?? field.value ?? "",
      ).trim();
    }
    return resolved;
  }

  /**
   * Retorna os campos obrigatórios que ficaram sem resposta.
   * @param {{steps: import("../utils/template.js").WizardStep[]}} spec - Especificação da criação.
   * @param {Object<string, string>} values - Valores informados por id de campo.
   * @returns {import("../utils/template.js").WizardField[]}
   */
  validate(spec, values) {
    return findMissingRequired(
      spec.steps,
      this.resolveValues(spec.steps, values),
    );
  }

  // ========== Changelog ========== //

  /**
   * Autor de uma criação, conforme a origem.
   * @param {"ui"|"ai"} source - Origem da criação.
   * @returns {import('./changelogService.js').Actor}
   */
  actorFor(source) {
    return source === "ai"
      ? this.changelog?.aiActor()
      : this.changelog?.userActor();
  }

  /**
   * Lista recursivamente os arquivos de uma pasta (ignora pastas ocultas como `.system`).
   * @param {string} dir - Pasta.
   * @returns {Promise<string[]>} Caminhos absolutos dos arquivos.
   */
  async listFilesRecursive(dir) {
    const files = [];
    for (const entry of await this.listDir(dir)) {
      if (entry.name.startsWith(".")) continue;
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory)
        files.push(...(await this.listFilesRecursive(full)));
      else files.push(full);
    }
    return files;
  }

  /**
   * Registra no changelog a criação de todos os arquivos de uma pasta recém-criada (já no estado final).
   * @param {string} bookPath - Livro que contém os arquivos.
   * @param {string} dir - Pasta criada.
   * @param {"ui"|"ai"} source - Origem da criação.
   * @returns {Promise<void>}
   */
  async logCreatedTree(bookPath, dir, source) {
    if (!this.changelog) return;
    const actor = this.actorFor(source);
    for (const filePath of await this.listFilesRecursive(dir)) {
      const after = await this.readText(filePath);
      await this.changelog.record({
        action: "create",
        filePath,
        after,
        actor,
        bookPath,
      });
    }
  }

  /**
   * Grava um arquivo NOVO como rascunho (`.md.temp`): ele só vira oficial quando o autor sincroniza (a sincronização
   * converte o `.temp` em `.md` e registra a criação no changelog). Assim a IA não analisa o arquivo antes disso.
   * @param {string} path - Caminho oficial do futuro arquivo.
   * @param {string} content - Conteúdo.
   * @param {"ui"|"ai"} source - Quem criou (a IA fica como autora do arquivo na sincronização).
   * @returns {Promise<void>}
   */
  async writeNewFile(path, content, source) {
    await this.writeText(`${path}.temp`, content);
    if (source === "ai") this.changelog?.markAiDraft(path);
  }

  /**
   * Converte os arquivos `.md` recém-copiados de uma pasta em rascunhos (`.md.temp`, ver {@link CreationService#writeNewFile})
   * e registra no changelog só os demais (`folder.yml`), que não passam pela sincronização.
   * @param {string} bookPath - Livro.
   * @param {string} dir - Pasta recém-criada.
   * @param {"ui"|"ai"} source - Quem criou.
   * @returns {Promise<void>}
   */
  async convertTreeToDrafts(bookPath, dir, source) {
    const actor = this.actorFor(source);
    for (const filePath of await this.listFilesRecursive(dir)) {
      if (/\.md$/i.test(filePath)) {
        const moved = await window.electronAPI.renamePath(
          filePath,
          `${filePath}.temp`,
        );
        if (!moved?.success) {
          throw new Error(`Falha ao preparar o rascunho: ${moved?.error}`);
        }
        if (source === "ai") this.changelog?.markAiDraft(filePath);
      } else if (!/\.temp$/i.test(filePath)) {
        const after = await this.readText(filePath);
        await this.changelog?.record({
          action: "create",
          filePath,
          after,
          actor,
          bookPath,
        });
      }
    }
  }

  /**
   * Registra no changelog a criação de um único arquivo.
   * @param {string} bookPath - Livro que contém o arquivo.
   * @param {string} filePath - Arquivo criado.
   * @param {string} content - Conteúdo final.
   * @param {"ui"|"ai"} source - Origem da criação.
   * @returns {Promise<void>}
   */
  async logCreatedFile(bookPath, filePath, content, source) {
    await this.changelog?.record({
      action: "create",
      filePath,
      after: content,
      actor: this.actorFor(source),
      bookPath,
    });
  }

  // ========== Execução ========== //

  /**
   * Executa a criação do item solicitado e notifica os barramentos.
   * @param {Object} params
   * @param {"book"|"chapter"|"entity"|"note"} params.kind - Tipo de criação.
   * @param {string} [params.folder] - Pasta da ficha (apenas `entity`).
   * @param {Object<string, string>} [params.values] - Respostas por id de campo.
   * @param {"ui"|"ai"} [params.source="ui"] - Quem originou a criação.
   * @returns {Promise<Object>} Resultado com `kind`, `path`, `title` e demais dados do item criado.
   */
  async create({ kind, folder, values = {}, source = "ui" }) {
    const spec = await this.getSpec({ kind, folder });
    const missing = this.validate(spec, values);
    if (missing.length > 0) {
      throw new Error(
        `Preencha os campos obrigatórios: ${missing.map((f) => f.label).join(", ")}.`,
      );
    }

    const resolved = this.resolveValues(spec.steps, values);

    switch (kind) {
      case "book":
        return this.createBook(resolved, source);
      case "chapter":
        return this.createChapter(resolved, source);
      case "entity":
        return this.createEntity(spec.context.folder, resolved, source);
      case "note":
        return this.createNote(resolved, source, spec.context.folder);
      default:
        throw new Error(`Tipo de criação desconhecido: "${kind}".`);
    }
  }

  /**
   * Cria um livro clonando a pasta de template e preenchendo `content/plot.md` e `config.json`.
   * @param {Object<string, string>} values - Valores efetivos por id de campo.
   * @param {"ui"|"ai"} source - Origem da criação.
   * @returns {Promise<Object>} Dados do livro criado.
   */
  async createBook(values, source) {
    const { booksDir, templatesDir } = await this.getPaths();
    const template = await this.loadTemplate(`${templatesDir}/content/plot.md`);

    const entries = await this.listDir(booksDir);
    const number = nextNumber(
      entries.filter((e) => e.isDirectory).map((e) => e.name),
      /^book_(\d+)$/i,
    );
    const folderName = `book_${pad(number)}`;
    const bookPath = `${booksDir}/${folderName}`;

    const copy = await window.electronAPI.copyFolder(templatesDir, bookPath);
    if (!copy?.success)
      throw new Error(`Falha ao criar o livro: ${copy?.error}`);

    // Sinopse com as respostas (o template original permanece intacto)
    const plot = applyTemplateValues(template, values);
    await this.writeText(
      `${bookPath}/content/plot.md`,
      renderTemplateFile(plot),
    );

    // Perfil dos templates: o corpo das fichas do livro passa a ser o do perfil escolhido (as variáveis não mudam)
    const profileId = String(values.template_profile || "").trim() || this.templates.profileForMode(values.ai_mode);
    await this.templates.applyToBook(bookPath, profileId).catch((e) => console.error("[CREATION] Falha ao aplicar o perfil de templates:", e));

    // config.json do novo livro
    const title = resolveTitle(template, values) || "Novo livro";
    let config = {};
    try {
      config = JSON.parse(
        (await this.readText(`${bookPath}/config.json`)) || "{}",
      );
    } catch {
      config = {};
    }
    config.book_title = title;
    config.ai_lock = false;
    config.template_profile = profileId;
    // Modo da IA escolhido no wizard (uma lista de opções: assistant, coauthor ou autonomous)
    const aiMode = String(values.ai_mode || "").trim();
    if (["assistant", "coauthor", "autonomous"].includes(aiMode)) config.ai_mode = aiMode;
    config.explorer_state = {
      // O livro novo já abre na Sinopse (o app abre o último arquivo ao selecionar o livro)
      open_file: `${bookPath}/content/plot.md`,
      open_folders: [],
      advanced_mode: Boolean(config.explorer_state?.advanced_mode),
    };
    await this.writeText(
      `${bookPath}/config.json`,
      JSON.stringify(config, null, 2),
    );

    await this.logCreatedTree(bookPath, bookPath, source);

    const result = { kind: "book", folderName, bookPath, title, source };
    this.notify("book:created", result);
    return result;
  }

  /**
   * Cria um capítulo clonando a pasta de capítulo do template (chapter_NNN) e atualizando manuscrito, esboço e índice.
   * @param {Object<string, string>} values - Valores efetivos (`title` e `plan`).
   * @param {"ui"|"ai"} source - Origem da criação.
   * @returns {Promise<Object>} Dados do capítulo criado.
   */
  async createChapter(values, source) {
    const book = this.requireBookPath();
    const { templatesDir } = await this.getPaths();
    const { number, folderName } = await this.getNextChapterInfo();
    const title = values.title;
    const plan = values.plan || "";
    const folderPath = `${book}/content/${folderName}`;

    // Pasta de capítulo do template (a primeira chapter_*)
    const templateEntries = await this.listDir(`${templatesDir}/content`);
    const templateChapter = templateEntries
      .filter((e) => e.isDirectory && /^chapter_/i.test(e.name))
      .map((e) => e.name)
      .sort()[0];
    if (!templateChapter) {
      throw new Error(
        "O template não possui uma pasta de capítulo (chapter_*).",
      );
    }

    const copy = await window.electronAPI.copyFolder(
      `${templatesDir}/content/${templateChapter}`,
      folderPath,
    );
    if (!copy?.success)
      throw new Error(`Falha ao criar o capítulo: ${copy?.error}`);

    // Perfil de templates do livro: esboço e análise do capítulo nascem com o corpo do perfil (as variáveis não mudam)
    const profileId = await this.templates.profileOfBook(book);
    for (const [kind, pattern] of [["chapter-outline", /outline\.md$/i], ["chapter-analysis", /analysis\.md$/i]]) {
      const name = (await this.listDir(folderPath)).find((e) => !e.isDirectory && pattern.test(e.name))?.name;
      const body = await this.templates.body(profileId, kind);
      if (!name || body === null) continue;
      const file = `${folderPath}/${name}`;
      await this.writeText(file, mergeTemplate((await this.readText(file)) || "", body));
    }

    // folder.yml: título da pasta no explorer ("Capítulo 02")
    const folderLabel = `Capítulo ${pad(number, 2)}`;
    const folderYmlPath = `${folderPath}/folder.yml`;
    const folderMeta = parseYaml((await this.readText(folderYmlPath)) || "");
    folderMeta.title = folderLabel;
    folderMeta.description = folderLabel;
    await this.writeText(folderYmlPath, stringifyYaml(folderMeta));

    // Arquivos do capítulo
    const files = (await this.listDir(folderPath)).filter(
      (e) => !e.isDirectory,
    );
    const draftName = files.find((e) => /draft\.md$/i.test(e.name))?.name;
    const scriptName = files.find((e) => /outline\.md$/i.test(e.name))?.name;
    if (!draftName || !scriptName) {
      throw new Error(
        "O template do capítulo precisa ter os arquivos *_draft.md e *_outline.md.",
      );
    }

    // draft.md: título no frontmatter (chapter_title, para não trocar o nome exibido no explorer) e no corpo
    const draftPath = `${folderPath}/${draftName}`;
    const draft = parseMarkdown((await this.readText(draftPath)) || "");
    draft.metadata.chapter_title = title;
    await this.writeText(
      draftPath,
      stringifyFrontmatter(
        draft.metadata,
        replaceFirstHeading(draft.body, title),
      ),
    );

    // outline.md (Esboço): plano do capítulo no corpo
    const scriptPath = `${folderPath}/${scriptName}`;
    if (plan) {
      const script = parseMarkdown((await this.readText(scriptPath)) || "");
      await this.writeText(
        scriptPath,
        stringifyFrontmatter(
          script.metadata,
          `${script.body.trimEnd()}\n\n${plan}\n`,
        ),
      );
    }

    // content/index.md: título e link do capítulo
    await this.appendChapterToIndex(book, title, folderName, draftName, source);
    // Arquivos novos nascem como rascunho: entram na lista de sincronização
    await this.convertTreeToDrafts(book, folderPath, source);

    const result = {
      kind: "chapter",
      bookPath: book,
      folderName,
      folderPath,
      number,
      title,
      path: draftPath,
      scriptPath,
      source,
    };
    this.notify("chapter:created", result);
    return result;
  }

  /**
   * Acrescenta o capítulo (título + link) ao índice `content/index.md`.
   * @param {string} book - Caminho do livro.
   * @param {string} title - Título do capítulo.
   * @param {string} folderName - Nome da pasta do capítulo.
   * @param {string} draftName - Nome do arquivo de manuscrito.
   * @param {"ui"|"ai"} [source="ui"] - Origem da criação (autor no changelog).
   * @returns {Promise<void>}
   */
  async appendChapterToIndex(
    book,
    title,
    folderName,
    draftName,
    source = "ui",
  ) {
    const indexPath = `${book}/content/index.md`;
    const safeTitle = title.replace(/[[\]]/g, "");
    const link = `- [${safeTitle}](content/${folderName}/${draftName})`;

    const existing = await this.readText(indexPath);
    const current =
      existing ??
      stringifyFrontmatter(
        {
          humanRead: true,
          humanWrite: false,
          aiRead: true,
          aiWrite: false,
          advanced: true,
          userDelete: false,
          title: "Índice de Capítulos",
        },
        "# INDEX.MD\n",
      );

    const next = appendToBody(current, link);
    await this.writeText(indexPath, next);
    await this.changelog?.record({
      action: existing === null ? "create" : "update",
      filePath: indexPath,
      before: existing,
      after: next,
      actor: this.actorFor(source),
      bookPath: book,
    });
  }

  /**
   * Cria uma ficha (arquivo numerado) a partir do `template.md` da pasta.
   * @param {string} folder - Pasta relativa ao livro.
   * @param {Object<string, string>} values - Valores efetivos por id de campo.
   * @param {"ui"|"ai"} source - Origem da criação.
   * @returns {Promise<Object>} Dados da ficha criada.
   */
  async createEntity(folder, values, source) {
    const book = this.requireBookPath();
    const { template } = await this.loadEntityTemplate(folder);
    const folderPath = `${book}/${folder}`;

    const prefix = ENTITY_FILE_PREFIX[folder.split("/")[1]] || "ficha";
    const entries = await this.listDir(folderPath);
    const number = nextNumber(
      entries.map((e) => e.name),
      new RegExp(`^${prefix}_(\\d+)\\.md`, "i"),
    );
    const fileName = `${prefix}_${pad(number)}.md`;
    const path = `${folderPath}/${fileName}`;

    const title = resolveTitle(template, values) || "Nova ficha";
    const { metadata, body } = applyTemplateValues(template, values);
    const finalMeta = { ...DEFAULT_FILE_FLAGS, ...metadata, title };

    // O nome da ficha vira o título "# Nome" do corpo (substitui o título genérico do modelo)
    const content = stringifyFrontmatter(
      finalMeta,
      replaceFirstHeading(body, title),
    );
    await this.writeNewFile(path, content, source);
    // A ficha entra no índice da categoria (personagens, locais ou conceitos/sistemas)
    await addEntityToIndex({
      book,
      relPath: `${folder}/${fileName}`,
      title,
      changelog: this.changelog,
      actor: this.actorFor(source),
    });

    const result = {
      kind: "entity",
      bookPath: book,
      folder,
      path,
      relativePath: `${folder}/${fileName}`,
      title,
      source,
    };
    this.notify("file:created", result);
    return result;
  }

  /**
   * Cria uma anotação (arquivo numerado) na pasta `notes`.
   * @param {Object<string, string>} values - Valores efetivos (`title`).
   * @param {"ui"|"ai"} source - Origem da criação.
   * @returns {Promise<Object>} Dados da anotação criada.
   */
  async createNote(values, source, folder = "notes") {
    const book = this.requireBookPath();
    if (folder !== "notes" && !folder.startsWith("notes/")) {
      throw new Error("Anotações só podem ser criadas dentro de `notes`.");
    }
    const folderPath = `${book}/${folder}`;
    const title = values.title;

    const entries = await this.listDir(folderPath);
    const number = nextNumber(
      entries.map((e) => e.name),
      /^note_(\d+)\.md/i,
    );
    const fileName = `note_${pad(number)}.md`;
    const path = `${folderPath}/${fileName}`;

    const content = stringifyFrontmatter(
      // Anotações herdam `aiWrite` do folder.yml de notes (não gravam a permissão no arquivo)
      { ...withoutAiWrite(DEFAULT_FILE_FLAGS), title },
      `# ${title}\n`,
    );
    await this.writeNewFile(path, content, source);

    const result = {
      kind: "note",
      bookPath: book,
      folder,
      path,
      relativePath: `${folder}/${fileName}`,
      title,
      source,
    };
    this.notify("file:created", result);
    return result;
  }

  /**
   * Notifica os dois barramentos sobre um item criado.
   * @param {"book:created"|"chapter:created"|"file:created"} event - Nome do evento.
   * @param {Object} payload - Dados do item criado.
   * @returns {void}
   */
  notify(event, payload) {
    domainBus.emit(event, payload);
    uiBus.emit(event, payload);
  }
}
