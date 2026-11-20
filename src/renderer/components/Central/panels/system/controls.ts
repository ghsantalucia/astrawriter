// @ts-nocheck
/**
 * @file Controles compartilhados pelas abas da Central do Sistema: uma linha de configuração para cada tipo de valor
 * (interruptor, número, lista de opções, horário, texto), ligada ao armazenamento de configurações (`appSettings`).
 */

import { appSettings } from "../../../../utils/appSettings.js";
import { esc, switchRow } from "../panelKit.js";

/** Unidade mostrada ao lado do valor de cada controle deslizante. */
const UNITS = { "ui.zoom": "%", "ui.night.intensity": "%", "speech.rate": "×", "editor.fontSize": " px", "productivity.idleMinutes": " min", "backup.everyHours": " h" };

/**
 * Linha de uma configuração (texto à esquerda, controle à direita).
 * @param {string} id - Id da configuração.
 * @param {Object} [options]
 * @param {string} [options.hint] - Descrição (substitui a da definição).
 * @param {boolean} [options.disabled] - Desabilitada.
 * @returns {string}
 */
export function settingRow(id, { hint, disabled = false } = {}) {
  const def = appSettings.def(id);
  const value = appSettings.get(id);
  const text = `<span class="cn-switch-text"><strong>${esc(def.label)}</strong><small>${esc(hint ?? def.help)}</small></span>`;
  const attrs = `data-change="setting" data-id="${esc(id)}" ${disabled ? "disabled" : ""}`;
  if (def.type === "bool") {
    return switchRow({ attrs, checked: Boolean(value), title: esc(def.label), hint: esc(hint ?? def.help), disabled });
  }
  let control = "";
  if (def.type === "number") {
    const step = def.max - def.min <= 5 ? 0.1 : 1;
    const unit = UNITS[id] || "";
    control = `<span class="cn-range"><input type="range" min="${def.min}" max="${def.max}" step="${step}" value="${esc(value)}" data-input="setting-live" data-id="${esc(id)}" />
      <output data-unit="${esc(unit)}">${esc(value)}${esc(unit)}</output></span>`;
  } else if (def.type === "select") {
    control = `<select class="cn-select" ${attrs}>${def.options.map((o) => `<option value="${esc(o.value)}" ${o.value === value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
  } else if (def.type === "time") {
    control = `<input class="cn-input" type="time" value="${esc(value)}" ${attrs} />`;
  } else {
    control = `<input class="cn-input" type="text" value="${esc(value)}" ${attrs} />`;
  }
  return `<div class="cn-setting-row">${text}${control}</div>`;
}

/**
 * Manipuladores `setting` (mudança) e `setting-live` (arrastar o controle de número) para a função `mount`.
 * @param {Object} ctx - Contexto da central (toast).
 * @param {() => void} [afterChange] - Chamado depois de gravar (redesenhar a aba, por exemplo).
 * @returns {Object<string, Function>}
 */
export function settingHandlers(ctx, afterChange) {
  const save = (el, redraw) => {
    const id = el.dataset.id;
    const value = el.type === "checkbox" ? el.checked : el.value;
    try {
      appSettings.set(id, value);
    } catch (error) {
      ctx.toast(error.message, "error");
      ctx.refresh();
      return;
    }
    // O número mostrado ao lado do controle acompanha enquanto arrasta
    const out = el.parentElement?.querySelector("output");
    if (out) out.textContent = `${appSettings.get(id)}${out.dataset.unit || ""}`;
    if (redraw) afterChange?.();
  };
  return {
    setting: (el) => save(el, true),
    // Controles deslizantes aplicam enquanto arrastam (sem redesenhar a aba)
    "setting-live": (el) => save(el, false),
  };
}

/**
 * Linha com um texto e um controle livre à direita.
 * @param {string} title - Título (já escapado).
 * @param {string} hint - Descrição (já escapada).
 * @param {string} control - HTML do controle.
 * @returns {string}
 */
export function customRow(title, hint, control) {
  return `<div class="cn-setting-row"><span class="cn-switch-text"><strong>${title}</strong><small>${hint}</small></span>${control}</div>`;
}
