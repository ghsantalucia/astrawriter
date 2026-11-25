/**
 * Cobertura da tradução: todo texto passado a `t("...")` (no código) ou `{{t "..."}}` (nos templates) precisa ter a entrada em
 * inglês, e as entradas em inglês precisam manter os mesmos {placeholders} do texto de origem.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
const srcDir = path.join(root, "src");
const enDir = path.join(srcDir, "shared", "i18n", "en");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Interpreta um literal de string do JS/Handlebars (aspas duplas, simples ou crase sem ${}). */
function unquote(literal) {
  const body = literal.slice(1, -1);
  if (literal[0] === "`" && body.includes("${")) return null;
  return body.replace(/\\(.)/g, (m, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
}

const dictionary = {};
for (const file of fs.readdirSync(enDir)) {
  if (!file.endsWith(".json")) continue;
  Object.assign(dictionary, JSON.parse(fs.readFileSync(path.join(enDir, file), "utf8")));
}

const files = walk(srcDir).filter((f) => /\.(ts|hbs)$/.test(f) && !f.includes(`${path.sep}i18n${path.sep}`) && !f.endsWith("i18n.ts") && !f.endsWith("i18nMessages.ts") && !f.endsWith("i18nInit.ts"));

const used = new Map();
const TS_RE = /(?<![\w.$])t\(\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
const HBS_RE = /\{\{\{?\s*t\s+("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/g;
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const re = file.endsWith(".hbs") ? HBS_RE : TS_RE;
  for (const m of text.matchAll(re)) {
    const key = unquote(m[1]);
    if (key === null || key === "") continue;
    if (!used.has(key)) used.set(key, path.relative(root, file));
  }
}

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

describe("i18n: cobertura do dicionário inglês", () => {
  it("encontra textos traduzíveis no código", () => {
    expect(used.size).toBeGreaterThan(500);
  });

  it("todo texto passado a t() tem tradução em inglês", () => {
    const missing = [...used].filter(([key]) => !(key in dictionary)).map(([key, file]) => `${file}: ${key}`);
    expect(missing).toEqual([]);
  });

  it("as traduções mantêm os mesmos {placeholders}", () => {
    const bad = Object.entries(dictionary)
      .filter(([pt, en]) => placeholders(pt) !== placeholders(en))
      .map(([pt, en]) => `${pt} => ${en}`);
    expect(bad).toEqual([]);
  });

  it("nenhuma tradução está vazia", () => {
    const empty = Object.entries(dictionary).filter(([, en]) => typeof en !== "string" || !en.trim()).map(([pt]) => pt);
    expect(empty).toEqual([]);
  });
});
