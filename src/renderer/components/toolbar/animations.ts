/**
 * @file Gerencia as animações da interface do usuário
 */

import { gsap } from "gsap";

// BOTÃO SALVAR

/**
 * Módulo de animação do botão Salvar via GSAP.
 * @param {string} buttonId - ID do elemento do botão (quem chama informa; nada fica fixo aqui dentro).
 * @returns {() => void} Função que desfaz a animação (remove os ouvintes e interrompe os movimentos).
 */
export function initSaveButtonAnimation(buttonId: string): () => void {
  const btn = document.getElementById(buttonId);
  if (!btn) return () => {};

  // Animação ociosa contínua do fundo etéreo
  gsap.to(btn, {
    backgroundPosition: "-300% 0%",
    duration: 7,
    repeat: -1,
    ease: "none",
  });

  // 2. CRESCER AO PRESSIONAR (mousedown)
  const growButton = () => {
    gsap.to(btn, {
      scale: 1.08,
      boxShadow: "0px 0px 20px color-mix(in srgb, var(--accent) 55%, transparent)",
      duration: 0.35, // Transição suave para expandir
      ease: "power2.out",
      overwrite: "auto",
    });
  };

  // 3. REDUZIR AO SOLTAR O CLIQUE OU SAIR DO BOTÃO (mouseup / mouseleave)
  const shrinkButton = () => {
    gsap.to(btn, {
      scale: 1,
      boxShadow: "0px 0px 0px rgba(0, 0, 0, 0)",
      duration: 0.45, // Desaceleração macia ao voltar ao normal
      ease: "back.out(1.2)", // Retorno suave com física amortecida
      overwrite: "auto",
    });
  };

  btn.addEventListener("mousedown", growButton);
  btn.addEventListener("mouseup", shrinkButton);
  btn.addEventListener("mouseleave", shrinkButton);

  return () => {
    btn.removeEventListener("mousedown", growButton);
    btn.removeEventListener("mouseup", shrinkButton);
    btn.removeEventListener("mouseleave", shrinkButton);
    gsap.killTweensOf(btn);
  };
}
