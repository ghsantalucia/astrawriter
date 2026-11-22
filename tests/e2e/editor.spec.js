import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { launchApp } from "./helpers/launch.mjs";
import { selectBook, modalButton, explorerTab, openFile, typeInEditor, editorField, syncAll, dismissPrompts } from "./helpers/ui.mjs";

let app;
let cap;
const draft = () => path.join(cap, "2_draft.md");
const temp = () => path.join(cap, "2_draft.md.temp");
const links = (page) => page.locator("#markdown-editor .ProseMirror:visible a");

test.beforeAll(async () => {
  app = await launchApp();
  cap = path.join(app.bookDir, "content", "chapter_001");
  await app.page.locator("#book-dropdown-container").waitFor();
  await selectBook(app.page);
});
test.afterAll(async () => {
  await app?.close();
});

test.describe.configure({ mode: "serial" });

test("sem arquivo aberto os botões da barra ficam desativados", async () => {
  const { page } = app;
  await expect(page.locator("#btn-history")).toBeDisabled();
  await expect(page.locator("#btn-export")).toBeDisabled();
  await expect(page.locator("#btn-autolink")).toBeDisabled();
  await expect(page.locator("#btn-save")).toBeDisabled();
});

test("abrir o capítulo mostra texto, guia Manuscrito ativa e rodapé com contagens", async () => {
  const { page } = app;
  await openFile(page, "Capítulo 01");
  await expect(page.locator("#chapter-tabs .chapter-tab[aria-selected=true]")).toContainText("Manuscrito");
  await expect(page.locator("#stat-words")).toHaveText("8 palavras");
  await expect(page.locator("#stat-read")).toContainText("min de leitura");
  await expect(page.locator("#stat-links")).toHaveText("0 conexões wiki");
  await expect(page.locator("#btn-history")).toBeEnabled();
  await expect(page.locator("#btn-export")).toBeEnabled();
  await expect(page.locator("#btn-autolink")).toBeEnabled();
});

test("digitar salva um rascunho .md.temp automaticamente, atualiza palavras e mostra o * de rascunho", async () => {
  const { page } = app;
  expect(fs.existsSync(temp())).toBe(false);
  await typeInEditor(page, " Depois Rui apareceu no cais.", { replace: false });
  await page.keyboard.press("Control+End");
  await expect(page.locator("#save-status-indicator")).toBeVisible();
  await expect(page.locator("#save-status-indicator .status-text")).toHaveText("Rascunho salvo");
  await expect(page.locator("#stat-words")).toHaveText("13 palavras");
  await expect(page.locator("#chapter-tabs .chapter-tab[data-kind=draft] .file-tab-dirty")).toBeVisible();
  await expect(page.locator("#file-tree .chapter-item .dirty-asterisk")).toHaveCount(1);
  await expect(page.locator("#btn-save")).toBeEnabled();
  expect(fs.existsSync(temp())).toBe(true);
  expect(fs.readFileSync(temp(), "utf8")).toContain("Depois Rui apareceu no cais.");
  // O arquivo oficial continua como estava até sincronizar
  expect(fs.readFileSync(draft(), "utf8")).not.toContain("Rui");
});

test("o botão Exportar abre o menu com Markdown, Word e PDF e fecha ao clicar fora", async () => {
  const { page } = app;
  await page.locator("#btn-export").click();
  const menu = page.locator("#export-menu");
  await expect(menu).toBeVisible();
  await expect(menu.locator(".export-item")).toHaveText([/Markdown/, /Word/, /PDF/]);
  await page.locator("#markdown-editor").click({ position: { x: 20, y: 200 } });
  await expect(menu).toBeHidden();
});

test("Sincronizar lista o arquivo, grava o oficial, apaga o rascunho e remove o *", async () => {
  const { page } = app;
  await page.locator("#btn-save").click();
  await expect(page.locator("#modal-container")).toContainText("Sincronizar Alterações Pendentes");
  await expect(page.locator("#sync-file-list .sync-file-item")).toHaveCount(1);
  await expect(page.locator("#sync-file-list")).toContainText("Manuscrito");
  await expect(page.locator("#sync-count-label")).toContainText("(1)");
  await modalButton(page, "Sincronizar Selecionados").click();
  await dismissPrompts(page);
  await expect(page.locator("#chapter-tabs .chapter-tab[data-kind=draft] .file-tab-dirty")).toBeHidden();
  await expect(page.locator("#file-tree .chapter-item .dirty-asterisk")).toHaveCount(0);
  await expect(page.locator("#btn-save")).toBeDisabled();
  expect(fs.existsSync(temp())).toBe(false);
  expect(fs.readFileSync(draft(), "utf8")).toContain("Depois Rui apareceu no cais.");
});

test("o Histórico lista as versões e restaurar uma versão antiga volta o texto", async () => {
  const { page } = app;
  // Segunda edição sincronizada para existir uma versão anterior restaurável
  await typeInEditor(page, " Fim.", { replace: false });
  await expect(page.locator("#save-status-indicator .status-text")).toHaveText("Rascunho salvo");
  await syncAll(page);
  await page.locator("#btn-history").click();
  const modal = page.locator("#modal-container");
  await expect(modal).toContainText("Histórico — Manuscrito");
  await expect(modal.locator(".history-item.current")).toHaveCount(1);
  await expect(modal.locator(".history-item.current")).toContainText("versão atual");
  const restaurar = modal.locator(".btn-history-restore");
  expect(await restaurar.count()).toBeGreaterThan(0);
  await restaurar.first().click();
  // Restaurar pode pedir confirmação ou comparar lado a lado antes
  const confirmar = modalButton(page, "Restaurar");
  if (await confirmar.isVisible().catch(() => false)) await confirmar.click();
  await dismissPrompts(page, 1000);
  await expect(page.locator("#markdown-editor")).not.toContainText("Fim.");
  await expect(page.locator("#markdown-editor")).toContainText("Depois Rui apareceu no cais.");
});

test("Ctrl+F abre o painel de procurar e substituir e Substituir tudo troca no texto", async () => {
  const { page } = app;
  await page.keyboard.press("Escape");
  await openFile(page, "Capítulo 01");
  await editorField(page).click();
  await page.keyboard.press("Control+F");
  const painel = page.locator(".find-panel:not(.hidden)");
  await expect(painel).toBeVisible();
  await painel.locator("[data-role=find-input]").fill("Eldoria");
  await expect(painel.locator("[data-role=find-count]")).toContainText("1");
  await painel.locator("[data-role=replace-input]").fill("Valdora");
  await painel.locator("[data-role=replace-all]").click();
  await expect(page.locator("#markdown-editor")).toContainText("porto de Valdora");
  await painel.locator("[data-role=find-close]").click();
  await expect(page.locator(".find-panel:not(.hidden)")).toHaveCount(0);
});

test("a caixa 'Dados do arquivo' mostra tags: vírgula cria, normaliza para minúsculo/hífen e × remove", async () => {
  const { page } = app;
  await page.locator(".file-data-head").click();
  const box = page.locator(".file-data-box");
  await expect(box.locator(".file-data-body")).toBeVisible();
  const input = box.locator(".file-data-tag-input input");
  await input.click();
  await page.keyboard.type("Alta Fantasia,");
  await page.keyboard.type("#Magia");
  await page.keyboard.press("Enter");
  const chips = box.locator(".file-data-tag-input .tag-chip");
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(0)).toContainText("alta-fantasia");
  await expect(chips.nth(1)).toContainText("magia");
  await chips.nth(1).locator("button, .tag-remove, [data-remove]").first().click();
  await expect(chips).toHaveCount(1);
  await box.locator(".file-data-save").click();
  await expect(box.locator(".file-data-tags")).toContainText("alta-fantasia");
});

test("clicar numa tag do cabeçalho preenche a pesquisa do explorer com #tag", async () => {
  const { page } = app;
  await page.locator(".file-data-box .file-data-tags .tag-chip").first().click();
  await expect(page.locator("#explorer-search-input")).toHaveValue(/#alta-fantasia/);
  await page.locator("#explorer-search-clear").click();
});

test("auto-link transforma o apelido de uma ficha em link (rosa até sincronizar) e a ficha passa a ser 'citada'", async () => {
  const { page } = app;
  await explorerTab(page, "assets");
  const pasta = page.locator("#file-tree .folder-name", { hasText: "Personagens" }).first();
  await pasta.hover();
  await pasta.locator(".folder-act-btn[title^='Novo item']").click({ force: true });
  await page.locator("#title").fill("Ana Marques");
  await page.locator("#aliases").fill("Ana, Aninha");
  await page.locator("[data-action=skip]").click();
  await expect(page.locator("#file-tab-name")).toHaveText("Ana Marques");
  await typeInEditor(page, " Ela e corajosa.", { replace: false });
  await syncAll(page);

  await explorerTab(page, "content");
  await openFile(page, "Capítulo 01");
  await expect(links(page)).toHaveCount(0);
  await page.locator("#btn-autolink").click();
  await expect(links(page)).toHaveCount(1);
  await expect(links(page).first()).toHaveText("Ana");
  await expect(links(page).first()).toHaveAttribute("href", /characters\/character_001\.md#auto/);
  await expect(page.locator("#toast-container")).toContainText("1 link criado");
  await expect(page.locator("#stat-links")).toHaveText("1 conexão wiki");
  await expect(page.locator("#save-status-indicator .status-text")).toHaveText("Rascunho salvo");
  await syncAll(page);
  const oficial = fs.readFileSync(draft(), "utf8");
  expect(oficial).toContain("character_001.md");
  expect(oficial).not.toContain("#auto");

  await explorerTab(page, "assets");
  await openFile(page, "Ana Marques");
  await expect(page.locator(".file-data-cited")).toHaveText("citado em 1 arquivo");
});

test("criar uma ficha deveria habilitar o botão Sincronizar (rascunho novo entra na lista)", async () => {
  const { page } = app;
  await explorerTab(page, "content");
  await page.locator(".mini-btn[data-tab=content]").click();
  await page.locator("#title").fill("Capítulo extra");
  await page.locator("[data-action=submit]").click();
  await expect(page.locator("#file-tree .chapter-item .dirty-asterisk")).toHaveCount(1);
  await expect(page.locator("#btn-save")).toBeEnabled({ timeout: 4000 });
});

// Sincronizar logo depois de digitar (antes de o autosave do rascunho rodar) não pode perder o que acabou de ser digitado.
test("sincronizar imediatamente depois de digitar inclui o último texto digitado", async () => {
  const { page } = app;
  await explorerTab(page, "content");
  await openFile(page, "Capítulo 01");
  await typeInEditor(page, " Rápido.", { replace: false });
  await expect(page.locator("#btn-save")).toBeEnabled();
  await page.locator("#btn-save").click();
  await modalButton(page, "Sincronizar Selecionados").click();
  await dismissPrompts(page);
  expect(fs.readFileSync(draft(), "utf8")).toContain("Rápido.");
});

test("auto-link seguido de Sincronizar imediato grava o link no arquivo oficial", async () => {
  const { page } = app;
  await typeInEditor(page, " Aninha sorriu.", { replace: false });
  await expect(page.locator("#save-status-indicator .status-text")).toHaveText("Rascunho salvo");
  await page.locator("#btn-autolink").click();
  await expect(links(page)).toHaveCount(2);
  await syncAll(page);
  const oficial = fs.readFileSync(draft(), "utf8");
  expect(oficial.split("character_001.md").length - 1).toBe(2);
});
