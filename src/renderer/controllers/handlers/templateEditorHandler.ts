// @ts-nocheck
/**
 * @file Janela de edição de templates: uma janela grande com uma instância do editor do app e a lista de todos os templates
 * de um perfil (com nomes legíveis). No lugar de sincronizar há "Salvar template"; um aviso fixo deixa claro que o que se
 * edita é um modelo e não um livro. Editar nunca altera a pasta do app: "Restaurar" volta ao original.
 */

import Handlebars from "handlebars";
import { uiBus } from "../../events/uiBus.js";
import { EditorKit } from "../../components/Editor/EditorKit.js";
import { TEMPLATE_KINDS } from "../../../shared/templateKinds.js";
import { flattenVariables } from "../../utils/template.js";
import { parseMarkdown } from "../../utils/markdown.js";
import { escapeHtml, normalizePath } from "../../utils/helpers.js";
import editorTpl from "../../components/Modal/templates/templateEditor.hbs?raw";
import "../../components/Modal/templateEditor.css";

/**
 * Variáveis (campos fixos) de um tipo de template, lidas do template base do livro.
 * @param {string} kindId - Tipo de template.
 * @returns {Promise<string[]>} Rótulos das variáveis.
 */
async function variablesOf(kindId) {
  const kind = TEMPLATE_KINDS.find((k) => k.id === kindId);
  const paths = await window.electronAPI.getPaths();
  const raw = await window.electronAPI.readFile(`${normalizePath(paths.templatesDir)}/${kind.base}`);
  if (!raw) return [];
  return flattenVariables(parseMarkdown(raw).metadata?.data).map((v) => v.placeholder || v.id);
}

/**
 * Abre a janela de edição dos templates de um perfil.
 * @param {{profile: string}} payload - Perfil a editar.
 * @returns {Promise<void>}
 */
export async function openTemplateEditor({ profile }) {
  const api = window.electronAPI.templates;
  const profiles = await api.profiles();
  const info = profiles.find((p) => p.id === profile);
  if (!info) {
    uiBus.emit("toast:show", { message: "Perfil de template não encontrado.", type: "error" });
    return;
  }

  let kit = null;
  let current = TEMPLATE_KINDS[0].id;
  let dirty = false;
  let edited = new Set();
  let modalRef = null;

  const rootOf = () => modalRef?.element;
  const $ = (selector) => rootOf()?.querySelector(selector);

  /** Atualiza a lista lateral e o estado do template aberto. */
  const paint = () => {
    $("#tpl-list").innerHTML = TEMPLATE_KINDS.map(
      (k) => `<button type="button" class="tpl-item ${k.id === current ? "active" : ""}" data-kind="${k.id}">
        <strong>${escapeHtml(k.label)}</strong>
        <small>${escapeHtml(k.description)}</small>
        ${edited.has(k.id) ? '<span class="tpl-edited">editado</span>' : ""}
      </button>`,
    ).join("");
    const kind = TEMPLATE_KINDS.find((k) => k.id === current);
    $("#tpl-kind-title").textContent = kind.label;
    $("#tpl-state").textContent = dirty ? "alterações não salvas" : edited.has(current) ? "editado por você" : "original do app";
    $("#tpl-state").classList.toggle("dirty", dirty);
    const restore = rootOf()?.closest(".app-modal-window")?.querySelector('[data-tpl="restore"]');
    if (restore) restore.disabled = !edited.has(current) && !dirty;
  };

  /** Carrega um template no editor. */
  const load = async (kindId) => {
    current = kindId;
    const found = await api.read(profile, kindId);
    edited = new Set((await Promise.all(TEMPLATE_KINDS.map(async (k) => ((await api.read(profile, k.id))?.edited ? k.id : null)))).filter(Boolean));
    dirty = false;
    kit.editor.setMarkdown(String(found?.body ?? "").replace(/^\s+/, ""), false);
    // O setMarkdown dispara a mudança: só conta como edição depois de carregar
    dirty = false;
    const names = await variablesOf(kindId);
    $("#tpl-vars").innerHTML = names.length
      ? `<span>Campos fixos (não mudam por perfil):</span> ${names.map((n) => `<em>${escapeHtml(n)}</em>`).join("")}`
      : "<span>Este template não tem campos fixos: só o corpo é editável.</span>";
    paint();
  };

  /** Pede confirmação antes de descartar alterações não salvas. */
  const confirmDiscard = (then) => {
    if (!dirty) return then();
    uiBus.emit("modal:open", {
      id: "template-discard",
      title: "Descartar alterações?",
      content: '<div class="cn-confirm"><p>Este template tem alterações que ainda não foram salvas. Se continuar, elas serão perdidas.</p></div>',
      buttons: [
        { text: "Voltar", class: "btn-secondary" },
        {
          text: "Descartar",
          class: "btn-danger",
          onClick: (modal) => {
            modal.close();
            dirty = false;
            then();
          },
        },
      ],
    });
  };

  uiBus.emit("modal:open", {
    id: "template-editor-modal",
    title: `Templates: ${info.label}`,
    content: Handlebars.compile(editorTpl)({ profile: info.label }),
    windowClass: "modal-wide",
    closable: false,
    buttons: [
      {
        text: "Fechar",
        class: "btn-secondary",
        onClick: (modal) =>
          confirmDiscard(() => {
            kit?.destroy();
            modal.close();
            uiBus.emit("central:refresh");
          }),
      },
      {
        text: "Restaurar este template",
        class: "btn-danger",
        onClick: () => {
          uiBus.emit("modal:open", {
            id: "template-restore",
            title: "Restaurar o template original?",
            content: `<div class="cn-confirm"><p>A sua edição deste template será descartada e o original do app volta a valer. O original nunca foi alterado.</p></div>`,
            buttons: [
              { text: "Cancelar", class: "btn-secondary" },
              {
                text: "Restaurar",
                class: "btn-danger",
                onClick: async (modal) => {
                  modal.close();
                  await api.restore(profile, current);
                  await load(current);
                  uiBus.emit("toast:show", { message: "Template restaurado ao original.", type: "success" });
                },
              },
            ],
          });
        },
      },
      {
        text: "Salvar template",
        class: "btn-primary",
        onClick: async () => {
          const result = await api.save(profile, current, kit.editor.getMarkdown());
          if (!result?.success) return uiBus.emit("toast:show", { message: result?.error || "Falha ao salvar o template.", type: "error" });
          dirty = false;
          edited.add(current);
          paint();
          uiBus.emit("toast:show", { message: "Template salvo. Vale para os novos arquivos criados com este perfil.", type: "success" });
        },
      },
    ],
    onMounted: async (modal) => {
      modalRef = modal;
      // Marca o botão de restaurar para o paint() localizar
      const footerButtons = modal.element.querySelectorAll(".modal-footer button");
      footerButtons[1]?.setAttribute("data-tpl", "restore");

      kit = new EditorKit({
        el: modal.element.querySelector("#tpl-editor"),
        host: modal.element.querySelector("#tpl-editor-host"),
        initialEditType: "wysiwyg",
        initialValue: "",
        getFiles: () => [],
        onChange: () => {
          if (!kit?.ready) return;
          dirty = true;
          paint();
        },
      });
      // O editor só passa a contar edições depois do primeiro carregamento
      await load(current);
      kit.ready = true;

      modal.element.querySelector("#tpl-list").addEventListener("click", (e) => {
        const item = e.target.closest("[data-kind]");
        if (!item || item.dataset.kind === current) return;
        confirmDiscard(() => load(item.dataset.kind));
      });
      kit.refresh?.();
    },
  });
}
