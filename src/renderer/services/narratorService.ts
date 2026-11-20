// @ts-nocheck
/**
 * @file Narrador: lê o arquivo aberto no editor em voz alta com as vozes do sistema (síntese de voz do Chromium, sem
 * internet e sem custo). O texto é limpo do Markdown e lido frase por frase (vozes longas travam em alguns sistemas).
 */

import { uiBus } from "../events/uiBus.js";
import { appSettings } from "../utils/appSettings.js";

/**
 * Texto puro de um trecho de Markdown (sem frontmatter, links, imagens, títulos com # e marcas de ênfase).
 * @param {string} markdown - Texto Markdown.
 * @returns {string}
 */
export function plainText(markdown) {
  return String(markdown || "")
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, "")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/(^|[\s(])[*_]+([^*_\n]+)[*_]+(?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

/**
 * Divide o texto em frases (e em partes menores se a frase for muito longa).
 * @param {string} text - Texto puro.
 * @returns {string[]}
 */
export function splitSentences(text) {
  const out = [];
  for (const paragraph of String(text).split(/\n+/)) {
    const sentences = paragraph.match(/[^.!?…]+[.!?…]*\s*/g) || [];
    for (const s of sentences) {
      let rest = s.trim();
      while (rest.length > 240) {
        const cut = rest.lastIndexOf(",", 240) > 60 ? rest.lastIndexOf(",", 240) + 1 : rest.lastIndexOf(" ", 240);
        out.push(rest.slice(0, cut > 0 ? cut : 240).trim());
        rest = rest.slice(cut > 0 ? cut : 240).trim();
      }
      if (rest) out.push(rest);
    }
  }
  return out;
}

/**
 * Serviço do narrador.
 * @class
 */
export class NarratorService {
  /**
   * @param {Object} state - Estado global (o editor aberto).
   */
  constructor(state) {
    this.state = state;
    this.queue = [];
    this.index = 0;
    /** "stopped" | "playing" | "paused" */
    this.status = "stopped";
    this.token = 0;
    // Trocar de arquivo ou de livro interrompe a leitura
    uiBus.on("file:opened", () => this.stop());
    uiBus.on("editor:reseted", () => this.stop());
    uiBus.on("narrator:toggle", () => this.toggle());
    uiBus.on("narrator:stop", () => this.stop());
    window.addEventListener("beforeunload", () => window.speechSynthesis?.cancel());
  }

  /** @returns {boolean} O sistema oferece síntese de voz? */
  get supported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  /**
   * Vozes instaladas (a primeira consulta pode vir vazia: o Chromium carrega a lista aos poucos).
   * @returns {Promise<SpeechSynthesisVoice[]>}
   */
  async voices() {
    if (!this.supported) return [];
    const now = window.speechSynthesis.getVoices();
    if (now.length) return now;
    return new Promise((resolve) => {
      const done = () => resolve(window.speechSynthesis.getVoices());
      window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
      setTimeout(done, 1500);
    });
  }

  /**
   * Escolhe a voz: a configurada ou, na falta dela, uma que combine com o idioma do app.
   * @returns {Promise<SpeechSynthesisVoice|null>}
   * @private
   */
  async pickVoice() {
    const all = await this.voices();
    const wanted = appSettings.get("speech.voice");
    return all.find((v) => v.name === wanted) || all.find((v) => /^pt(-|_)BR/i.test(v.lang)) || all.find((v) => /^pt/i.test(v.lang)) || null;
  }

  /**
   * Texto do arquivo aberto (a versão que está no editor, mesmo sem sincronizar).
   * @returns {string}
   * @private
   */
  currentText() {
    const md = this.state.editor?.getMarkdown?.() || "";
    return plainText(md);
  }

  /**
   * Começa (ou retoma) a leitura do arquivo aberto.
   * @returns {Promise<boolean>} Se a leitura começou.
   */
  async play() {
    if (!this.supported) {
      uiBus.emit("toast:show", { message: "Este computador não tem síntese de voz disponível.", type: "error" });
      return false;
    }
    if (this.status === "paused") {
      window.speechSynthesis.resume();
      this.setStatus("playing");
      return true;
    }
    const text = this.currentText();
    if (!text) {
      uiBus.emit("toast:show", { message: "Abra um arquivo com texto para ouvir.", type: "info" });
      return false;
    }
    window.speechSynthesis.cancel();
    this.queue = splitSentences(text);
    this.index = 0;
    this.setStatus("playing");
    const token = ++this.token;
    const voice = await this.pickVoice();
    this.speakNext(token, voice);
    return true;
  }

  /**
   * Lê a próxima frase da fila.
   * @param {number} token - Identifica esta leitura (uma nova leitura invalida a anterior).
   * @param {SpeechSynthesisVoice|null} voice - Voz.
   * @returns {void}
   * @private
   */
  speakNext(token, voice) {
    if (token !== this.token || this.status === "stopped") return;
    if (this.index >= this.queue.length) {
      this.stop();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(this.queue[this.index]);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "pt-BR";
    }
    utterance.rate = appSettings.get("speech.rate");
    utterance.onend = () => {
      this.index += 1;
      this.speakNext(token, voice);
    };
    utterance.onerror = (event) => {
      if (event.error === "canceled" || event.error === "interrupted") return;
      this.stop();
    };
    window.speechSynthesis.speak(utterance);
  }

  /** Pausa a leitura. @returns {void} */
  pause() {
    if (this.status !== "playing") return;
    window.speechSynthesis.pause();
    this.setStatus("paused");
  }

  /** Para a leitura. @returns {void} */
  stop() {
    if (this.status === "stopped" && !this.queue.length) return;
    this.token += 1;
    window.speechSynthesis?.cancel();
    this.queue = [];
    this.index = 0;
    this.setStatus("stopped");
  }

  /** Alterna entre ouvir, pausar e retomar. @returns {Promise<void>} */
  async toggle() {
    if (this.status === "playing") this.pause();
    else await this.play();
  }

  /**
   * Fala uma frase de teste com a voz e a velocidade atuais (tela de acessibilidade).
   * @returns {Promise<void>}
   */
  async preview() {
    if (!this.supported) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("Assim soa a voz do narrador do Astra Writer.");
    const voice = await this.pickVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = appSettings.get("speech.rate");
    window.speechSynthesis.speak(utterance);
  }

  /**
   * @param {"stopped"|"playing"|"paused"} status - Novo estado.
   * @returns {void}
   * @private
   */
  setStatus(status) {
    this.status = status;
    uiBus.emit("narrator:status", { status });
  }
}
