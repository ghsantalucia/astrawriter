/**
 * @file Ações de interface reutilizadas pelos specs E2E (selecionar livro, janelas, explorer, Centrais...).
 */
import fs from "node:fs";
import path from "node:path";

/** Seleciona um livro no dropdown pelo nome (o app não reabre o último livro numa pasta de dados nova). */
export async function selectBook(page, title = "Livro de Teste") {
  await page.locator("#book-dropdown-container .dropdown-trigger").click();
  await page.locator("#book-dropdown-container .dropdown-item", { hasText: title }).first().click();
  await page.waitForFunction((t) => document.title === `${t} - Astra Writer`, title);
  await page.locator("#file-tree li:visible").first().waitFor();
}

/** Botão da janela modal (rodapé) pelo texto. */
export function modalButton(page, text) {
  return page.locator("#modal-container button", { hasText: text }).last();
}

/** Troca a aba do explorer ("notes" | "content" | "assets"). */
export async function explorerTab(page, folder) {
  await page.locator(`.tab-btn[folder="${folder}"]`).click();
  await page.locator(`.tab-btn.active[folder="${folder}"]`).waitFor();
}

/** Item (arquivo, capítulo ou pasta) do explorer pelo texto exibido. */
export function treeItem(page, text) {
  return page.locator("#file-tree :is(.file-title, .folder-title)", { hasText: text });
}

/** Abre um arquivo do explorer clicando no nome. */
export async function openFile(page, text) {
  await page.locator("#file-tree .file-name", { hasText: text }).first().click();
}

/** Campo editável do editor (ProseMirror/CodeMirror, conforme o modo). */
export function editorField(page) {
  return page.locator("#markdown-editor .ProseMirror:visible").first();
}

/** Digita no editor (substitui o conteúdo por padrão). */
export async function typeInEditor(page, text, { replace = true } = {}) {
  const ed = editorField(page);
  await ed.click();
  if (replace) await page.keyboard.press("Control+A");
  await page.keyboard.type(text);
}

/** Abre a gaveta de configurações e uma Central ("issues" | "book" | "ai" | "system"). */
export async function openCentral(page, id) {
  const drawer = page.locator("#settings-container");
  if (!(await drawer.evaluate((el) => el.classList.contains("open")))) await page.locator("#btn-open-menu").click();
  await page.locator(`#settings-container [data-central="${id}"]`).first().click();
  await page.locator("#central-overlay:not(.hidden)").waitFor();
}

/** Seleciona uma aba da Central aberta pelo texto. */
export async function centralTab(page, text) {
  await page.locator("#central-tabs button", { hasText: text }).first().click();
}

/** Fecha a Central aberta. */
export async function closeCentral(page) {
  await page.locator("#central-close").click();
  await page.locator("#central-overlay.hidden").waitFor({ state: "attached" });
}

/** Lista recursivamente os arquivos de uma pasta (caminhos relativos). */
export function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name)).map((x) => path.join(e.name, x)));
    else out.push(e.name);
  }
  return out;
}

/**
 * Dispensa as janelas automáticas que aparecem depois de eventos do livro: "Analisar os arquivos atualizados?" (Depois) e
 * "Executar a skill ...?" (Cancelar). Espera ~2 s sem novas janelas antes de devolver.
 */
export async function dismissPrompts(page, quietMs = 2000) {
  let quietSince = Date.now();
  while (Date.now() - quietSince < quietMs) {
    const texto = await page.locator("#modal-container").innerText().catch(() => "");
    if (texto.includes("Analisar os arquivos atualizados?")) {
      await modalButton(page, "Depois").click({ timeout: 1500 }).catch(() => {});
      quietSince = Date.now();
    } else if (texto.includes("Executar a skill")) {
      await modalButton(page, "Cancelar").click({ timeout: 1500 }).catch(() => {});
      quietSince = Date.now();
    }
    await page.waitForTimeout(150);
  }
}

/** Sincroniza todos os rascunhos (Sincronizar → "Sincronizar Selecionados") e dispensa as janelas automáticas seguintes. */
export async function syncAll(page) {
  await page.locator("#btn-save").click();
  await modalButton(page, "Sincronizar Selecionados").click();
  await dismissPrompts(page);
}

/** Faz a janela do app se comportar como focada (o cronômetro de produtividade só conta com foco). */
export async function forceFocus(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}
