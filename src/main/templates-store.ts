/**
 * @file Armazenamento dos perfis de template. Os perfis que vêm com o app ficam em `templates/profiles/<perfil>/<tipo>.md`
 * (somente leitura); as edições do usuário e os perfis criados por ele ficam na pasta de dados do usuário
 * (`templates/<perfil>/<tipo>.md` e `templates/profiles.json`). Editar nunca altera a pasta do app: "restaurar" apenas
 * apaga a edição e o original volta.
 */

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { templatesDir } from "./paths.js";
import { BUILTIN_PROFILES, TEMPLATE_KINDS } from "../shared/templateKinds.js";

/** @returns {string} Pasta dos perfis que vêm com o app. */
function builtinRoot() {
  return path.join(path.dirname(templatesDir()), "profiles");
}

/** @returns {string} Pasta das edições do usuário. */
function userRoot() {
  return path.join(app.getPath("userData"), "templates");
}

const isKind = (kind) => TEMPLATE_KINDS.some((k) => k.id === kind);
const safeId = (id) => /^[a-z0-9][a-z0-9-]{0,40}$/i.test(String(id || ""));

/**
 * Perfis criados pelo usuário.
 * @returns {Array<{id: string, label: string, description: string, from: string}>}
 */
function customProfiles() {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(userRoot(), "profiles.json"), "utf8"));
    return Array.isArray(list) ? list.filter((p) => safeId(p.id)) : [];
  } catch {
    return [];
  }
}

/** @param {Array<Object>} list - Perfis do usuário a gravar. */
function saveCustomProfiles(list) {
  fs.mkdirSync(userRoot(), { recursive: true });
  fs.writeFileSync(path.join(userRoot(), "profiles.json"), JSON.stringify(list, null, 2), "utf8");
}

/**
 * Lê um arquivo ou devolve null.
 * @param {string} file - Caminho.
 * @returns {string|null}
 */
function readOrNull(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/**
 * Perfil do qual um perfil herda os templates que não editou (o próprio, se for do app).
 * @param {string} profileId - Perfil.
 * @returns {string}
 */
function baseOf(profileId) {
  if (BUILTIN_PROFILES.some((p) => p.id === profileId)) return profileId;
  return customProfiles().find((p) => p.id === profileId)?.from || "assistant";
}

/**
 * Todos os perfis (do app e do usuário), com quantos templates foram editados.
 * @returns {Array<Object>}
 */
export function listProfiles() {
  const edited = (id) => TEMPLATE_KINDS.filter((k) => fs.existsSync(path.join(userRoot(), id, `${k.id}.md`))).length;
  return [
    ...BUILTIN_PROFILES.map((p) => ({ ...p, builtin: true, edited: edited(p.id) })),
    ...customProfiles().map((p) => ({ ...p, builtin: false, edited: edited(p.id) })),
  ];
}

/**
 * Corpo de um template em um perfil: a edição do usuário ou o original (do perfil, ou do perfil-base de um perfil criado).
 * @param {string} profileId - Perfil.
 * @param {string} kind - Tipo de template.
 * @returns {{body: string, edited: boolean}|null}
 */
export function readTemplate(profileId, kind) {
  if (!safeId(profileId) || !isKind(kind)) return null;
  const mine = readOrNull(path.join(userRoot(), profileId, `${kind}.md`));
  if (mine !== null) return { body: mine, edited: true };
  const original = readOrNull(path.join(builtinRoot(), baseOf(profileId), `${kind}.md`));
  return original === null ? null : { body: original, edited: false };
}

/**
 * Corpo original (do app) de um template, ignorando edições (para "restaurar" e comparar).
 * @param {string} profileId - Perfil.
 * @param {string} kind - Tipo.
 * @returns {string|null}
 */
export function readOriginal(profileId, kind) {
  if (!safeId(profileId) || !isKind(kind)) return null;
  return readOrNull(path.join(builtinRoot(), baseOf(profileId), `${kind}.md`));
}

/**
 * Salva a edição de um template.
 * @param {string} profileId - Perfil.
 * @param {string} kind - Tipo.
 * @param {string} body - Novo corpo (Markdown, sem frontmatter).
 * @returns {{success: boolean, error?: string}}
 */
export function saveTemplate(profileId, kind, body) {
  if (!safeId(profileId) || !isKind(kind)) return { success: false, error: "Template inválido." };
  if (!listProfiles().some((p) => p.id === profileId)) return { success: false, error: "Perfil não encontrado." };
  fs.mkdirSync(path.join(userRoot(), profileId), { recursive: true });
  fs.writeFileSync(path.join(userRoot(), profileId, `${kind}.md`), String(body ?? ""), "utf8");
  return { success: true };
}

/**
 * Descarta a edição de um template: o original volta a valer.
 * @param {string} profileId - Perfil.
 * @param {string} kind - Tipo.
 * @returns {{success: boolean, error?: string}}
 */
export function restoreTemplate(profileId, kind) {
  if (!safeId(profileId) || !isKind(kind)) return { success: false, error: "Template inválido." };
  fs.rmSync(path.join(userRoot(), profileId, `${kind}.md`), { force: true });
  return { success: true };
}

/**
 * Cria um perfil novo a partir de uma cópia de outro (com as edições dele).
 * @param {{name: string, from: string}} input - Nome e perfil de origem.
 * @returns {{success: boolean, id?: string, error?: string}}
 */
export function createProfile({ name, from }) {
  const label = String(name || "").trim().slice(0, 40);
  if (!label) return { success: false, error: "Dê um nome ao perfil." };
  if (!listProfiles().some((p) => p.id === from)) return { success: false, error: "Perfil de origem não encontrado." };
  const id = `custom-${Date.now().toString(36)}`;
  for (const kind of TEMPLATE_KINDS) {
    const source = readTemplate(from, kind.id);
    if (source) {
      fs.mkdirSync(path.join(userRoot(), id), { recursive: true });
      fs.writeFileSync(path.join(userRoot(), id, `${kind.id}.md`), source.body, "utf8");
    }
  }
  saveCustomProfiles([...customProfiles(), { id, label, description: "Perfil criado por você.", from: baseOf(from) }]);
  return { success: true, id };
}

/**
 * Renomeia um perfil criado pelo usuário.
 * @param {string} id - Perfil.
 * @param {string} name - Novo nome.
 * @returns {{success: boolean, error?: string}}
 */
export function renameProfile(id, name) {
  const label = String(name || "").trim().slice(0, 40);
  const list = customProfiles();
  if (!label || !list.some((p) => p.id === id)) return { success: false, error: "Perfil não encontrado." };
  saveCustomProfiles(list.map((p) => (p.id === id ? { ...p, label } : p)));
  return { success: true };
}

/**
 * Exclui um perfil criado pelo usuário (os do app não podem ser excluídos).
 * @param {string} id - Perfil.
 * @returns {{success: boolean, error?: string}}
 */
export function deleteProfile(id) {
  const list = customProfiles();
  if (!list.some((p) => p.id === id)) return { success: false, error: "Só perfis criados por você podem ser excluídos." };
  fs.rmSync(path.join(userRoot(), id), { recursive: true, force: true });
  saveCustomProfiles(list.filter((p) => p.id !== id));
  return { success: true };
}
