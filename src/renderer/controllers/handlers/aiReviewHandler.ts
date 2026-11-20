// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Handler da janela de revisão das alterações da IA: compara a versão antiga (estática, Markdown interpretado)
 * com a versão nova (no editor completo do app, editável), destacando em verde o que a IA incluiu e em vermelho o que
 * ela removeu. O resultado da revisão é anunciado no chat como mensagem do sistema.
 */

import Handlebars from "handlebars";
import { marked } from "marked";
import DOMPurify from "dompurify";

import { uiBus } from "../../events/uiBus.js";
import { diffLines } from "../../utils/diff.js";
import { normalizePath } from "../../utils/helpers.js";
import { flattenBookTree } from "../../utils/bookFiles.js";
import { parseTags } from "../../../shared/tags.js";
import { parseMarkdown, splitFrontmatter } from "../../utils/markdown.js";
import { flattenVariables } from "../../utils/template.js";
import { EditorKit } from "../../components/Editor/EditorKit.js";
import reviewTpl from "../../components/Modal/templates/aiReview.hbs?raw";

/**
 * Abre, em sequência, a janela de comparação de cada arquivo alterado pela IA.
 * @param {{files: string[]}} payload - Caminhos absolutos dos arquivos originais (.md).
 * @param {Object} fileService - Instância do FileService.
 * @param {Object} state - Estado global (arquivos do livro, para os links do editor).
 * @returns {Promise<void>}
 */
export async function onAiReviewOpen({ files }, fileService, state) {
  for (const originalPath of files) {
    await reviewFile(originalPath, fileService, state);
  }
}

/**
 * Modo autônomo: grava direto o que a IA escreveu, sem abrir a janela de revisão. Rascunhos em que a IA não mudou nada
 * são descartados. O changelog atribui a alteração à IA (o rascunho é dela) e permite o rollback.
 * @param {{files: string[]}} payload - Caminhos absolutos dos arquivos originais (.md).
 * @param {Object} fileService - Instância do FileService.
 * @param {Object} state - Estado global.
 * @returns {Promise<string[]>} Arquivos efetivamente gravados.
 */
export async function autoApplyAiEdits({ files }, fileService, state) {
  const applied = [];
  for (const originalPath of files) {
    const tempPath = fileService.getTempPath(originalPath);
    const [original, draft] = await Promise.all([
      window.electronAPI.readFile(originalPath),
      window.electronAPI.readFile(tempPath),
    ]);
    if (draft === null) continue;

    const normPath = normalizePath(originalPath);
    const { metadata } = parseMarkdown(draft);
    const title = metadata.title || normPath.split("/").pop();
    const unchanged =
      splitFrontmatter(original ?? "").body === splitFrontmatter(draft).body &&
      JSON.stringify(parseMarkdown(original ?? "").metadata) === JSON.stringify(metadata);
    if (unchanged) {
      await fileService.deleteFile(tempPath);
      uiBus.emit("temp-file:deleted", normPath);
      uiBus.emit("chat:system-notice", { text: `A IA não alterou o arquivo "${title}".` });
      continue;
    }

    const res = await fileService.saveFile(originalPath, draft);
    if (!res.success) {
      toastError(res.error);
      continue;
    }
    uiBus.emit("temp-file:synced", normPath);
    uiBus.emit("chat:system-notice", { text: `A IA gravou o arquivo "${title}" (modo autônomo).` });
    // O arquivo aberto no editor é recarregado com a versão nova
    if (normalizePath(state.currentFilePath || "").replace(/\.temp$/, "") === normPath) {
      uiBus.emit("editor:open-file", { path: normPath });
    }
    applied.push(originalPath);
  }
  return applied;
}

/**
 * Texto de um bloco, sem espaços (comparação de blocos independente da formatação).
 * @param {string} text - Texto do bloco.
 * @returns {string}
 */
const normalizeBlock = (text) => String(text || "").replace(/\s+/g, "");

/**
 * Cria o plugin do editor que marca (decoração `diff-added`) os blocos novos da IA no modo visual.
 * @param {Set<number>} added - Índices (base 0) dos blocos de nível superior que são novos.
 * @returns {Function} Plugin do Toast UI.
 */
function createAddedPlugin(added) {
  return ({ pmState, pmView }) => {
    const { Plugin, PluginKey } = pmState;
    const { Decoration, DecorationSet } = pmView;
    return {
      wysiwygPlugins: [
        () =>
          new Plugin({
            key: new PluginKey("aiDiffAdded"),
            props: {
              decorations(state) {
                const decorations = [];
                state.doc.forEach((node, offset, index) => {
                  if (added.has(index)) {
                    decorations.push(
                      Decoration.node(offset, offset + node.nodeSize, {
                        class: "diff-added",
                      }),
                    );
                  }
                });
                return DecorationSet.create(state.doc, decorations);
              },
            },
          }),
      ],
    };
  };
}

/**
 * Renderiza a versão antiga (Markdown interpretado e estático), marcando em vermelho os blocos removidos.
 * @param {string} body - Corpo antigo.
 * @param {Set<number>} removed - Índices dos blocos removidos.
 * @returns {{html: string, blocks: string[]}} HTML final e o texto normalizado de cada bloco.
 */
function renderOld(body, removed) {
  const doc = new DOMParser().parseFromString(
    DOMPurify.sanitize(marked.parse(body, { gfm: true })),
    "text/html",
  );
  const blocks = [...doc.body.children];
  blocks.forEach((el, index) => {
    if (removed.has(index)) el.classList.add("diff-removed");
  });
  return {
    html: doc.body.innerHTML,
    blocks: blocks.map((el) => normalizeBlock(el.textContent)),
  };
}

/**
 * Lista as variáveis do frontmatter (`data`) cujo valor mudou entre duas versões do arquivo.
 * @param {Object} before - Frontmatter antigo.
 * @param {Object} after - Frontmatter novo.
 * @returns {Array<{label: string, previous: string, value: string}>}
 */
function describeDataChanges(before, after) {
  const previous = new Map(
    flattenVariables(before?.data).map((v) => [v.id, v.content]),
  );
  const changes = flattenVariables(after?.data)
    .filter((v) => (previous.get(v.id) ?? "") !== v.content)
    .map((v) => ({
      label: v.placeholder || v.id,
      previous: previous.get(v.id) ?? "",
      value: v.content,
    }));

  const oldTags = parseTags(before?.tags).join(", ");
  const newTags = parseTags(after?.tags).join(", ");
  if (oldTags !== newTags) {
    changes.push({ label: "Tags", previous: oldTags, value: newTags });
  }
  return changes;
}

/**
 * Mostra a janela de comparação de um arquivo e resolve quando o usuário escolhe uma versão.
 * @param {string} originalPath - Arquivo oficial.
 * @param {Object} fileService - Instância do FileService.
 * @param {Object} state - Estado global.
 * @returns {Promise<void>}
 */
async function reviewFile(originalPath, fileService, state) {
  const tempPath = fileService.getTempPath(originalPath);
  const [original, draft] = await Promise.all([
    window.electronAPI.readFile(originalPath),
    window.electronAPI.readFile(tempPath),
  ]);
  if (draft === null) return; // rascunho já resolvido

  const oldPart = splitFrontmatter(original ?? "");
  const newPart = splitFrontmatter(draft);
  const normPath = normalizePath(originalPath);
  const { metadata } = parseMarkdown(draft);
  const title = metadata.title || normPath.split("/").pop();

  // A IA não mudou nada (nem o texto nem os dados do frontmatter): descarta o rascunho sem incomodar o usuário
  const sameData =
    JSON.stringify(parseMarkdown(original ?? "").metadata) ===
    JSON.stringify(metadata);
  if (oldPart.body === newPart.body && sameData) {
    await fileService.deleteFile(tempPath);
    uiBus.emit("temp-file:deleted", normPath);
    uiBus.emit("chat:system-notice", {
      text: `A IA não alterou o arquivo "${title}".`,
    });
    return;
  }

  // Alteração só nos dados (variáveis) do frontmatter: o texto é igual, então a tela lista o que mudou
  const dataChanges =
    oldPart.body === newPart.body
      ? describeDataChanges(parseMarkdown(original ?? "").metadata, metadata)
      : [];

  return new Promise((resolve) => {
    let kit = null;
    const added = new Set();

    uiBus.emit("modal:open", {
      id: "ai-review-modal",
      title: `Revisar alterações da IA: ${title}`,
      content: Handlebars.compile(reviewTpl)({ dataChanges }),
      windowClass: "modal-wide",
      closable: false,
      buttons: [
        {
          text: "Manter versão antiga (descartar IA)",
          class: "btn-danger",
          onClick: async (modal) => {
            const res = await fileService.deleteFile(tempPath);
            if (!res.success) return toastError(res.error);
            uiBus.emit("temp-file:deleted", normPath);
            uiBus.emit("chat:system-notice", {
              text: `A edição da IA para o arquivo "${title}" foi descartada, nada foi alterado.`,
            });
            kit?.destroy();
            modal.close();
            resolve();
          },
        },
        {
          text: "Manter versão nova",
          class: "btn-primary",
          onClick: async (modal) => {
            // O usuário pode ter editado a versão da IA: persiste exatamente o que está no editor
            const content = newPart.frontmatter + kit.editor.getMarkdown();
            const res = await fileService.saveFile(originalPath, content);
            if (!res.success) return toastError(res.error);
            uiBus.emit("temp-file:synced", normPath);
            uiBus.emit("chat:system-notice", {
              text: `O arquivo "${title}" foi editado com a versão da IA.`,
            });
            kit.destroy();
            modal.close();
            resolve();
          },
        },
      ],
      onMounted: (modal) => {
        const root = modal.element;
        const host = root.querySelector("#ai-review-editor-host");

        // Editor completo do app (com todos os botões personalizados) para a versão nova
        kit = new EditorKit({
          el: root.querySelector("#ai-review-editor"),
          host,
          initialEditType: "wysiwyg",
          initialValue: newPart.body,
          getFiles: () =>
            state?.currentBookPath && state.currentBookMap
              ? flattenBookTree(state.currentBookMap, state.currentBookPath)
              : [],
          plugins: [createAddedPlugin(added)],
        });

        // Diferença por blocos: blocos novos (verde, à direita) e removidos (vermelho, à esquerda)
        const newBlocks = [];
        kit.editor.wwEditor.view.state.doc.forEach((node) =>
          newBlocks.push(normalizeBlock(node.textContent)),
        );
        const probe = renderOld(oldPart.body, new Set());
        const { oldLines, newLines } = diffLines(
          probe.blocks.join("\n"),
          newBlocks.join("\n"),
        );
        const removed = new Set(
          oldLines.flatMap((line, i) => (line.deleted ? [i] : [])),
        );
        newLines.forEach((line, i) => line.added && added.add(i));

        root.querySelector("#ai-review-old").innerHTML = renderOld(
          oldPart.body,
          removed,
        ).html;
        kit.refresh();
      },
    });
  });
}

/**
 * Avisa uma falha ao gravar a escolha do usuário.
 * @param {string} error - Mensagem de erro.
 * @returns {void}
 */
function toastError(error) {
  uiBus.emit("toast:show", {
    message: `Erro ao salvar a escolha: ${error}`,
    type: "error",
  });
}
