/**
 * @file Hash de textos no renderer (SHA-1 em hexadecimal, via Web Crypto).
 */

/**
 * Calcula o SHA-1 de um texto.
 * @param {string} text - Texto.
 * @returns {Promise<string>} Hash em hexadecimal.
 */
export async function sha1(text) {
  const bytes = new TextEncoder().encode(String(text ?? ""));
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
