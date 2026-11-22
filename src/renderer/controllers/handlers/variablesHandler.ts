/**
 * @file Handler da edição dos dados (título e variáveis do frontmatter `data`) de um arquivo: pelo modal (aberto pelo
 * botão de caneta do explorer, mesmo com o arquivo fechado) e pela caixa "Dados do arquivo" do editor.
 *
 * Alterar o nome (variável `title` ou o campo Título) atualiza também o título do arquivo e o H1 do corpo: um H1
 * editado à mão é sobrescrito e um H1 removido é recriado.
 */

import { uiBus } from "../../events/uiBus.js";
import { domainBus } from "../../events/domainBus.js";
import { normalizePath, uniqueId } from "../../utils/helpers.js";
import { parseTags } from "../../../shared/tags.js";
import { parseMarkdown, stringifyFrontmatter } from "../../utils/markdown.js";
import {
  editableFields,
  flattenVariables,
  setVariableContent,
  replaceFirstHeading,
  TITLE_FIELD_ID,
  TAGS_FIELD_ID,
} from "../../utils/template.js";

/**
 * Indica se o caminho é o arquivo aberto no editor.
 * @param {Object} state - Estado global.
 * @param {string} path - Caminho do arquivo.
 * @returns {boolean}
 */
function isOpenFile(state, path) {
  return (
    Boolean(state.currentFilePath) &&
    normalizePath(state.currentFilePath).replace(/\.temp$/, "") ===
      normalizePath(path).replace(/\.temp$/, "")
  );
}

/**
 * Carrega o frontmatter e o corpo de um arquivo (do editor, se aberto; senão do disco, preferindo o rascunho).
 * @param {Object} state - Estado global.
 * @param {import('../../services/fileService.js').FileService} fileService - Serviço de arquivos.
 * @param {string} path - Caminho do arquivo.
 * @returns {Promise<{metadata: Object, body: string, open: boolean}|null>}
 */
async function loadDocument(state, fileService, path) {
  if (isOpenFile(state, path)) {
    return {
      metadata: state.currentFileMetadata || {},
      body: state.editor?.getMarkdown() ?? "",
      open: true,
    };
  }
  const { content } = await fileService.readFile(path);
  if (content === null) return null;
  const { metadata, body } = parseMarkdown(content);
  return { metadata, body, open: false };
}

/**
 * Abre o modal (wizard de passo único) com os campos do arquivo. Sem `payload.data.path`, usa o arquivo aberto.
 * @param {Object} state - Estado global da aplicação.
 * @param {import('../../services/fileService.js').FileService} fileService - Serviço de arquivos.
 * @param {{data?: {path?: string}}} [payload] - Dados do botão do explorer.
 * @returns {Promise<void>}
 */
export async function onVariablesOpen(state, fileService, payload) {
  const path = payload?.data?.path || state.currentFilePath;
  if (!path) {
    uiBus.emit("toast:show", {
      message: "Abra um arquivo para ver os dados.",
      type: "info",
    });
    return;
  }

  const doc = await loadDocument(state, fileService, path);
  if (!doc) return;

  const rel = normalizePath(path)
    .replace(normalizePath(state.currentBookPath || ""), "")
    .replace(/^\/+/, "");
  const fields = editableFields(doc.metadata, {
    title: rel.startsWith("notes/"),
  });
  if (fields.length === 0) {
    uiBus.emit("toast:show", {
      message: "Este arquivo não possui dados para editar.",
      type: "info",
    });
    return;
  }

  const editable = doc.metadata.humanWrite === true && !state.aiLockState;
  const fileTitle = doc.metadata.title || "arquivo";

  uiBus.emit("wizard:open", {
    wizardId: uniqueId("variables"),
    kind: "variables",
    title: `Dados — ${fileTitle}`,
    submitLabel: "Salvar",
    allowSkip: false,
    readOnly: !editable,
    context: { path },
    steps: [
      {
        id: "variables",
        title: "Dados do arquivo",
        description: editable
          ? "Altere os valores e salve. As mudanças vão para o rascunho do arquivo."
          : "Este arquivo é somente leitura no momento.",
        fields: fields.map((field) => ({
          id: field.id,
          label: field.label,
          type: "text",
          placeholder: field.placeholder,
          hint: field.id === TITLE_FIELD_ID ? "título" : field.id,
          required: field.required,
          value: field.value,
        })),
      },
    ],
  });
}

/**
 * Salva os dados alterados no rascunho (.temp) do arquivo, esteja ele aberto no editor ou não, e notifica os
 * barramentos. Renomear atualiza o título e o H1.
 * @param {{values: Object<string, string>, context: {path: string}}} payload - Valores por id de campo.
 * @param {Object} state - Estado global da aplicação.
 * @param {import('../../services/fileService.js').FileService} fileService - Serviço de arquivos.
 * @returns {Promise<{changes: Array<Object>}>} Alterações aplicadas (vazio se nada mudou).
 * @throws {Error} Se o arquivo não pode ser editado ou o rascunho não pôde ser gravado.
 */
export async function onVariablesSave({ values, context }, state, fileService) {
  const path = context?.path;
  if (!path) throw new Error("Arquivo não informado.");

  const doc = await loadDocument(state, fileService, path);
  if (!doc) throw new Error("Não foi possível ler o arquivo.");
  if (doc.metadata.humanWrite !== true || state.aiLockState) {
    throw new Error("O arquivo está somente leitura no momento.");
  }

  const { metadata } = doc;
  let { body } = doc;
  metadata.data ??= {};

  const changes = [];
  for (const variable of flattenVariables(metadata.data)) {
    if (!(variable.id in values)) continue;
    const next = String(values[variable.id] ?? "").trim();
    if (next !== variable.content) {
      setVariableContent(metadata.data, variable.path, next);
      changes.push({
        id: variable.id,
        previous: variable.content,
        value: next,
      });
    }
  }
  if (TITLE_FIELD_ID in values) {
    const next = String(values[TITLE_FIELD_ID] ?? "").trim();
    if (next && next !== metadata.title) {
      changes.push({ id: "title", previous: metadata.title, value: next });
    }
  }

  // Tags (variável especial `tags` do frontmatter)
  if (TAGS_FIELD_ID in values) {
    const previous = parseTags(metadata.tags);
    const next = parseTags(values[TAGS_FIELD_ID]);
    if (previous.join(",") !== next.join(",")) {
      if (next.length > 0) metadata.tags = next;
      else delete metadata.tags;
      changes.push({
        id: "tags",
        previous: previous.join(", "),
        value: next.join(", "),
      });
    }
  }

  if (changes.length === 0) return { changes };

  // Renomear (nome do personagem, local, sistema, anotação...) atualiza o título do arquivo e o H1 do corpo
  const renamed = changes.find((change) => change.id === "title");
  if (renamed?.value) {
    metadata.title = renamed.value;
    body = replaceFirstHeading(body, renamed.value);
    if (doc.open) uiBus.emit("editor:set-body", { body });
  }

  const result = await fileService.saveTempFile(
    path,
    stringifyFrontmatter(metadata, body),
  );
  if (!result?.success) {
    throw new Error(result?.error || "Não foi possível gravar o rascunho.");
  }

  const payload = { path: normalizePath(path), changes, metadata };

  // Marca o arquivo como rascunho (asterisco, botão de sincronizar) e anuncia a mudança
  uiBus.emit("temp-file:saved", normalizePath(path));
  uiBus.emit("file:variables-changed", payload);
  domainBus.emit("file:variables-changed", payload);

  return { changes };
}

/**
 * Salva a caixa "Dados do arquivo" do editor (arquivo aberto) e avisa o resultado.
 * @param {{values: Object<string, string>}} payload - Valores por id de campo.
 * @param {Object} state - Estado global da aplicação.
 * @param {import('../../services/fileService.js').FileService} fileService - Serviço de arquivos.
 * @returns {Promise<void>}
 */
export async function onVariablesInlineSave({ values }, state, fileService) {
  try {
    const { changes } = await onVariablesSave(
      { values, context: { path: state.currentFilePath } },
      state,
      fileService,
    );
    uiBus.emit("toast:show", {
      message: changes.length
        ? "Dados do arquivo salvos no rascunho."
        : "Nada foi alterado.",
      type: changes.length ? "success" : "info",
    });
  } catch (error) {
    uiBus.emit("toast:show", { message: error.message, type: "error" });
  }
}
