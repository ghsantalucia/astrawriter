import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { launchApp } from "./helpers/launch.mjs";
import { walk } from "./helpers/ui.mjs";

/** Biblioteca vazia: o fluxo de "Criar seu primeiro livro" do guia, com os modos da IA e os perfis de template. */
let app;
const cfg = (n) => JSON.parse(fs.readFileSync(path.join(app.dataDir, "books", n, "config.json"), "utf8"));

test.beforeAll(async () => {
  app = await launchApp({ books: false });
});
test.afterAll(async () => {
  await app?.close();
});

test.describe.configure({ mode: "serial" });

test("sem livros: o seletor só oferece criar/importar e o título da janela é 'Astra Writer'", async () => {
  const { page } = app;
  await expect(page).toHaveTitle("Astra Writer");
  await page.locator("#book-dropdown-container .dropdown-trigger").click();
  const menu = page.locator("#book-dropdown-container .dropdown-menu");
  await expect(menu.locator(".dropdown-item")).toHaveCount(0);
  await expect(menu).toContainText("Criar novo livro");
  await expect(menu).toContainText("Importar livro (.zip)");
  await expect(menu).toContainText("Importar de um arquivo (Word, PDF, texto)");
  await page.keyboard.press("Escape");
});

test("o assistente exige o título do livro (campo obrigatório) e permite cancelar", async () => {
  const { page } = app;
  await page.locator("#book-dropdown-container .dropdown-trigger").click();
  await page.locator(".dropdown-action", { hasText: "Criar novo livro" }).click();
  await expect(page.locator(".wizard-step-counter")).toHaveText("Passo 1 de 4");
  await page.locator("[data-action=next]").click();
  await expect(page.locator(".wizard-field[data-field=book_title] .wizard-field-error")).toBeVisible();
  await expect(page.locator(".wizard-step-counter")).toHaveText("Passo 1 de 4");
  await page.locator("[data-action=cancel]").click();
  await expect(page.locator("#modal-container .wizard")).toHaveCount(0);
  await expect(page).toHaveTitle("Astra Writer");
});

test("o perfil dos templates acompanha o modo da IA escolhido no assistente", async () => {
  const { page } = app;
  await page.locator("#book-dropdown-container .dropdown-trigger").click();
  await page.locator(".dropdown-action", { hasText: "Criar novo livro" }).click();
  const modo = page.locator("#ai_mode");
  const perfil = page.locator("#template_profile");
  await expect(modo).toHaveValue("assistant");
  await expect(perfil).toHaveValue("assistant");
  await modo.selectOption("coauthor");
  await expect(perfil).toHaveValue("coauthor");
  await modo.selectOption("autonomous");
  await expect(perfil).toHaveValue("autonomous");
  await page.locator("[data-action=cancel]").click();
});

test("criar o primeiro livro em modo Co-autor: abre na Sinopse, grava modo/perfil e a estrutura padrão", async () => {
  const { page } = app;
  await page.locator("#book-dropdown-container .dropdown-trigger").click();
  await page.locator(".dropdown-action", { hasText: "Criar novo livro" }).click();
  await page.locator("#book_title").fill("A Saga do Primeiro Livro");
  await page.locator("#ai_mode").selectOption("coauthor");
  await page.locator("[data-action=next]").click();
  await page.locator("#modal-container textarea").first().fill("Uma aprendiz de cartógrafa descobre uma ilha que muda de lugar.");
  for (let i = 0; i < 2; i++) await page.locator("[data-action=next]").click();
  await page.locator("[data-action=submit]").click();

  await expect(page).toHaveTitle("A Saga do Primeiro Livro - Astra Writer");
  await expect(page.locator("#book-dropdown-container")).toContainText("A Saga do Primeiro Livro");
  await expect(page.locator("#markdown-editor")).toContainText("Resumo da ideia central");
  await expect(page.locator("#markdown-editor")).toContainText("cartógrafa");
  await expect(page.locator("#file-tree")).toContainText("Sinopse");

  const c = cfg("book_001");
  expect(c.book_title).toBe("A Saga do Primeiro Livro");
  expect(c.ai_mode).toBe("coauthor");
  expect(c.template_profile).toBe("coauthor");
  const arquivos = walk(path.join(app.dataDir, "books", "book_001")).join("|");
  for (const esperado of ["plot.md", "folder.yml", "config.json"]) expect(arquivos).toContain(esperado);
  expect(arquivos).toContain("chapter_001");
});

test("um segundo livro ganha pasta própria (book_002) e os dois aparecem no seletor", async () => {
  const { page } = app;
  await page.locator("#book-dropdown-container .dropdown-trigger").click();
  await page.locator(".dropdown-action", { hasText: "Criar novo livro" }).click();
  await page.locator("#book_title").fill("Outra História");
  for (let i = 0; i < 3; i++) await page.locator("[data-action=next]").click();
  await page.locator("[data-action=submit]").click();
  await expect(page).toHaveTitle("Outra História - Astra Writer");
  expect(cfg("book_002").ai_mode).toBe("assistant");
  await page.locator("#book-dropdown-container .dropdown-trigger").click();
  const itens = page.locator("#book-dropdown-container .dropdown-item");
  await expect(itens).toHaveCount(2);
  await expect(itens.filter({ hasText: "A Saga do Primeiro Livro" })).toHaveCount(1);
  await expect(itens.filter({ hasText: "Outra História" })).toHaveCount(1);
  await page.keyboard.press("Escape");
});

test("trocar de livro mostra o conteúdo do outro e o título da janela acompanha", async () => {
  const { page } = app;
  await page.locator("#book-dropdown-container .dropdown-trigger").click();
  await page.locator("#book-dropdown-container .dropdown-item", { hasText: "A Saga do Primeiro Livro" }).click();
  await expect(page).toHaveTitle("A Saga do Primeiro Livro - Astra Writer");
});

// Os fluxos abaixo dependem de diálogos nativos do sistema (abrir/salvar arquivo), que o Playwright não controla pela
// conexão CDP e que o contextBridge impede de substituir na página (window.electronAPI é imutável).
test.fixme("importar livro de um .zip exportado pelo app (diálogo nativo de abrir arquivo)", async () => {
  // Importar livro (.zip) → window.electronAPI.importBook() abre dialog.showOpenDialog no processo principal.
});

test.fixme("importar de um arquivo (.docx/.odt/.pdf/.txt/.md): separa capítulos e segue o assistente de criação", async () => {
  // Importar de um arquivo → window.electronAPI.extractBookFile() abre dialog.showOpenDialog; sem como injetar o caminho.
});

test.fixme("exportar o arquivo aberto (Markdown, Word, PDF) e o livro (único, capítulos, projeto)", async () => {
  // exportFile/exportBook abrem dialog.showSaveDialog no processo principal.
});
