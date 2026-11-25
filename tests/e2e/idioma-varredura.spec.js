/**
 * Varredura do app em inglês: percorre as telas principais (explorer, Centrais e abas, gaveta, modais, editor) e falha se achar
 * texto ou atributo (title, placeholder, aria-label) em português. Ajuda a pegar tradução que ficou para trás.
 */
import { test, expect } from "@playwright/test";
import { launchApp } from "./helpers/launch.mjs";
import { selectBook, openCentral, closeCentral, explorerTab } from "./helpers/ui.mjs";

test.setTimeout(600000);

async function scanAttrs(page, label) {
  const vals = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("[title],[placeholder],[aria-label],[data-tooltip]").forEach((el) => {
      for (const a of ["title", "placeholder", "aria-label", "data-tooltip"]) { const v = el.getAttribute(a); if (v) out.push(a + ": " + v); }
    });
    return out;
  });
  for (const v of vals) if (PT.test(v) && !seen.has(v)) seen.set(v, label);
}

const PT = /[áàâãéêíóôõúç]|\b(não|você|para|arquivo|arquivos|livro|capítulo|erro|salvar|criar|excluir|abrir|nome|título|nenhum|nenhuma|seu|sua|uma|com|dos|das|pelo|pela|quando|ainda|sobre|todos|todas|aqui)\b/i;
const seen = new Map();

async function scan(page, label, selector = "body") {
  const text = await page.locator(selector).first().innerText().catch(() => "");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.length < 3) continue;
    if (PT.test(line) && !seen.has(line)) seen.set(line, label);
  }
}

test("em inglês, nenhuma tela principal mostra texto em português", async () => {
  const app = await launchApp({ lang: "en" });
  const { page } = app;
  try {
    await scan(page, "inicial");
    await selectBook(page, "Test Book");
    await scan(page, "livro aberto");
    await scanAttrs(page, "livro aberto");
    for (const tab of ["notes", "content", "assets"]) {
      await explorerTab(page, tab);
      await scan(page, `explorer ${tab}`, "#file-tree");
      await scanAttrs(page, `explorer ${tab}`);
    }
    // Centrais e abas
    for (const central of ["issues", "book", "ai", "system"]) {
      await openCentral(page, central);
      const tabs = page.locator("#central-tabs button");
      const n = await tabs.count();
      for (let i = 0; i < n; i++) {
        await tabs.nth(i).click();
        await page.waitForTimeout(400);
        await scan(page, `central ${central} aba ${i}`, "#central-overlay");
        await scanAttrs(page, `central ${central} aba ${i}`);
      }
      await closeCentral(page);
    }
    // Gaveta de configurações
    await page.locator("#btn-open-menu").click();
    await page.waitForTimeout(500);
    await scan(page, "gaveta", "#settings-container");
    await page.locator("#btn-close-menu").click();
    // Modal de novo capítulo e nova ficha
    await explorerTab(page, "content");
    await page.locator(".mini-btn[data-tab=content]").click();
    await page.waitForTimeout(600);
    await scan(page, "novo capítulo", "#modal-container");
    await page.keyboard.press("Escape");
    await explorerTab(page, "assets");
    const addButtons = page.locator(".mini-btn[data-tab=assets]");
    if (await addButtons.count()) {
      await addButtons.first().click();
      await page.waitForTimeout(600);
      await scan(page, "nova ficha", "#modal-container");
      await page.keyboard.press("Escape");
    }
    // Editor com capítulo aberto, caixa de dados, localizar, histórico e sincronizar
    await explorerTab(page, "content");
    await page.locator("#file-tree .file-name", { hasText: "Chapter 01" }).first().click();
    await page.waitForTimeout(1200);
    await scan(page, "editor"); await scanAttrs(page, "editor");
    for (const sel of ["#btn-file-data", "[event-click='file-data:toggle']", "#btn-find", "#btn-history", "#btn-save"]) {
      const el = page.locator(sel).first();
      if (await el.count()) { await el.click({ force: true }).catch(() => {}); await page.waitForTimeout(700); await scan(page, "clicou " + sel); await scanAttrs(page, "clicou " + sel); await page.keyboard.press("Escape"); }
    }
    // Chat
    await scan(page, "chat", "body"); await scanAttrs(page, "chat");
  } finally {
    await app.close();
  }
  // Nomes de idioma (nativos) e texto do próprio livro (sugestões do corretor) não são tradução
  const ignoradas = [/^Português \(Brasil\)$/, /^Français$/, /^Español$/, /^Suggestions:/];
  const sobras = [...seen].filter(([line]) => !ignoradas.some((re) => re.test(line))).map(([line, where]) => `[${where}] ${line}`);
  expect(sobras).toEqual([]);
});
