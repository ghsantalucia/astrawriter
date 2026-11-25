import { test, expect } from "@playwright/test";
import { launchApp } from "./helpers/launch.mjs";
import { selectBook, openCentral, centralTab, closeCentral, openFile, typeInEditor } from "./helpers/ui.mjs";

let app;
const drawer = (page) => page.locator("#settings-container");
const abrirGaveta = async (page) => {
  if (!(await drawer(page).evaluate((el) => el.classList.contains("open")))) await page.locator("#btn-open-menu").click();
  await expect(drawer(page)).toHaveClass(/open/);
};
const marcar = async (page, id, valor) => {
  // O input fica escondido atrás do .slider: clica no controle visível quando o estado precisa mudar
  if ((await page.locator(`#${id}`).isChecked()) !== valor) await page.locator(`label.switch:has(#${id}) .slider`).click();
};

test.beforeAll(async () => {
  app = await launchApp();
  await selectBook(app.page);
});
test.afterAll(async () => {
  await app?.close();
});

test.describe.configure({ mode: "serial" });

test("a gaveta de Configurações mostra Centrais, Aparência, Idioma e IA", async () => {
  const { page } = app;
  await abrirGaveta(page);
  const g = drawer(page);
  for (const t of ["Central de Revisões", "Central do Livro", "Central de IA", "Central do Sistema", "Modo escuro", "Plano de fundo do chat", "Correção ortográfica e gramatical", "Conta e modelo"]) {
    await expect(g).toContainText(t);
  }
  await expect(page.locator("#ai-summary-value")).toContainText("Assistente Astra");
});

test("Modo escuro alterna o tema (classe dark-theme) e volta ao claro", async () => {
  const { page } = app;
  await expect(page.locator("body")).not.toHaveClass(/dark-theme/);
  await marcar(page, "theme-toggle", true);
  await expect(page.locator("body")).toHaveClass(/dark-theme/);
  await expect(page.locator("#theme-toggle")).toBeChecked();
  await marcar(page, "theme-toggle", false);
  await expect(page.locator("body")).not.toHaveClass(/dark-theme/);
});

test("o atalho Ctrl+Shift+T alterna o tema e mantém o switch sincronizado", async () => {
  const { page } = app;
  await page.keyboard.press("Control+Shift+T");
  await expect(page.locator("body")).toHaveClass(/dark-theme/);
  await expect(page.locator("#theme-toggle")).toBeChecked();
  await page.keyboard.press("Control+Shift+T");
  await expect(page.locator("body")).not.toHaveClass(/dark-theme/);
});

test("Plano de fundo do chat: recolhido por padrão; Cor sólida mostra o seletor de cor, por tema", async () => {
  const { page } = app;
  const det = page.locator("#chat-bg-details");
  await expect(det).not.toHaveAttribute("open", "");
  await det.locator("summary").click();
  await expect(det).toHaveAttribute("open", "");
  const modos = page.locator("#chat-bg-mode-light option");
  await expect(modos).toHaveText(["Estrelas", "Nebulosa", "Órbitas", "Cor sólida"]);
  // Nebulosa não tem cor; Estrelas, Órbitas e Cor sólida têm
  await page.locator("#chat-bg-mode-light").selectOption("nebula");
  await expect(page.locator("#chat-bg-color-light")).toBeHidden();
  await page.locator("#chat-bg-mode-light").selectOption("solid");
  await expect(page.locator("#chat-bg-color-light")).toBeVisible();
  await page.locator("#chat-bg-mode-light").selectOption("orbits");
  await expect(page.locator("#chat-bg-color-light")).toBeVisible();
  // O tema escuro é independente
  await page.locator("#chat-bg-mode-dark").selectOption("nebula");
  await expect(page.locator("#chat-bg-color-dark")).toBeHidden();
  await expect(page.locator("#chat-bg-mode-light")).toHaveValue("orbits");
  await page.locator("#chat-bg-mode-light").selectOption("stars");
  await page.locator("#chat-bg-mode-dark").selectOption("stars");
});

test("Idioma da correção: quatro idiomas, padrão português do Brasil, e troca vale", async () => {
  const { page } = app;
  const sel = page.locator("#spell-language-select");
  await expect(sel).toHaveValue("pt-BR");
  await expect(sel.locator("option")).toHaveText(["Português (Brasil)", "English (US)", "Español", "Français"]);
  await sel.selectOption("en-US");
  await expect(sel).toHaveValue("en-US");
  await sel.selectOption("pt-BR");
  await expect(sel).toHaveValue("pt-BR");
});

test("o corretor sublinha palavra desconhecida e repetida; desligar a correção remove o sublinhado e os avisos", async () => {
  const { page } = app;
  await page.locator("#btn-close-menu").click();
  await openFile(page, "Capítulo 01");
  await typeInEditor(page, " Ele foi foi ao mercaddo.", { replace: false });
  await expect(page.locator("#stat-spell-item")).toBeVisible();
  await expect(page.locator("#stat-spell")).toContainText("problema");
  await abrirGaveta(page);
  await expect(page.locator("#spellcheck-toggle")).toBeChecked();
  await marcar(page, "spellcheck-toggle", false);
  await expect(page.locator("#stat-spell-item")).toBeHidden();
  await marcar(page, "spellcheck-toggle", true);
  await expect(page.locator("#stat-spell-item")).toBeVisible();
  await page.locator("#btn-close-menu").click();
});

test("Esc fecha a gaveta de configurações", async () => {
  const { page } = app;
  await abrirGaveta(page);
  await page.keyboard.press("Escape");
  await expect(drawer(page)).not.toHaveClass(/open/);
});

test("Central do Sistema → Atalhos lista os atalhos padrão e o fixo de Esc", async () => {
  const { page } = app;
  await openCentral(page, "system");
  await centralTab(page, "Atalhos");
  const c = page.locator("#central-content");
  await expect(c).toContainText("Sincronizar alterações");
  await expect(c).toContainText("Alternar tema claro/escuro");
  await expect(c.locator("#keys-file\\.sync")).toContainText("Ctrl");
  await expect(c.locator("#keys-file\\.sync")).toContainText("S");
  await expect(c).toContainText("Atalhos fixos");
});

test("Atalhos: alterar um atalho, usá-lo e restaurar o padrão", async () => {
  const { page } = app;
  const keys = page.locator("#keys-theme\\.toggle");
  await page.locator("[data-act=record][data-id='theme.toggle']").click();
  await page.keyboard.press("Control+Alt+J");
  await expect(keys).toContainText("J");
  await expect(page.locator("[data-act=reset][data-id='theme.toggle']")).toBeEnabled();
  await closeCentral(page);
  await page.keyboard.press("Control+Alt+J");
  await expect(page.locator("body")).toHaveClass(/dark-theme/);
  await page.keyboard.press("Control+Alt+J");
  await expect(page.locator("body")).not.toHaveClass(/dark-theme/);
  await openCentral(page, "system");
  await centralTab(page, "Atalhos");
  await page.locator("[data-act=reset][data-id='theme.toggle']").click();
  await expect(keys).toContainText("T");
  await expect(page.locator("[data-act=reset][data-id='theme.toggle']")).toBeDisabled();
  await closeCentral(page);
});

test("atalhos globais: Ctrl+, abre as configurações e Ctrl+Shift+Y abre a Central do Sistema", async () => {
  const { page } = app;
  await page.keyboard.press("Control+,");
  await expect(drawer(page)).toHaveClass(/open/);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+Shift+Y");
  await expect(page.locator("#central-overlay")).not.toHaveClass(/hidden/);
  await expect(page.locator("#central-title")).toContainText("Sistema");
  await page.keyboard.press("Escape");
  await expect(page.locator("#central-overlay")).toHaveClass(/hidden/);
});
