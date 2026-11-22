import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { launchApp } from "./helpers/launch.mjs";
import { selectBook, explorerTab, openFile, typeInEditor, openCentral, closeCentral, centralTab, treeItem } from "./helpers/ui.mjs";

/** Dois ciclos de vida do app sobre a MESMA pasta de dados: o que o autor fez na 1a sessão precisa estar na 2a. */
let app;
let dataDir;
const marcar = async (page, id, valor) => {
  if ((await page.locator(`#${id}`).isChecked()) !== valor) await page.locator(`label.switch:has(#${id}) .slider`).click();
};

test.afterAll(async () => {
  await app?.close();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

test.describe.configure({ mode: "serial" });

test("1a sessão: o autor trabalha (rascunho, anotação, tema, correção, conta, modo e chat)", async () => {
  app = await launchApp({ keepData: true });
  dataDir = app.dataDir;
  const { page } = app;
  await selectBook(page);

  // rascunho não sincronizado no capítulo
  await openFile(page, "Capítulo 01");
  await typeInEditor(page, " Texto persistido.", { replace: false });
  await expect(page.locator("#save-status-indicator .status-text")).toHaveText("Rascunho salvo");

  // anotação nova
  await explorerTab(page, "notes");
  await page.locator(".mini-btn[data-tab=notes][aria-label='Nova anotação']").click();
  await page.locator("#title").fill("Ideia persistida");
  await page.locator("[data-action=submit]").click();
  await expect(treeItem(page, "Ideia persistida")).toBeVisible();

  // configurações
  await page.locator("#btn-open-menu").click();
  await marcar(page, "theme-toggle", true);
  await marcar(page, "spellcheck-toggle", false);
  await page.locator("#chat-bg-details summary").click();
  await page.locator("#chat-bg-mode-dark").selectOption("nebula");
  await page.locator("#spell-language-select").selectOption("en-US");
  await page.locator("#btn-close-menu").click();

  // conta de IA e modo do livro
  await openCentral(page, "ai");
  await page.locator("#new-provider").selectOption("ollama");
  await page.locator("#new-nick").fill("Conta persistida");
  await page.locator("#new-model").fill("modelo-x");
  await page.locator("[data-act=add]").click();
  await expect(page.locator('.cn-acct:has(input.cn-acct-nick[value="Conta persistida"])')).toBeVisible();
  await closeCentral(page);
  await openCentral(page, "book");
  await page.locator("label.cn-radio-card:has(input[value=coauthor])").click();
  await expect.poll(() => JSON.parse(fs.readFileSync(path.join(app.bookDir, "config.json"), "utf8")).ai_mode).toBe("coauthor");
  await closeCentral(page);

  // conversa
  await page.locator("#ai-assistant-header").click();
  await page.locator("#ai-chat-input").fill("/ajuda");
  await page.keyboard.press("Enter");
  await expect(page.locator("#ai-chat-messages .ai-message.assistant", { hasText: "Comandos que eu entendo" })).toBeVisible();
  // dá tempo de o histórico do chat ser gravado no livro
  await page.waitForTimeout(1500);

  // fecha o app como um fechamento normal e confere que o rascunho está em disco
  await app.close({ graceful: true });
  expect(fs.existsSync(path.join(dataDir, "books", "book_001", "content", "chapter_001", "2_draft.md.temp"))).toBe(true);
});

test("2a sessão: reabre sobre os mesmos dados e abre sozinho no último livro", async () => {
  app = await launchApp({ dataDir });
  const { page } = app;
  await expect(page).toHaveTitle("Livro de Teste - Astra Writer", { timeout: 20000 });
  await expect(page.locator("#book-dropdown-container")).toContainText("Livro de Teste");
  await expect(page.locator("#file-tree")).toContainText("Capítulo 01");
});

test("o rascunho não sincronizado continua lá (* no explorer e texto no editor)", async () => {
  const { page } = app;
  await explorerTab(page, "content");
  await expect(page.locator("#file-tree .chapter-item .dirty-asterisk")).toHaveCount(1);
  await openFile(page, "Capítulo 01");
  await expect(page.locator("#markdown-editor")).toContainText("Texto persistido.");
  await expect(page.locator("#btn-save")).toBeEnabled();
  await explorerTab(page, "notes");
  await expect(treeItem(page, "Ideia persistida")).toBeVisible();
});

test("as configurações persistem: tema escuro, correção desligada, idioma e fundo do chat", async () => {
  const { page } = app;
  await expect(page.locator("body")).toHaveClass(/dark-theme/);
  await page.locator("#btn-open-menu").click();
  await expect(page.locator("#theme-toggle")).toBeChecked();
  await expect(page.locator("#spellcheck-toggle")).not.toBeChecked();
  await expect(page.locator("#spell-language-select")).toHaveValue("en-US");
  await page.locator("#chat-bg-details summary").click();
  await expect(page.locator("#chat-bg-mode-dark")).toHaveValue("nebula");
  await page.locator("#btn-close-menu").click();
});

test("a conta de IA adicionada e o modo do livro persistem", async () => {
  const { page } = app;
  await openCentral(page, "ai");
  await expect(page.locator('.cn-acct:has(input.cn-acct-nick[value="Conta persistida"])')).toBeVisible();
  await expect(page.locator('.cn-acct.active:has(input.cn-acct-nick[value="Assistente Astra"])')).toHaveCount(1);
  await closeCentral(page);
  await openCentral(page, "book");
  await expect(page.locator("input[name=ai-mode][value=coauthor]")).toBeChecked();
  await centralTab(page, "Changelog");
  await expect(page.locator("#changelog-list")).toContainText(/update|create|review/i);
  await closeCentral(page);
});

test("o histórico da conversa com o assistente persiste no livro", async () => {
  const { page } = app;
  await page.locator("#ai-assistant-header").click();
  await expect(page.locator("#ai-chat-messages .ai-message.user", { hasText: "/ajuda" })).toBeVisible();
  await expect(page.locator("#ai-chat-messages .ai-message.assistant", { hasText: "Comandos que eu entendo" })).toBeVisible();
});
