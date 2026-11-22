import { test, expect } from "@playwright/test";
import { launchApp } from "./helpers/launch.mjs";
import { selectBook, openCentral, centralTab, closeCentral, modalButton } from "./helpers/ui.mjs";

let app;
const cards = (page) => page.locator("#central-content .cn-skill-card");
const card = (page, titulo) => page.locator("#central-content .cn-skill-card", { hasText: titulo });
const chip = (page, nome) => page.locator(`#central-content .rv-chip[data-view=${nome}]`);

test.beforeAll(async () => {
  app = await launchApp();
  await selectBook(app.page);
});
test.afterAll(async () => {
  await app?.close();
});

test.describe.configure({ mode: "serial" });

test("Central de IA → Skills: biblioteca com as 11 skills nativas e a Loja com 6", async () => {
  const { page } = app;
  await openCentral(page, "ai");
  await centralTab(page, "Skills");
  await expect(chip(page, "library")).toContainText("11");
  await expect(chip(page, "market")).toContainText("6");
  await expect(cards(page)).toHaveCount(11);
  await expect(card(page, "Criar fichas de personagens citados")).toContainText("nativa");
  await expect(card(page, "Corrigir pendências da Central de Revisões")).toContainText("uso único");
  await expect(card(page, "Remover um item da história")).toContainText("recorrente");
  await expect(page.locator("#central-content")).toContainText("0 execuções no total");
});

test("a opção geral 'Todas as skills pedem permissão antes de rodar' existe e vem desmarcada no perfil padrão", async () => {
  const { page } = app;
  const sw = page.locator('input[data-change="ask-always"]');
  await expect(sw).not.toBeChecked();
  await expect(sw).toBeEnabled();
});

test("a busca filtra a biblioteca e avisa quando nada é encontrado", async () => {
  const { page } = app;
  const busca = page.locator('input[data-input="search"]');
  await busca.fill("personagens");
  await expect(cards(page).filter({ visible: true })).not.toHaveCount(11);
  await expect(card(page, "Criar fichas de personagens citados")).toBeVisible();
  await expect(card(page, "Conectar o livro")).toBeHidden();
  await busca.fill("zzzinexistente");
  await expect(page.locator(".cn-no-results")).toBeVisible();
  await busca.fill("");
  await expect(card(page, "Conectar o livro")).toBeVisible();
});

test("página de uma skill nativa: selo 'nativa', aviso, tools, gatilhos e SEM botão Remover", async () => {
  const { page } = app;
  await card(page, "Criar fichas de personagens citados").click();
  const pagina = page.locator(".cn-skill-page");
  await expect(pagina).toBeVisible();
  await expect(pagina.locator(".cn-native-badge")).toHaveText("nativa");
  await expect(pagina.locator("[data-act=run]")).toBeVisible();
  await expect(pagina.locator("[data-act=edit]")).toBeVisible();
  await expect(pagina.locator("[data-act=remove]")).toHaveCount(0);
  await expect(pagina).toContainText("tokens estimados");
  await expect(pagina).toContainText("Texto completo da skill");
  await expect(pagina).toContainText("Gatilhos");
  await expect(pagina).toContainText("Tools que a skill pode usar");
  await expect(pagina).toContainText("Nenhuma execução ainda");
});

test("Executar agora abre a janela de confirmação com o que a skill pode fazer e Cancelar não executa", async () => {
  const { page } = app;
  await page.locator(".cn-skill-page [data-act=run]").click();
  const modal = page.locator("#modal-container");
  await expect(modal).toContainText("Executar a skill");
  await expect(modal).toContainText("Ela pode usar:");
  await expect(modal).toContainText("Custo estimado");
  await modalButton(page, "Cancelar").click();
  await expect(modal).not.toContainText("Executar a skill");
  await expect(page.locator(".cn-skill-page")).toContainText("Nenhuma execução ainda");
});

test("preferências da skill: 'Pedir permissão antes de ativar' liga por padrão e pode ser desligada", async () => {
  const { page } = app;
  const ask = page.locator('.cn-skill-page input[data-change="ask"]');
  await expect(ask).toBeChecked();
  await page.locator('.cn-skill-page label.cn-switch-row:has(input[data-change="ask"]) .slider').click();
  await expect(ask).not.toBeChecked();
  await page.locator('.cn-skill-page label.cn-switch-row:has(input[data-change="ask"]) .slider').click();
  await expect(ask).toBeChecked();
});

test("Voltar retorna à biblioteca; a Loja lista skills ainda fora da biblioteca", async () => {
  const { page } = app;
  await page.locator(".cn-skill-page [data-act=back]").click();
  await expect(cards(page)).toHaveCount(11);
  await chip(page, "market").click();
  await expect(cards(page)).toHaveCount(6);
  await expect(card(page, "Avaliar o ritmo da história")).toBeVisible();
  await expect(page.locator("#central-content")).toContainText("funciona offline");
});

test("incluir uma skill da Loja na biblioteca, ver na biblioteca e removê-la (continua na Loja)", async () => {
  const { page } = app;
  await card(page, "Avaliar o ritmo da história").click();
  await page.locator(".cn-skill-page [data-act=install]").click();
  await expect(page.locator("#toast-container")).toContainText("Skill incluída na biblioteca");
  await expect(page.locator(".cn-skill-page [data-act=remove]")).toBeVisible();
  await page.locator(".cn-skill-page [data-act=back]").click(); // volta à Loja (de onde veio)
  await chip(page, "library").click();
  await expect(cards(page)).toHaveCount(12);
  await expect(chip(page, "library")).toContainText("12");
  await expect(chip(page, "market")).toContainText("5");
  // remover
  await card(page, "Avaliar o ritmo da história").click();
  await page.locator(".cn-skill-page [data-act=remove]").click();
  await expect(page.locator("#modal-container")).toContainText("Remover a skill?");
  await modalButton(page, "Remover").click();
  await expect(cards(page)).toHaveCount(11);
  await chip(page, "market").click();
  await expect(cards(page)).toHaveCount(6);
  await chip(page, "library").click();
});

test("criar uma skill: o formulário exige dados e a skill criada aparece na biblioteca", async () => {
  const { page } = app;
  await page.locator("[data-act=new]").click();
  await expect(page.locator("#central-content")).toContainText("Criar uma skill");
  // sem nome/instruções não salva
  await page.locator("[data-act=save]").click();
  await expect(page.locator("#toast-container")).toContainText("deve ter de 3 a 40 caracteres");
  await expect(page.locator("#central-content")).toContainText("Criar uma skill");

  await page.locator('input[data-key="title"]').fill("Revisar diálogos");
  await page.locator('input[data-key="slug"]').fill("revisar-dialogos");
  await page.locator('input[data-key="description"]').fill("Ao revisar os diálogos de um capítulo");
  await page.locator('textarea[data-key="body"]').fill("Leia o capítulo indicado e liste os diálogos que soam artificiais.");
  await page.locator("[data-act=save]").click();
  await expect(page.locator("#toast-container")).toContainText("Skill criada");
  await expect(page.locator(".cn-skill-page")).toContainText("Revisar diálogos");
  await page.locator(".cn-skill-page [data-act=back]").click();
  await expect(cards(page)).toHaveCount(12);
  await expect(card(page, "Revisar diálogos")).toContainText("uso único");
});

test("skill criada pelo autor pode ser removida (não é nativa)", async () => {
  const { page } = app;
  await card(page, "Revisar diálogos").click();
  await expect(page.locator(".cn-skill-page .cn-native-badge")).toHaveCount(0);
  await page.locator(".cn-skill-page [data-act=remove]").click();
  await modalButton(page, "Remover").click();
  await expect(cards(page)).toHaveCount(11);
  await expect(card(page, "Revisar diálogos")).toHaveCount(0);
  await closeCentral(page);
});
