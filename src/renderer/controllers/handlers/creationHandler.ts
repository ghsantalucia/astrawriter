// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Handler do fluxo de criação (livro, capítulo, ficha e anotação): abre o wizard, executa a criação
 * enviada por ele e mantém a interface sincronizada (lista de livros e árvore de arquivos).
 */

import { uiBus } from "../../events/uiBus.js";
import { normalizePath, uniqueId } from "../../utils/helpers.js";
import * as bookHandler from "./bookHandler.js";
import * as variablesHandler from "./variablesHandler.js";

/**
 * Abre o wizard de criação do tipo solicitado, montado a partir da especificação do serviço.
 * @param {{kind: "book"|"chapter"|"entity"|"note", folder?: string}} params - Tipo e, para fichas, a pasta.
 * @param {Object} state - Estado global da aplicação.
 * @param {import('../../services/creationService.js').CreationService} creationService - Serviço de criação.
 * @returns {Promise<void>}
 */
export async function onCreateRequested(
  { kind, folder, prefill },
  state,
  creationService,
) {
  if (kind !== "book" && state.aiLockState) {
    uiBus.emit("toast:show", {
      message: "Aguarde a IA terminar de trabalhar no projeto.",
      type: "info",
    });
    return;
  }

  try {
    const spec = await creationService.getSpec({ kind, folder });
    // Valores já conhecidos (ex.: título extraído de um arquivo importado) entram como padrão dos campos
    if (prefill) {
      for (const step of spec.steps || []) {
        for (const field of step.fields || []) {
          if (prefill[field.id] !== undefined) field.value = prefill[field.id];
        }
      }
    }

    uiBus.emit("wizard:open", {
      wizardId: uniqueId(kind),
      kind,
      title: spec.title,
      submitLabel: spec.submitLabel,
      allowSkip: spec.allowSkip,
      context: spec.context,
      steps: spec.steps,
    });
  } catch (error) {
    console.error("[CreationHandler] Erro ao abrir o wizard:", error);
    uiBus.emit("toast:show", { message: error.message, type: "error" });
  }
}

/**
 * Trata o envio de um wizard: executa a ação do tipo correspondente e avisa o wizard do resultado
 * (`wizard:completed` ou `wizard:failed`).
 * @param {{wizardId: string, kind: string, context: Object, values: Object<string, string>}} payload - Dados enviados pelo wizard.
 * @param {Object} state - Estado global da aplicação.
 * @param {Object} services - Serviços da aplicação.
 * @returns {Promise<void>}
 */
export async function onWizardSubmit(payload, state, services) {
  const { wizardId, kind, context = {}, values = {} } = payload;

  try {
    let result;

    if (kind === "variables") {
      result = await variablesHandler.onVariablesSave(
        { values, context },
        state,
        services.file,
      );
      uiBus.emit("toast:show", {
        message:
          result.changes.length > 0
            ? "Variáveis atualizadas (rascunho salvo)."
            : "Nenhuma variável foi alterada.",
        type: result.changes.length > 0 ? "success" : "info",
      });
    } else {
      result = await services.creation.create({
        kind,
        folder: context.folder,
        values,
        source: "ui",
      });
      await openCreated(result, state, services);
      uiBus.emit("toast:show", {
        message: `"${result.title}" criado com sucesso.`,
        type: "success",
      });
    }

    uiBus.emit("wizard:completed", { wizardId, kind, result });
  } catch (error) {
    console.error("[CreationHandler] Falha no wizard:", error);
    uiBus.emit("wizard:failed", { wizardId, kind, error: error.message });
  }
}

/**
 * Após a criação pela interface, deixa o item pronto para uso: seleciona o livro novo ou abre o arquivo criado.
 * @param {Object} result - Resultado de {@link CreationService#create}.
 * @param {Object} state - Estado global da aplicação.
 * @param {Object} services - Serviços da aplicação.
 * @returns {Promise<void>}
 */
async function openCreated(result, state, services) {
  if (result.kind === "book") {
    await bookHandler.refreshBookList(state, services.book);
    const created = state.bookList.find(
      (b) => b.folderName === result.folderName,
    );
    if (created) uiBus.emit("book:selected", created.fullPath);
    return;
  }

  // A árvore precisa estar atualizada antes de o explorer selecionar o novo arquivo
  await onTreeChanged(result, state, services.book);
  uiBus.emit("editor:open-file", { path: normalizePath(result.path) });
}

/**
 * Atualiza o mapa de arquivos do livro atual e avisa a interface (`tree:updated`) quando o item
 * criado pertence a ele.
 * @param {{bookPath: string}} payload - Dados do item criado.
 * @param {Object} state - Estado global da aplicação.
 * @param {import('../../services/bookService.js').BookService} bookService - Serviço de livros.
 * @returns {Promise<void>}
 */
export async function onTreeChanged({ bookPath }, state, bookService) {
  if (!state.currentBookPath) return;
  if (normalizePath(bookPath) !== normalizePath(state.currentBookPath)) return;

  state.currentBookMap = await bookService.getMap(
    normalizePath(state.currentBookPath),
  );
  uiBus.emit("tree:updated");
}

/**
 * Reage à criação de um livro (pela UI ou pela IA): atualiza a lista de livros exibida.
 * @param {Object} state - Estado global da aplicação.
 * @param {import('../../services/bookService.js').BookService} bookService - Serviço de livros.
 * @returns {Promise<void>}
 */
export async function onBookCreated(state, bookService) {
  await bookHandler.refreshBookList(state, bookService);
}
