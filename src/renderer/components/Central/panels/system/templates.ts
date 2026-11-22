/**
 * @file Aba "Templates" da Central do Sistema: os perfis de template (assistente, co-autor, autônomo e os criados pelo
 * usuário). Cada perfil tem o corpo de cada template de ficha e de capítulo. Daqui o usuário abre a janela de edição,
 * duplica um perfil para criar o seu, renomeia, restaura as edições ou exclui os perfis criados por ele.
 */

import { TEMPLATE_KINDS } from "../../../../../shared/templateKinds.js";
import { confirmModal, esc, mount } from "../panelKit.js";

/**
 * Aba Templates.
 * @class
 */
export class TemplatesTab {
  declare ctx: any;

  /** @param {Object} ctx - Contexto da central. */
  constructor(ctx) {
    this.ctx = ctx;
  }

  /**
   * @param {HTMLElement} el - Contêiner.
   * @returns {Promise<void>}
   */
  async render(el) {
    const ctx = this.ctx;
    const profiles = await window.electronAPI.templates.profiles();
    if (ctx.currentTab() !== "templates") return;
    const total = TEMPLATE_KINDS.length;

    const card = (p) => `
      <div class="cn-theme cn-profile-card">
        <strong>${esc(p.label)} ${p.builtin ? '<small class="cn-pill">do app</small>' : '<small class="cn-pill success">seu</small>'}</strong>
        <small>${esc(p.description)}</small>
        <small>${p.edited ? `${p.edited} de ${total} templates editados por você.` : `Nenhum template editado (${total} originais).`}</small>
        <div class="cn-row" style="gap:6px;margin-top:6px">
          <button class="cn-btn small primary" data-act="edit" data-id="${esc(p.id)}"><i class="fa-solid fa-pen"></i> Editar templates</button>
          <button class="cn-btn small ghost" data-act="copy" data-id="${esc(p.id)}" title="Criar um perfil novo a partir deste">Duplicar</button>
          ${p.builtin
            ? `<button class="cn-btn small ghost" data-act="restore-all" data-id="${esc(p.id)}" ${p.edited ? "" : "disabled"} title="Descarta todas as suas edições deste perfil">Restaurar</button>`
            : `<button class="cn-btn small ghost" data-act="rename" data-id="${esc(p.id)}">Renomear</button><button class="cn-btn small ghost" data-act="delete" data-id="${esc(p.id)}" title="Excluir"><i class="fa-regular fa-trash-can"></i></button>`}
        </div>
      </div>`;

    mount(
      el,
      `<section class="cn-section">
         <h4>Perfis de template</h4>
         <p class="cn-hint">Todos os arquivos do livro nascem de templates: fichas de personagens, ambientes, conceitos e eventos, e os arquivos de cada capítulo. Cada perfil muda só o <strong>corpo</strong> dos templates (os campos nunca mudam): o <em>Assistente</em> estimula a escrita, o <em>Co-autor</em> pede informações que a IA aproveita (como amostras de diálogo) e o <em>Autônomo</em> traz instruções claras para a IA. Ao criar um livro o perfil é escolhido pelo modo da IA, mas dá para trocar.</p>
         <p class="cn-hint">Editar um template do app <strong>não altera</strong> a pasta do app: o botão “Restaurar” descarta as suas edições e o original volta.</p>
         <div class="cn-theme-grid">${profiles.map(card).join("")}</div>
       </section>
       <section class="cn-section">
         <h4>Templates de cada perfil</h4>
         <table class="cn-table"><tbody>${TEMPLATE_KINDS.map((k) => `<tr><td><strong>${esc(k.label)}</strong></td><td>${esc(k.description)}</td></tr>`).join("")}</tbody></table>
       </section>`,
      {
        edit: (btn) => ctx.uiBus.emit("template-editor:open", { profile: btn.dataset.id }),
        copy: (btn) => this.askName("Duplicar perfil", "Nome do novo perfil", `${profiles.find((p) => p.id === btn.dataset.id)?.label} (cópia)`, async (name) => {
          const result = await window.electronAPI.templates.createProfile({ name, from: btn.dataset.id });
          ctx.toast(result?.success ? "Perfil criado. Clique em “Editar templates” para personalizá-lo." : result?.error || "Falha ao criar o perfil.", result?.success ? "success" : "error");
          ctx.refresh();
        }),
        rename: (btn) => this.askName("Renomear perfil", "Novo nome", profiles.find((p) => p.id === btn.dataset.id)?.label, async (name) => {
          const result = await window.electronAPI.templates.renameProfile(btn.dataset.id, name);
          if (!result?.success) ctx.toast(result?.error || "Falha ao renomear.", "error");
          ctx.refresh();
        }),
        delete: (btn) => {
          const p = profiles.find((x) => x.id === btn.dataset.id);
          confirmModal(ctx.uiBus, {
            title: "Excluir perfil?",
            danger: true,
            confirmText: "Excluir",
            html: `<p>O perfil <strong>${esc(p?.label)}</strong> e todos os templates dele serão excluídos. Livros que já usam este perfil mantêm os templates que têm, mas novos capítulos voltam ao perfil Assistente.</p>`,
            onConfirm: async () => {
              await window.electronAPI.templates.deleteProfile(btn.dataset.id);
              ctx.refresh();
            },
          });
        },
        "restore-all": (btn) => {
          const p = profiles.find((x) => x.id === btn.dataset.id);
          confirmModal(ctx.uiBus, {
            title: "Restaurar o perfil?",
            danger: true,
            confirmText: "Restaurar",
            html: `<p>Todas as suas edições dos templates do perfil <strong>${esc(p?.label)}</strong> serão descartadas e os originais do app voltam a valer.</p>`,
            onConfirm: async () => {
              for (const k of TEMPLATE_KINDS) await window.electronAPI.templates.restore(btn.dataset.id, k.id);
              ctx.refresh();
            },
          });
        },
      },
    );
  }

  /**
   * Janela com um campo de nome.
   * @param {string} title - Título.
   * @param {string} label - Rótulo do campo.
   * @param {string} initial - Valor inicial.
   * @param {(name: string) => Promise<void>} onOk - Chamado com o nome digitado.
   * @returns {void}
   * @private
   */
  askName(title, label, initial, onOk) {
    this.ctx.uiBus.emit("modal:open", {
      id: "template-name-modal",
      title,
      content: `<label class="modal-field">${esc(label)}<input class="modal-input" id="template-name-input" maxlength="40" value="${esc(initial || "")}" /></label>`,
      buttons: [
        { text: "Cancelar", class: "btn-secondary" },
        {
          text: "Confirmar",
          class: "btn-primary",
          onClick: async (modal) => {
            const name = (document.getElementById("template-name-input") as HTMLInputElement | null)?.value.trim();
            if (!name) return;
            modal.close();
            await onOk(name);
          },
        },
      ],
    });
  }

  /** A central foi fechada. @returns {void} */
  dispose() {}
}
