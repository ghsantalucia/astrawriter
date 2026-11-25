/**
 * @file Sons curtos do app, sintetizados com a Web Audio API (sem arquivos de áudio): um aviso suave de "mensagem nova".
 */

/**
 * Toca um aviso suave (duas notas curtas e agudas).
 * @returns {void}
 */
export function playPing() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const start = ctx.currentTime + 0.01;
    [[880, 0], [1318.5, 0.14]].forEach(([freq, at]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start + at);
      gain.gain.exponentialRampToValueAtTime(0.12, start + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + at);
      osc.stop(start + at + 0.4);
    });
    setTimeout(() => ctx.close?.(), 1200);
  } catch {
    // sem áudio: fica só a bolinha
  }
}
