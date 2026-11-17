/**
 * @file Tela de abertura: fica vazia até o app estar pronto e então toca a sequência "Per Aspera Ad" → "Astra" + estrela
 * cadente → texto parado → fade-out, revelando a interface.
 */

/** Pausa (ms) entre o app ficar pronto e o início da animação de "Per Aspera Ad". */
const START_DELAY = 340;
/** Tempo (ms) até "Astra" e a estrela cadente entrarem (a linha anterior leva ~0,85 s para aparecer). */
const PER_DURATION = 935;
/** Tempo (ms) da entrada de "Astra" (animação do CSS). */
const ASTRA_DURATION = 1190;
/** Tempo (ms) com o texto parado na tela antes do fade-out. */
const HOLD_DURATION = 680;
/** Duração (ms) do fade-out (igual à transição do CSS). */
const FADE_DURATION = 510;

/** Promessa do carregamento das fontes (criada em {@link initSplash}). */
let fontsReady = Promise.resolve();

/**
 * Prepara a abertura conforme o tema salvo (claro: fundo da barra de título e letras chumbo) e começa a carregar as
 * fontes. Não anima nada: a tela fica vazia até {@link hideSplash}.
 * @returns {void}
 */
export function initSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;
  const theme = localStorage.getItem("theme");
  splash.classList.toggle("light", theme === "light");

  // A animação só começa com a fonte do título carregada (evita um instante com a fonte de reserva)
  // Versão do app, discreta no rodapé da tela
  window.electronAPI
    ?.getAppVersion?.()
    .then((version) => {
      const label = document.getElementById("splash-version");
      if (label && version) label.textContent = `v${version}`;
    })
    .catch(() => undefined);

  fontsReady = Promise.race([
    Promise.all([document.fonts.load('1em "Foglihten"')]),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]).catch(() => undefined);
}

/**
 * Pausa assíncrona.
 * @param {number} ms - Tempo em milissegundos.
 * @returns {Promise<void>}
 */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Toca a sequência da abertura e a remove (o app chama quando fica pronto).
 * @returns {Promise<void>}
 */
export async function hideSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;

  await fontsReady;
  await wait(START_DELAY);
  splash.classList.add("stage-per");
  await wait(PER_DURATION);
  splash.classList.add("stage-astra");
  await wait(ASTRA_DURATION + HOLD_DURATION);
  splash.classList.add("leaving");
  setTimeout(() => splash.remove(), FADE_DURATION + 50);
}
