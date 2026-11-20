// @ts-nocheck
/**
 * @file Aba "Atalhos" da Central do Sistema: lista de todos os atalhos, personalização dos que podem ser alterados e
 * explicação dos fixos (setas do explorer, Esc, atalhos do editor).
 */

import { FIXED_SHORTCUTS, SHORTCUT_ACTIONS } from "../../../../services/shortcutService.js";
import { esc, mount } from "../panelKit.js";

/**
 * Teclas de uma combinação como "chips" (`Ctrl` `Shift` `Y`).
 * @param {string} combo - Combinação (`Ctrl+Shift+Y`).
 * @returns {string}
 */
function keysHtml(combo) {
  if (!combo) return '<span class="cn-hint">sem atalho</span>';
  return combo
    .split("+")
    .map((k) => `<kbd class="cn-key">${esc(k)}</kbd>`)
    .join("");
}

/**
 * Aba Atalhos.
 * @param {Object} ctx - Contexto da central.
 * @param {HTMLElement} el - Contêiner.
 * @returns {void}
 */
export function renderShortcuts(ctx, el) {
  const shortcuts = ctx.services.shortcuts;
  const groups = [...new Set(SHORTCUT_ACTIONS.map((a) => a.group))];
  const customized = (a) => shortcuts.binding(a.id) !== a.default;

  const editable = groups
    .map(
      (g) => `<section class="cn-section">
        <h4>${esc(g)}</h4>
        <table class="cn-table cn-shortcuts"><tbody>
        ${SHORTCUT_ACTIONS.filter((a) => a.group === g)
          .map(
            (a) => `<tr>
              <td>${esc(a.label)}</td>
              <td class="cn-keys" id="keys-${esc(a.id)}">${keysHtml(shortcuts.binding(a.id))}</td>
              <td style="text-align:right;white-space:nowrap">
                <button class="cn-btn small" data-act="record" data-id="${esc(a.id)}">Alterar</button>
                <button class="cn-btn small ghost" data-act="reset" data-id="${esc(a.id)}" ${customized(a) ? "" : "disabled"} title="Voltar ao atalho padrão (${esc(a.default)})">Padrão</button>
                <button class="cn-btn small ghost" data-act="clear" data-id="${esc(a.id)}" ${shortcuts.binding(a.id) ? "" : "disabled"} title="Remover o atalho"><i class="fa-solid fa-xmark"></i></button>
              </td>
            </tr>`,
          )
          .join("")}
        </tbody></table>
      </section>`,
    )
    .join("");

  const fixedGroups = [...new Set(FIXED_SHORTCUTS.map((f) => f.group))];
  const fixed = fixedGroups
    .map(
      (g) => `<h5 class="cn-sub">${esc(g)}</h5>
        <table class="cn-table cn-shortcuts"><tbody>
        ${FIXED_SHORTCUTS.filter((f) => f.group === g)
          .map((f) => `<tr><td class="cn-keys">${f.keys.split(" · ").map((part) => (part.includes("+") ? keysHtml(part) : part.split(" ").map((k) => `<kbd class="cn-key">${esc(k)}</kbd>`).join(""))).join('<span class="cn-hint">&nbsp;ou&nbsp;</span>')}</td><td>${esc(f.text)}</td></tr>`)
          .join("")}
        </tbody></table>`,
    )
    .join("");

  mount(
    el,
    `<section class="cn-section">
       <p class="cn-hint">Clique em <strong>Alterar</strong> e aperte a nova combinação (Esc cancela). Use <kbd class="cn-key">Ctrl</kbd> ou <kbd class="cn-key">Alt</kbd> junto com a tecla. As setas, Esc, Tab, Enter, Espaço, Backspace e as teclas de edição do sistema (copiar, colar, desfazer...) são reservadas e não podem ser usadas.</p>
       <div class="cn-row"><button class="cn-btn small" data-act="reset-all"><i class="fa-solid fa-rotate-left"></i> Restaurar todos os padrões</button></div>
     </section>
     ${editable}
     <section class="cn-section">
       <h4>Atalhos fixos</h4>
       <p class="cn-hint">Estes não podem ser personalizados. Vale destacar: o <strong>explorer</strong> inteiro se navega pelo teclado, sem o mouse.</p>
       ${fixed}
     </section>`,
    {
      record: async (btn) => {
        const id = btn.dataset.id;
        const cell = el.querySelector(`#keys-${CSS.escape(id)}`);
        const old = cell.innerHTML;
        cell.innerHTML = '<span class="cn-recording">Aperte a nova combinação… (Esc cancela)</span>';
        const combo = await shortcuts.capture();
        if (combo === null) {
          cell.innerHTML = old;
          return;
        }
        try {
          shortcuts.set(id, combo);
          ctx.toast(`Atalho alterado para ${combo}.`, "success");
        } catch (error) {
          ctx.toast(error.message, "error");
        }
        ctx.refresh();
      },
      reset: (btn) => {
        shortcuts.reset(btn.dataset.id);
        ctx.refresh();
      },
      clear: (btn) => {
        shortcuts.set(btn.dataset.id, "");
        ctx.refresh();
      },
      "reset-all": () => {
        shortcuts.resetAll();
        ctx.refresh();
      },
    },
  );
}
