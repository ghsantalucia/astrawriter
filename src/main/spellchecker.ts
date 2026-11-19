// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Verificação ortográfica por contagem (rodapé do editor) com Hunspell em WebAssembly (hunspell-asm) e os
 * dicionários dos pacotes dictionary-*. Roda no processo principal; o sublinhado do editor continua sendo do Chromium.
 */

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
const { loadModule } = require("hunspell-asm");

/** Pacote de dicionário de cada idioma do seletor das configurações. */
const DICTIONARY_PACKAGES = {
  "pt-BR": "dictionary-pt",
  "en-US": "dictionary-en",
  "es-ES": "dictionary-es",
  "fr-FR": "dictionary-fr",
};

/** @type {Promise<Object>|null} Fábrica do Hunspell (o binário WebAssembly é carregado uma vez). */
let factoryPromise = null;

/** Corretores já carregados, por idioma. @type {Map<string, Promise<{hunspell: Object, custom: Set<string>}>>} */
const spellers = new Map();

/**
 * Pacote de dicionário para um idioma (aceita variações como "pt" ou "pt-PT").
 * @param {string} language - Código do idioma.
 * @returns {string}
 */
function packageFor(language) {
  const key =
    DICTIONARY_PACKAGES[language] !== undefined
      ? language
      : Object.keys(DICTIONARY_PACKAGES).find((l) =>
          l.startsWith(String(language).slice(0, 2)),
        ) || "pt-BR";
  return DICTIONARY_PACKAGES[key];
}

/**
 * Carrega (uma vez) o corretor do idioma.
 * @param {string} language - Código do idioma.
 * @returns {Promise<{hunspell: Object, custom: Set<string>}>}
 */
function getSpeller(language) {
  const pkg = packageFor(language);
  if (!spellers.has(pkg)) {
    spellers.set(
      pkg,
      (async () => {
        factoryPromise ??= loadModule();
        const factory = await factoryPromise;
        const dir = path.dirname(require.resolve(pkg));
        const [aff, dic] = await Promise.all([
          fs.promises.readFile(path.join(dir, "index.aff")),
          fs.promises.readFile(path.join(dir, "index.dic")),
        ]);
        const affPath = factory.mountBuffer(new Uint8Array(aff), `${pkg}.aff`);
        const dicPath = factory.mountBuffer(new Uint8Array(dic), `${pkg}.dic`);
        return {
          hunspell: factory.create(affPath, dicPath),
          custom: new Set(),
        };
      })().catch((error) => {
        spellers.delete(pkg);
        throw error;
      }),
    );
  }
  return spellers.get(pkg);
}

/** Arquivo (na pasta de dados do usuário) com as palavras que o usuário adicionou ao dicionário. */
const CUSTOM_FILE = "spell-dictionary.json";

/** Palavras personalizadas (carregadas do arquivo na primeira utilização). @type {Set<string>|null} */
let customWords = null;

/**
 * Caminho do arquivo do dicionário personalizado.
 * @returns {string}
 */
function customFilePath() {
  return path.join(app.getPath("userData"), CUSTOM_FILE);
}

/**
 * Palavras do dicionário personalizado do usuário.
 * @returns {Promise<Set<string>>}
 */
async function loadCustomWords() {
  if (customWords) return customWords;
  try {
    const raw = await fs.promises.readFile(customFilePath(), "utf8");
    customWords = new Set(JSON.parse(raw).words || []);
  } catch {
    customWords = new Set();
  }
  return customWords;
}

/**
 * Adiciona uma palavra ao dicionário personalizado (salvo em disco) e a todos os corretores já carregados.
 * @param {string} word - Palavra.
 * @returns {Promise<void>}
 */
export async function addCustomWord(word) {
  const clean = String(word || "").trim();
  if (!clean) return;
  const words = await loadCustomWords();
  words.add(clean);
  await fs.promises.writeFile(
    customFilePath(),
    JSON.stringify({ words: [...words].sort() }, null, 2),
    "utf8",
  );
}

/**
 * Corretor do idioma já com as palavras personalizadas aplicadas.
 * @param {string} language - Código do idioma.
 * @returns {Promise<Object>} Instância do Hunspell.
 */
async function readySpeller(language) {
  const { hunspell, custom } = await getSpeller(language);
  for (const word of await loadCustomWords()) {
    if (!custom.has(word)) {
      custom.add(word);
      hunspell.addWord(word);
    }
  }
  return hunspell;
}

/**
 * Quais das palavras o dicionário do idioma (mais o dicionário do usuário) não reconhece.
 * @param {string} language - Código do idioma (ex.: pt-BR).
 * @param {string[]} words - Palavras únicas.
 * @returns {Promise<string[]>} As palavras desconhecidas.
 */
export async function findMisspelled(language, words) {
  const hunspell = await readySpeller(language);
  return words.filter((word) => !hunspell.spell(word.replace(/’/g, "'")));
}

/**
 * Sugestões de correção para uma palavra.
 * @param {string} language - Código do idioma.
 * @param {string} word - Palavra.
 * @returns {Promise<string[]>}
 */
export async function suggestWord(language, word) {
  const hunspell = await readySpeller(language);
  return hunspell.suggest(word.replace(/’/g, "'")).slice(0, 6);
}
