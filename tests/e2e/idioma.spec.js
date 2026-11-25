import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { launchApp } from "./helpers/launch.mjs";
import { selectBook, explorerTab, treeItem, openFile, openCentral, centralTab, closeCentral, modalButton } from "./helpers/ui.mjs";

let app;
test.beforeAll(async () => {
  app = await launchApp({ lang: "en", keepData: true });
});
test.afterAll(async () => {
  await app?.close();
});

test.describe.configure({ mode: "serial" });

test("em inglês: dropdown de livros, explorer e capítulo aparecem traduzidos", async () => {
  const { page } = app;
  await expect(page.locator("#book-dropdown-container")).toContainText("Click to select a book");
  await page.locator("#book-dropdown-container .dropdown-trigger").click();
  const menu = page.locator("#book-dropdown-container .dropdown-menu");
  await expect(menu).toContainText("Test Book");
  await expect(menu).toContainText("Create new book");
  await expect(menu).toContainText("Import book (.zip)");
  await page.keyboard.press("Escape");

  await selectBook(page, "Test Book");
  const tree = page.locator("#file-tree");
  await expect(tree).toContainText("Chapter 01");
  await expect(tree).toContainText("Chapters Index");
  await expect(tree).toContainText("Synopsis");
  await expect(page.locator(".explorer-tabs .tab-btn")).toHaveText([/Notes/, /Writing/, /World/]);
  await explorerTab(page, "assets");
  for (const nome of ["Characters", "Places", "Concepts", "Events"]) {
    await expect(treeItem(page, nome).first()).toBeVisible();
  }
  await explorerTab(page, "content");
});

test("em inglês: o capítulo abre, o editor e as guias mostram textos em inglês", async () => {
  const { page } = app;
  await openFile(page, "Chapter 01");
  await expect(page.locator("#markdown-editor")).toContainText("Ana chegou ao porto de Eldoria ao amanhecer.");
  await expect(page.locator("#stat-words")).toHaveText(/8 words/);
  await expect(page.locator("#chapter-tabs")).toContainText("Outline");
  await expect(page.locator("#chapter-tabs")).toContainText("Manuscript");
  await expect(page.locator("#chapter-tabs")).toContainText("Analysis");
});

test("em inglês: nenhum texto da tela principal ficou em português", async () => {
  const { page } = app;
  const text = await page.locator("body").innerText();
  // Palavras que só existem em português nos rótulos do app (o texto do capítulo de teste é do livro e fica de fora)
  const body = text.replace("Ana chegou ao porto de Eldoria ao amanhecer.", "");
  for (const palavra of ["Sincronizar", "Anotações", "Escrita", "Capítulo", "Salvar", "Pesquisar", "Configurações"]) {
    expect(body, `texto em português na tela: ${palavra}`).not.toContain(palavra);
  }
});

test("em inglês: capítulos novos nascem como 'Chapter NN' e a exclusão renumera os seguintes", async () => {
  const { page } = app;
  const criar = async (titulo) => {
    await page.locator(".mini-btn[data-tab=content]").click();
    await expect(modalButton(page, "Create chapter")).toBeVisible();
    await page.locator("#title").fill(titulo);
    await page.locator("#plan").fill("Scene at the pier.");
    await page.locator("[data-action=submit]").click();
  };
  await criar("The Crossing");
  await expect(treeItem(page, "Chapter 02")).toBeVisible();
  await criar("The Storm");
  await expect(treeItem(page, "Chapter 03")).toBeVisible();
  const yml = (n) => fs.readFileSync(path.join(app.bookDir, "content", `chapter_${n}`, "folder.yml"), "utf8");
  expect(yml("002")).toContain("Chapter 02");
  // Exclui o capítulo 02: o 03 vira 02 (título padrão em inglês é reconhecido e renumerado)
  const item = page.locator("#file-tree .chapter-item", { hasText: "Chapter 02" });
  await item.hover();
  await item.locator(".item-delete-btn").click({ force: true });
  await modalButton(page, "Delete").click();
  await expect(treeItem(page, "Chapter 03")).toHaveCount(0);
  await expect(treeItem(page, "Chapter 02")).toBeVisible();
  expect(yml("002")).toContain("Chapter 02");
  expect(fs.existsSync(path.join(app.bookDir, "content", "chapter_003"))).toBe(false);
});

test("em inglês: Central do Sistema tem o seletor de idioma e trocar para português recarrega a tela", async () => {
  const { page } = app;
  await openCentral(page, "system");
  await expect(page.locator("#central-title")).toContainText("System");
  await centralTab(page, "General");
  const select = page.locator('select[data-id="ui.language"]');
  await expect(select).toHaveValue("en");
  await select.selectOption("pt-BR");
  await expect(page.locator("#book-dropdown-container")).toContainText(/Clique para selecionar um livro|Livro|Test Book/, { timeout: 30000 });
  await page.locator("#book-dropdown-container .dropdown-trigger").click();
  await expect(page.locator("#book-dropdown-container .dropdown-menu")).toContainText("Criar novo livro");
  await page.keyboard.press("Escape");
  // A escolha fica gravada para a próxima abertura
  const saved = fs.readFileSync(path.join(app.dataDir, "userData", "language.json"), "utf8");
  expect(JSON.parse(saved).language).toBe("pt-BR");
});

test("de volta ao português, o app volta a falar português e o seletor aponta para ele", async () => {
  const { page } = app;
  await openCentral(page, "system");
  await centralTab(page, "Geral");
  await expect(page.locator('select[data-id="ui.language"]')).toHaveValue("pt-BR");
  await closeCentral(page);
});
