import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { launchApp } from "./helpers/launch.mjs";
import { selectBook, modalButton, explorerTab, treeItem, openFile, walk, syncAll } from "./helpers/ui.mjs";

let app;
test.beforeAll(async () => {
  app = await launchApp();
});
test.afterAll(async () => {
  await app?.close();
});

test.describe.configure({ mode: "serial" });

test("sem livro selecionado o título da janela é só 'Astra Writer'", async () => {
  const { page } = app;
  await expect(page.locator("#book-dropdown-container")).toContainText("Clique para selecionar um livro");
  await expect(page).toHaveTitle("Astra Writer");
});

test("o dropdown lista o livro e as ações de criar/importar", async () => {
  const { page } = app;
  await page.locator("#book-dropdown-container .dropdown-trigger").click();
  const menu = page.locator("#book-dropdown-container .dropdown-menu");
  await expect(menu).toContainText("Livro de Teste");
  await expect(menu).toContainText("Criar novo livro");
  await expect(menu).toContainText("Importar livro (.zip)");
  await expect(menu).toContainText("Importar de um arquivo (Word, PDF, texto)");
  await page.keyboard.press("Escape");
});

test("selecionar o livro carrega o explorer e põe o nome do livro no título da janela", async () => {
  const { page } = app;
  await selectBook(page);
  await expect(page).toHaveTitle("Livro de Teste - Astra Writer");
  await expect(page.locator("#book-dropdown-container")).toContainText("Livro de Teste");
  const tree = page.locator("#file-tree");
  await expect(tree).toContainText("Capítulo 01");
  await expect(tree).toContainText("Índice de Capítulos");
  await expect(tree).toContainText("Sinopse");
});

test("o explorer tem as abas Anotações, Escrita e Mundo (Mundo com as categorias)", async () => {
  const { page } = app;
  await expect(page.locator(".explorer-tabs .tab-btn")).toHaveText([/Anotações/, /Escrita/, /Mundo/]);
  await explorerTab(page, "assets");
  for (const nome of ["Ambientes", "Conceitos", "Eventos", "Personagens"]) {
    await expect(page.locator("#file-tree .folder-title", { hasText: nome })).toBeVisible();
  }
  await explorerTab(page, "content");
});

test("abrir um capítulo mostra o manuscrito, as três guias e a contagem de palavras", async () => {
  const { page } = app;
  await openFile(page, "Capítulo 01");
  await expect(page.locator("#markdown-editor")).toContainText("Ana chegou ao porto de Eldoria ao amanhecer.");
  await expect(page.locator("#stat-words")).toHaveText(/8 palavras/);
  await expect(page.locator("#chapter-tabs")).toBeVisible();
  await expect(page.locator("#chapter-tabs .chapter-tab")).toHaveCount(3);
  await expect(page.locator("#chapter-tabs .chapter-tab[data-kind=draft]")).toContainText("Manuscrito");
  await page.locator("#chapter-tabs .chapter-tab[data-kind=outline]").click();
  await expect(page.locator("#chapter-tabs .chapter-tab[data-kind=outline]")).toContainText("Esboço");
  await page.locator("#chapter-tabs .chapter-tab[data-kind=draft]").click();
  await expect(page.locator("#markdown-editor")).toContainText("Ana chegou");
});

test("criar capítulo pelo explorer cria a pasta chapter_002 e o item na árvore", async () => {
  const { page } = app;
  await page.locator(".mini-btn[data-tab=content]").click();
  await expect(modalButton(page, "Criar capítulo")).toBeVisible();
  await page.locator("#title").fill("A Travessia");
  await page.locator("#plan").fill("Cena do cais e da partida.");
  await page.locator("[data-action=submit]").click();
  await expect(treeItem(page, "Capítulo 02")).toBeVisible();
  const dir = path.join(app.bookDir, "content", "chapter_002");
  expect(fs.existsSync(dir)).toBe(true);
  const arquivos = walk(dir).join(",");
  expect(arquivos).toMatch(/1_outline\.md/);
  expect(arquivos).toMatch(/2_draft\.md/);
  // A criação deixa o esboço como rascunho (.md.temp) até sincronizar
  const esboco = fs.existsSync(path.join(dir, "1_outline.md")) ? "1_outline.md" : "1_outline.md.temp";
  expect(fs.readFileSync(path.join(dir, esboco), "utf8")).toContain("Cena do cais");
});

test("excluir um capítulo pede confirmação e remove a pasta", async () => {
  const { page } = app;
  const item = page.locator("#file-tree .chapter-item", { hasText: "Capítulo 02" });
  await item.hover();
  await item.locator(".item-delete-btn").click({ force: true });
  await expect(page.locator("#modal-container")).toContainText(/exclu/i);
  await modalButton(page, "Excluir").click();
  await expect(treeItem(page, "Capítulo 02")).toHaveCount(0);
  expect(fs.existsSync(path.join(app.bookDir, "content", "chapter_002"))).toBe(false);
  await expect(treeItem(page, "Capítulo 01")).toBeVisible();
});

test("criar anotação, pasta própria, renomear e excluir pasta (aba Anotações)", async () => {
  const { page } = app;
  await explorerTab(page, "notes");
  await page.locator(".mini-btn[data-tab=notes][aria-label='Nova anotação']").click();
  await page.locator("#title").fill("Ideias para o final");
  await page.locator("[data-action=submit]").click();
  await expect(treeItem(page, "Ideias para o final")).toBeVisible();
  expect(walk(path.join(app.bookDir, "notes")).some((f) => f.endsWith(".md") || f.endsWith(".md.temp"))).toBe(true);

  await page.locator(".mini-btn[aria-label='Nova pasta']").click();
  await page.locator("#modal-container .modal-input").fill("Rascunhos soltos");
  await modalButton(page, "Criar pasta").click();
  const pasta = page.locator("#file-tree .folder-name", { hasText: "Rascunhos soltos" });
  await expect(pasta).toBeVisible();

  await pasta.hover();
  await pasta.locator(".folder-act-btn[title='Renomear pasta']").click({ force: true });
  await page.locator("#modal-container .modal-input").fill("Pesquisas");
  await modalButton(page, "Renomear").click();
  await expect(page.locator("#file-tree .folder-name", { hasText: "Pesquisas" })).toBeVisible();
  await expect(page.locator("#file-tree .folder-name", { hasText: "Rascunhos soltos" })).toHaveCount(0);

  const renomeada = page.locator("#file-tree .folder-name", { hasText: "Pesquisas" });
  await renomeada.hover();
  await renomeada.locator(".folder-act-btn[title^='Excluir pasta']").click({ force: true });
  await expect(page.locator("#modal-container")).toContainText(/pasta/i);
  await modalButton(page, "Excluir").click();
  await expect(page.locator("#file-tree .folder-name", { hasText: "Pesquisas" })).toHaveCount(0);
});

test("criar ficha de personagem pelo assistente (nasce como rascunho com * no explorer)", async () => {
  const { page } = app;
  await explorerTab(page, "assets");
  const pasta = page.locator("#file-tree .folder-name", { hasText: "Personagens" }).first();
  await pasta.hover();
  await pasta.locator(".folder-act-btn[title^='Novo item']").click({ force: true });
  await page.locator("#title").fill("Ana Marques");
  await page.locator("[data-action=skip]").click();
  await expect(treeItem(page, "Ana Marques")).toBeVisible();
  await expect(page.locator("#file-tab-name")).toHaveText("Ana Marques");
  const arquivos = walk(path.join(app.bookDir, "assets", "characters"));
  expect(arquivos.some((f) => f.startsWith("character_"))).toBe(true);
  await expect(page.locator("#file-tree li:has(> .file-name)", { hasText: "Ana Marques" }).locator(".dirty-asterisk")).toHaveCount(1);
});

test("excluir uma ficha ainda não sincronizada abre a confirmação", async () => {
  const { page } = app;
  const item = page.locator("#file-tree li:has(> .file-name)", { hasText: "Ana Marques" }).first();
  await item.locator(".item-delete-btn").dispatchEvent("click");
  await expect(modalButton(page, "Excluir")).toBeVisible({ timeout: 3000 });
  await modalButton(page, "Cancelar").click();
});

test("sincronizar e então excluir a ficha remove o arquivo e o item da árvore", async () => {
  const { page } = app;
  await syncAll(page);
  await expect(page.locator("#file-tree li:has(> .file-name)", { hasText: "Ana Marques" }).locator(".dirty-asterisk")).toHaveCount(0);
  const item = page.locator("#file-tree li:has(> .file-name)", { hasText: "Ana Marques" }).first();
  await item.locator(".item-delete-btn").dispatchEvent("click");
  await expect(page.locator("#modal-container")).toContainText("Excluir arquivo?");
  await modalButton(page, "Excluir").click();
  await expect(treeItem(page, "Ana Marques")).toHaveCount(0);
  // A skill nativa "Remover um item da história" é disparada por exclusão de personagem e pede permissão antes de rodar
  await expect(page.locator("#modal-container")).toContainText("Executar a skill");
  await modalButton(page, "Cancelar").click();
  await expect(page.locator("#modal-container")).not.toContainText("Executar a skill");
  expect(walk(path.join(app.bookDir, "assets", "characters")).some((f) => f.startsWith("character_"))).toBe(false);
});

test("a pesquisa encontra texto, ignora caixa e avisa quando não há resultado", async () => {
  const { page } = app;
  await explorerTab(page, "content");
  const busca = page.locator("#explorer-search-input");
  await busca.fill("ELDORIA");
  await expect(page.locator("#file-tree")).toContainText("Eldoria");
  await expect(page.locator("#explorer-search-clear")).toBeVisible();
  await busca.fill("xyzinexistente");
  await expect(page.locator("#search-empty")).toBeVisible();
  await expect(page.locator("#search-empty")).toContainText("Sem resultados para a pesquisa");
  await page.locator("#explorer-search-clear").click();
  await expect(busca).toHaveValue("");
  await expect(page.locator("#search-empty")).toBeHidden();
});

test("criar livro novo pelo assistente (4 passos) abre o livro e mostra a Sinopse", async () => {
  const { page } = app;
  await page.locator("#book-dropdown-container .dropdown-trigger").click();
  await page.locator(".dropdown-action", { hasText: "Criar novo livro" }).click();
  await page.locator("#book_title").fill("Crônicas de Teste");
  await expect(page.locator(".wizard-step-counter")).toHaveText("Passo 1 de 4");
  for (let i = 0; i < 3; i++) await page.locator("[data-action=next]").click();
  await page.locator("[data-action=submit]").click();
  await expect(page).toHaveTitle("Crônicas de Teste - Astra Writer");
  await expect(page.locator("#book-dropdown-container")).toContainText("Crônicas de Teste");
  await expect(page.locator("#file-tree")).toContainText("Capítulo 01");
  await expect(page.locator("#markdown-editor")).toContainText("Resumo da ideia central");
  expect(fs.existsSync(path.join(app.dataDir, "books", "book_002", "config.json"))).toBe(true);
});

test("trocar de livro no dropdown volta ao livro anterior", async () => {
  const { page } = app;
  await selectBook(page, "Livro de Teste");
  await expect(page.locator("#file-tree")).toContainText("Capítulo 01");
});
