// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Tooltips personalizadas para todo o app. Qualquer elemento com o atributo HTML `title` (ou `data-tooltip`) ganha uma
 * dica estilizada que aparece logo depois de o mouse parar sobre ele (pequeno atraso), no lugar da dica nativa do navegador.
 *
 * Funciona por delegação de eventos: não é preciso registrar nada nos componentes; basta usar `title="..."` ou
 * `data-tooltip="..."`. O `title` é trocado por `data-tooltip` no primeiro mouseover (para a dica nativa não aparecer), então
 * `elemento.title = "texto"` definido depois também é tratado. Use `\n` no texto para quebrar linhas.
 */

/** Atraso (ms) entre o mouse entrar no elemento e a dica aparecer. */
const SHOW_DELAY = 140;
/** Distância (px) entre a dica e o elemento. */
const GAP = 8;
/** Margem mínima (px) até a borda da janela. */
const EDGE = 8;

/** @type {HTMLDivElement|null} */
let tip = null;
/** @type {Element|null} Elemento cuja dica está agendada ou visível. */
let current = null;
let timer = null;

/**
 * Cria (uma vez) o elemento da dica.
 * @returns {HTMLDivElement}
 */
function ensureTip() {
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "dw-tooltip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
  }
  return tip;
}

/**
 * Elemento (o próprio ou um ancestral) que tem dica.
 * @param {EventTarget|null} target - Alvo do evento.
 * @returns {Element|null}
 */
function findHost(target) {
  if (!(target instanceof Element)) return null;
  return target.closest("[title], [data-tooltip]");
}

/**
 * Texto da dica do elemento; troca o `title` nativo por `data-tooltip`.
 * @param {Element} host - Elemento.
 * @returns {string}
 */
function readText(host) {
  const native = host.getAttribute("title");
  if (native !== null) {
    host.removeAttribute("title");
    if (native.trim()) host.setAttribute("data-tooltip", native);
  }
  return (host.getAttribute("data-tooltip") || "").trim();
}

/**
 * Esconde a dica e cancela a que estava agendada.
 * @returns {void}
 */
function hide() {
  clearTimeout(timer);
  timer = null;
  current = null;
  tip?.classList.remove("visible");
}

/**
 * Mostra a dica do elemento, abaixo dele (ou acima se não couber), centralizada e dentro da janela.
 * @param {Element} host - Elemento.
 * @returns {void}
 */
function show(host) {
  if (!host.isConnected) return;
  const text = (host.getAttribute("data-tooltip") || "").trim();
  if (!text) return;

  const el = ensureTip();
  el.textContent = text;
  el.style.left = "0px";
  el.style.top = "0px";
  el.classList.remove("below", "above");

  const rect = host.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - box.width / 2;
  left = Math.max(EDGE, Math.min(left, window.innerWidth - box.width - EDGE));

  const fitsBelow = rect.bottom + GAP + box.height + EDGE <= window.innerHeight;
  const top = fitsBelow
    ? rect.bottom + GAP
    : Math.max(EDGE, rect.top - GAP - box.height);

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  // A seta aponta para o centro do elemento, mesmo quando a dica foi deslocada para caber
  const arrow = rect.left + rect.width / 2 - left;
  el.style.setProperty(
    "--arrow-x",
    `${Math.max(12, Math.min(arrow, box.width - 12))}px`,
  );
  el.classList.add(fitsBelow ? "below" : "above", "visible");
}

/**
 * Liga as tooltips personalizadas ao documento (chamar uma vez).
 * @returns {void}
 */
export function initTooltips() {
  document.addEventListener(
    "mouseover",
    (event) => {
      const host = findHost(event.target);
      if (host === current) return;

      hide();
      if (!host) return;
      // Lê agora (e remove o `title`) para a dica nativa nunca aparecer
      if (!readText(host)) return;

      current = host;
      timer = setTimeout(() => show(host), SHOW_DELAY);
    },
    true,
  );

  document.addEventListener("mouseout", (event) => {
    if (current && !current.contains(event.relatedTarget)) hide();
  });

  // Qualquer interação fecha a dica
  ["mousedown", "keydown", "wheel", "scroll", "blur"].forEach((name) =>
    window.addEventListener(name, hide, true),
  );
}
