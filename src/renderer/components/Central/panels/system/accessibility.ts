// @ts-nocheck
/**
 * @file Abas "Acessibilidade" (tamanho da fonte do app, modo noturno e narrador) e "Editor" (tamanho e fontes do texto)
 * da Central do Sistema.
 */

import { appSettings, EDITOR_FONTS } from "../../../../utils/appSettings.js";
import { esc, mount } from "../panelKit.js";
import { customRow, settingHandlers, settingRow } from "./controls.js";

/**
 * Aba Acessibilidade.
 * @param {Object} ctx - Contexto da central.
 * @param {HTMLElement} el - Contêiner.
 * @returns {Promise<void>}
 */
export async function renderAccessibility(ctx, el) {
  const narrator = ctx.services.narrator;
  const voices = narrator.supported ? await narrator.voices() : [];
  if (ctx.currentTab() !== "accessibility") return;
  const current = appSettings.get("speech.voice");
  const voiceSelect = voices.length
    ? `<select class="cn-select" data-change="setting" data-id="speech.voice" style="max-width:260px">
         <option value="">Automática (português)</option>
         ${voices.map((v) => `<option value="${esc(v.name)}" ${v.name === current ? "selected" : ""}>${esc(v.name)} (${esc(v.lang)})</option>`).join("")}
       </select>`
    : `<span class="cn-hint">${narrator.supported ? "Nenhuma voz instalada foi encontrada." : "Este computador não oferece síntese de voz."}</span>`;

  mount(
    el,
    `<section class="cn-section">
       <h4>Tamanho da fonte do app</h4>
       <div class="cn-setting-list">${settingRow("ui.zoom", { hint: "Aumenta ou diminui todo o app (menus, explorer, chat, editor). 100% é o tamanho padrão. Atalhos: Ctrl+= , Ctrl+- e Ctrl+0." })}</div>
       <div class="cn-row" style="margin-top:8px">${[80, 90, 100, 110, 125, 150].map((n) => `<button class="cn-btn small ${appSettings.get("ui.zoom") === n ? "primary" : ""}" data-act="zoom" data-value="${n}">${n}%</button>`).join("")}</div>
     </section>
     <section class="cn-section">
       <h4>Modo noturno</h4>
       <p class="cn-hint">Um filtro amarelado, que cansa menos a vista, cobre todo o app entre os horários escolhidos.</p>
       <div class="cn-setting-list">
         ${settingRow("ui.night.enabled")}
         ${settingRow("ui.night.from")}
         ${settingRow("ui.night.to")}
         ${settingRow("ui.night.intensity")}
       </div>
       <div class="cn-row" style="margin-top:8px"><button class="cn-btn" data-act="night-preview"><i class="fa-regular fa-moon"></i> Ver o filtro por 5 segundos</button></div>
     </section>
     <section class="cn-section">
       <h4>Narrador</h4>
       <p class="cn-hint">Lê o arquivo aberto em voz alta, usando as vozes do seu sistema (sem internet e sem custo). O botão <strong>Ouvir</strong> fica na barra do editor (atalho Ctrl+Shift+O).</p>
       <div class="cn-setting-list">
         ${customRow("Voz", "Vozes instaladas no seu computador.", voiceSelect)}
         ${settingRow("speech.rate")}
       </div>
       <div class="cn-row" style="margin-top:8px"><button class="cn-btn" data-act="voice-test" ${narrator.supported ? "" : "disabled"}><i class="fa-solid fa-volume-high"></i> Testar a voz</button></div>
     </section>
     <section class="cn-section">
       <p class="cn-hint">Mais opções de acessibilidade virão. Sugestões são bem-vindas.</p>
     </section>`,
    {
      ...settingHandlers(ctx, () => ctx.refresh()),
      zoom: (btn) => {
        appSettings.set("ui.zoom", Number(btn.dataset.value));
        ctx.refresh();
      },
      "night-preview": () => {
        ctx.services.appearance.previewNight(true);
        setTimeout(() => ctx.services.appearance.previewNight(false), 5000);
      },
      "voice-test": () => narrator.preview(),
    },
  );
}

/**
 * Aba Editor.
 * @param {Object} ctx - Contexto da central.
 * @param {HTMLElement} el - Contêiner.
 * @returns {void}
 */
export function renderEditorTab(ctx, el) {
  const fontOptions = (id) => {
    const value = appSettings.get(id);
    const known = EDITOR_FONTS.some((f) => f.value === value);
    return `<select class="cn-select" data-change="setting" data-id="${id}" style="max-width:260px">
      ${known ? "" : `<option value="${esc(value)}" selected>${esc(value)}</option>`}
      ${EDITOR_FONTS.map((f) => `<option value="${esc(f.value)}" ${f.value === value ? "selected" : ""}>${esc(f.label)}</option>`).join("")}
    </select>`;
  };
  const style = (id) => {
    const value = appSettings.get(id);
    return value && value !== "default" ? `font-family:${value};` : "";
  };

  mount(
    el,
    `     <section class="cn-section cn-preview-section">
       <h4><i class="fa-regular fa-eye"></i> Pré-visualização ao vivo</h4>
       <div class="cn-font-preview" id="font-preview" style="font-size:${appSettings.get("editor.fontSize")}px">
         <div class="cn-font-h" style="${style("editor.fontHeading") || style("editor.fontBody")}">Capítulo 1: O passo em falso</div>
         <p style="${style("editor.fontBody")}">O silêncio do salão pesava mais do que a armadura nas costas de X. Ele ajustou as luvas de couro, evitando olhar nos olhos da guarda.</p>
       </div>
     </section>
     <section class="cn-section">
       <h4>Texto do editor</h4>
       <div class="cn-setting-list">
         ${settingRow("editor.fontSize", { hint: "Tamanho do texto no editor, em pixels. Só o editor muda; para o app inteiro use Acessibilidade." })}
         ${customRow("Fonte do texto", "Tipo de letra dos parágrafos e listas.", fontOptions("editor.fontBody"))}
         ${customRow("Fonte dos títulos", "Pode ser diferente da fonte do texto.", fontOptions("editor.fontHeading"))}
         ${customRow("Outra fonte instalada", "Digite o nome de uma fonte do seu computador para usá-la no texto (ex.: Merriweather).", `<span class="cn-row" style="gap:6px"><input class="cn-input" id="custom-font" placeholder="Nome da fonte" style="width:180px" /><button class="cn-btn small" data-act="font-body">No texto</button><button class="cn-btn small" data-act="font-heading">Nos títulos</button></span>`)}
       </div>
     </section>`,
    {
      ...settingHandlers(ctx, () => ctx.refresh()),
      // Arrastar o tamanho atualiza a pré-visualização na hora
      "setting-live": (input) => {
        settingHandlers(ctx, () => ctx.refresh())["setting-live"](input);
        if (input.dataset.id === "editor.fontSize") {
          const box = el.querySelector("#font-preview");
          if (box) box.style.fontSize = `${appSettings.get("editor.fontSize")}px`;
        }
      },
      "font-body": (btn) => useCustomFont(ctx, btn, "editor.fontBody"),
      "font-heading": (btn) => useCustomFont(ctx, btn, "editor.fontHeading"),
    },
  );
}

/**
 * Usa uma fonte digitada (só letras, números, espaços e hífen) no texto ou nos títulos.
 * @param {Object} ctx - Contexto.
 * @param {HTMLElement} btn - Botão clicado.
 * @param {string} id - Configuração.
 * @returns {void}
 */
function useCustomFont(ctx, btn, id) {
  const name = btn.closest(".cn-setting-row").querySelector("#custom-font").value.trim();
  if (!/^[\p{L}\p{N}\s\-.]{2,60}$/u.test(name)) return ctx.toast("Digite o nome de uma fonte (só letras, números e espaços).", "error");
  appSettings.set(id, `'${name}', serif`);
  ctx.refresh();
}

