import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { launchApp } from "./helpers/launch.mjs";
import { selectBook, openCentral, centralTab, closeCentral, modalButton, forceFocus } from "./helpers/ui.mjs";

let app;
const conteudo = (page) => page.locator("#central-content");
const abaAtiva = (page) => page.locator("#central-tabs button.active, #central-tabs button[aria-selected=true], #central-tabs .active").first();
const conta = (page, apelido) => page.locator(`.cn-acct:has(input.cn-acct-nick[value="${apelido}"])`);
const configSwitch = (page, id) => page.locator(`label.cn-switch-row:has(input[data-id="${id}"]) .slider`);

test.beforeAll(async () => {
  app = await launchApp();
  await selectBook(app.page);
});
test.afterAll(async () => {
  await app?.close();
});

test.describe.configure({ mode: "serial" });

test.describe("Central de Revisões", () => {
  test("abre pela gaveta e lista as seis abas, com Resumo do livro", async () => {
    const { page } = app;
    await openCentral(page, "issues");
    await expect(page.locator("#central-title")).toContainText("Revisões");
    const abas = page.locator("#central-tabs button");
    await expect(abas).toHaveCount(6);
    for (const nome of ["Resumo", "Links", "Ortografia e gramática", "Linha do tempo", "Contradições", "Dicas de melhoria"]) {
      await expect(page.locator("#central-tabs")).toContainText(nome);
    }
    await expect(page.locator("#central-subtitle")).toHaveText("Resumo do livro");
    await expect(conteudo(page)).toContainText("Revisões do sistema neste livro");
    await expect(conteudo(page)).toContainText("pendências no total");
  });

  test("cada aba mostra o seu conteúdo (categorias vazias dizem 'Nenhuma pendência')", async () => {
    const { page } = app;
    await centralTab(page, "Links");
    await expect(conteudo(page)).toContainText("Nenhuma pendência nesta categoria.");
    await expect(conteudo(page)).toContainText("links internos quebrados");
    await centralTab(page, "Contradições");
    await expect(conteudo(page)).toContainText("Nenhuma pendência nesta categoria.");
    await centralTab(page, "Dicas de melhoria");
    await expect(conteudo(page)).toContainText("Nunca são erros");
    await centralTab(page, "Linha do tempo");
    await expect(conteudo(page)).toContainText("Sugestão de linha do tempo");
    await centralTab(page, "Ortografia e gramática");
    await expect(conteudo(page)).toContainText("Correção ortográfica");
  });

  test("Esc fecha a Central; o botão do rodapé do editor e o do toolbar abrem de novo (aba Ortografia)", async () => {
    const { page } = app;
    await page.keyboard.press("Escape");
    await expect(page.locator("#central-overlay")).toHaveClass(/hidden/);
    await page.locator("#btn-spelling").click();
    await expect(page.locator("#central-overlay")).not.toHaveClass(/hidden/);
    await expect(page.locator("#central-subtitle")).toContainText("Ortografia");
    await closeCentral(page);
  });
});

test.describe("Central do Livro", () => {
  test("lista Dados, Visão geral, Exportar, Changelog e Excluir livro", async () => {
    const { page } = app;
    await openCentral(page, "book");
    await expect(page.locator("#central-title")).toContainText("Livro");
    await expect(page.locator("#central-tabs button")).toHaveCount(5);
    await expect(page.locator("#book-title-input")).toHaveValue("Livro de Teste");
    await expect(conteudo(page)).toContainText("Pasta no computador: book_001");
  });

  test("modo da IA: três opções, padrão Assistente; trocar para Co-autor grava no config.json", async () => {
    const { page } = app;
    await expect(page.locator("input[name=ai-mode]")).toHaveCount(3);
    await expect(page.locator("input[name=ai-mode][value=assistant]")).toBeChecked();
    await page.locator("label.cn-radio-card:has(input[value=coauthor])").click();
    await expect(page.locator("input[name=ai-mode][value=coauthor]")).toBeChecked();
    await expect.poll(() => JSON.parse(fs.readFileSync(path.join(app.bookDir, "config.json"), "utf8")).ai_mode).toBe("coauthor");
  });
  // Regressão: a página guardava o objeto do livro do desenho; após a 1a gravação a lista é recarregada e a 2a troca era perdida.
  test("uma segunda troca de modo sem fechar a Central deveria gravar o novo modo", async () => {
    const { page } = app;
    await page.locator("label.cn-radio-card:has(input[value=autonomous])").click();
    await expect.poll(() => JSON.parse(fs.readFileSync(path.join(app.bookDir, "config.json"), "utf8")).ai_mode, { timeout: 4000 }).toBe("autonomous");
  });

  test("Perfil dos templates: o botão 'Editar os templates' leva à aba Templates da Central do Sistema", async () => {
    const { page } = app;
    await page.locator("[data-act=open-templates]").click();
    await expect(page.locator("#central-title")).toContainText("Sistema");
    await expect(abaAtiva(page)).toContainText("Templates");
    await closeCentral(page);
    await openCentral(page, "book");
  });

  test("reabrir a Central e voltar ao modo Assistente grava no config.json", async () => {
    const { page } = app;
    await closeCentral(page);
    await openCentral(page, "book");
    await page.locator("label.cn-radio-card:has(input[value=assistant])").click();
    await expect.poll(() => JSON.parse(fs.readFileSync(path.join(app.bookDir, "config.json"), "utf8")).ai_mode).toBe("assistant");
  });

  test("renomear o livro atualiza o título da janela e o seletor", async () => {
    const { page } = app;
    await closeCentral(page);
    await openCentral(page, "book");
    await page.locator("#book-title-input").fill("Livro Renomeado");
    await page.locator("[data-act=save-title]").click();
    await expect(page).toHaveTitle("Livro Renomeado - Astra Writer");
    await expect(page.locator("#book-dropdown-container")).toContainText("Livro Renomeado");
    const cfg = JSON.parse(fs.readFileSync(path.join(app.bookDir, "config.json"), "utf8"));
    expect(cfg.book_title).toBe("Livro Renomeado");
    expect(fs.existsSync(app.bookDir)).toBe(true); // a pasta não muda
  });

  test("Visão geral conta capítulos e arquivos do livro", async () => {
    const { page } = app;
    await centralTab(page, "Visão geral");
    await expect(conteudo(page)).toContainText("arquivos no livro (total)");
    await expect(conteudo(page).locator(".cn-stat", { hasText: "capítulo" }).first()).toContainText("1");
    await expect(conteudo(page).locator(".cn-stat", { hasText: "personagens" })).toContainText("0");
  });

  test("Exportar: três modos; projeto completo esconde a escolha de formato", async () => {
    const { page } = app;
    await centralTab(page, "Exportar");
    await expect(conteudo(page)).toContainText("Livro em um único arquivo");
    await expect(conteudo(page)).toContainText("Capítulos separados (zip)");
    await expect(conteudo(page)).toContainText("Projeto completo (zip)");
    await expect(page.locator("#export-formats")).toContainText("Markdown");
    await expect(page.locator("#export-formats")).toContainText("Word");
    await expect(page.locator("#export-formats")).toContainText("PDF");
    await conteudo(page).locator("label", { hasText: "Projeto completo" }).first().click();
    await expect(page.locator("#export-formats-note")).toBeVisible();
    await conteudo(page).locator("label", { hasText: "Livro em um único arquivo" }).first().click();
    await expect(page.locator("#export-formats-note")).toBeHidden();
  });

  test("Changelog mostra o espaço ocupado e o registro das ações do livro", async () => {
    const { page } = app;
    await centralTab(page, "Changelog");
    await expect(page.locator("#changelog-size")).not.toHaveText("…");
    await expect(page.locator("#changelog-list")).toContainText(/update|review|create/i);
  });

  test("Excluir livro exige digitar o nome da pasta (botão só habilita com book_001)", async () => {
    const { page } = app;
    await centralTab(page, "Excluir livro");
    await expect(page.locator("#book-delete-btn")).toBeDisabled();
    await page.locator("#book-delete-confirm").fill("book_00");
    await expect(page.locator("#book-delete-btn")).toBeDisabled();
    await page.locator("#book-delete-confirm").fill("book_001");
    await expect(page.locator("#book-delete-btn")).toBeEnabled();
    await closeCentral(page);
    expect(fs.existsSync(app.bookDir)).toBe(true);
  });
});

test.describe("Central de IA", () => {
  test("Contas e modelo: o assistente embutido está em uso e não pode ser removido", async () => {
    const { page } = app;
    await openCentral(page, "ai");
    await expect(page.locator("#central-title")).toContainText("IA");
    await expect(page.locator("#central-tabs button")).toHaveCount(7);
    const conta = page.locator(".cn-acct", { hasText: "Assistente Astra" });
    await expect(conta).toHaveCount(1);
    await expect(conta).toHaveClass(/active/);
    await expect(conta).toContainText("embutido");
    await expect(conta.locator("[data-act=remove]")).toHaveCount(0);
  });

  test("adicionar uma conta (Ollama, sem chave), usá-la na gaveta e removê-la com confirmação", async () => {
    const { page } = app;
    await page.locator("#new-provider").selectOption("ollama");
    await page.locator("#new-nick").fill("Local de teste");
    await page.locator("#new-model").fill("modelo-x");
    await page.locator("[data-act=add]").click();
    const nova = conta(page, "Local de teste");
    await expect(nova).toBeVisible();
    await expect(nova).not.toHaveClass(/active/);
    await expect(page.locator(".cn-acct")).toHaveCount(2);
    // aparece no seletor de conta das Configurações
    await closeCentral(page);
    await page.locator("#btn-open-menu").click();
    await page.locator("#ai-details summary").click();
    await expect(page.locator("#ai-provider-select option", { hasText: "Local de teste" })).toHaveCount(1);
    await page.locator("#btn-close-menu").click();
    // remover
    await openCentral(page, "ai");
    await conta(page, "Local de teste").locator("[data-act=remove]").click();
    await expect(page.locator("#modal-container")).toContainText("Remover a conta?");
    await modalButton(page, "Remover").click();
    await expect(conta(page, "Local de teste")).toHaveCount(0);
    await expect(page.locator(".cn-acct")).toHaveCount(1);
  });

  test("adicionar conta de provedor com chave exige a chave", async () => {
    const { page } = app;
    await page.locator("#new-provider").selectOption("claude");
    await page.locator("#new-nick").fill("Sem chave");
    await page.locator("[data-act=add]").click();
    await expect(page.locator("#toast-container")).toContainText("Cole a chave de API");
    await expect(conta(page, "Sem chave")).toHaveCount(0);
  });

  test("Fallback, Uso por modelo, Depuração e Log de erros abrem com o estado inicial vazio", async () => {
    const { page } = app;
    await centralTab(page, "Fallback");
    await expect(conteudo(page)).toContainText("Usar fallback automático");
    await centralTab(page, "Uso por modelo");
    await expect(conteudo(page)).toContainText("Nenhum uso registrado neste período");
    await expect(conteudo(page)).toContainText("requisições");
    await centralTab(page, "Depuração");
    await expect(conteudo(page)).toContainText("Nada por aqui");
    await centralTab(page, "Log de erros");
    await expect(conteudo(page)).toContainText("Nenhum erro registrado");
  });

  test("Perfil e análises: cinco perfis; Equilibrado é o padrão; mexer em opção vira Personalizado", async () => {
    const { page } = app;
    await centralTab(page, "Perfil e análises");
    const perfis = page.locator(".cn-profile[data-act=profile]");
    await expect(perfis).toHaveText(["Mínimo", "Econômico", "Equilibrado", "Completo", "Ultra"]);
    await expect(page.locator(".cn-profile.active")).toHaveText("Equilibrado");
    await page.locator(".cn-profile[data-id=minimal]").click().catch(async () => {
      await perfis.nth(0).click();
    });
    await expect(page.locator(".cn-profile.active")).toHaveText("Mínimo");
    await perfis.nth(4).click();
    await expect(page.locator(".cn-profile.active")).toHaveText("Ultra");
    await expect(conteudo(page)).toContainText("Comparar os capítulos com o objetivo do livro");
    // Mexer numa opção à mão leva ao perfil Personalizado
    await page.locator("label.cn-switch-row:has(input[data-opt=verify]) .slider").click();
    await expect(page.locator(".cn-profile.custom")).toHaveClass(/active/);
    // "Modo apenas conversa" bloqueia as demais opções
    await page.locator("label.cn-switch-row:has(input[data-opt=chatOnly]) .slider").click();
    await expect(page.locator("input[data-opt=verify]")).toBeDisabled();
    await page.locator("label.cn-switch-row:has(input[data-opt=chatOnly]) .slider").click();
    await expect(page.locator("input[data-opt=verify]")).toBeEnabled();
    // Volta ao padrão
    await perfis.nth(2).click();
    await expect(page.locator(".cn-profile.active")).toHaveText("Equilibrado");
    await closeCentral(page);
  });
});

test.describe("Central do Sistema", () => {
  test("nove abas, versão instalada e idioma do app", async () => {
    const { page } = app;
    await openCentral(page, "system");
    await expect(page.locator("#central-title")).toContainText("Sistema");
    await expect(page.locator("#central-tabs button")).toHaveCount(9);
    await expect(conteudo(page)).toContainText("Idioma da interface");
    await centralTab(page, "Atualização");
    await expect(conteudo(page)).toContainText("versão instalada");
    await expect(conteudo(page)).toContainText("Verificar agora");
  });

  test("Aparência: Modo escuro e temas de cores prontos", async () => {
    const { page } = app;
    await centralTab(page, "Aparência");
    for (const tema of ["Netuno", "Terra", "Saturno", "Vênus", "Pulsar"]) await expect(conteudo(page)).toContainText(tema);
  });

  test("Acessibilidade, Editor, Templates e Backup abrem com o conteúdo esperado", async () => {
    const { page } = app;
    await centralTab(page, "Acessibilidade");
    await expect(conteudo(page)).toContainText("Tamanho da fonte do app");
    await centralTab(page, "Editor");
    await expect(conteudo(page)).toContainText("Pré-visualização ao vivo");
    await centralTab(page, "Templates");
    await expect(conteudo(page)).toContainText("Perfis de template");
    await expect(conteudo(page)).toContainText(/Assistente/);
    await centralTab(page, "Backup");
    await expect(conteudo(page)).toContainText("Pasta de backup");
  });

  test("Produtividade: o cronômetro vem desligado; ligar mostra a barra e conta; pausar, retomar e zerar", async () => {
    const { page } = app;
    await forceFocus(page);
    await centralTab(page, "Produtividade");
    await expect(page.locator("#productivity-bar")).toBeHidden();
    await configSwitch(page, "productivity.enabled").click();
    await expect(page.locator("#productivity-bar")).toBeVisible();
    await closeCentral(page);
    // Ao ligar, o relógio já conta (com a janela em foco)
    await expect(page.locator("#prod-status")).toHaveText(/contando/i);
    await expect(page.locator("#prod-time")).not.toHaveText("00:00:00", { timeout: 6000 });
    // Pausar congela o tempo
    await page.locator("#prod-toggle").click();
    await expect(page.locator("#prod-status")).toHaveText(/pausado/i);
    const parado = await page.locator("#prod-time").innerText();
    await page.waitForTimeout(1500);
    await expect(page.locator("#prod-time")).toHaveText(parado);
    // Retomar
    await page.locator("#prod-toggle").click();
    await expect(page.locator("#prod-status")).toHaveText(/contando/i);
    await expect(page.locator("#prod-time")).not.toHaveText(parado, { timeout: 6000 });
    // Zerar: volta a 00:00:00 e espera o play
    await page.locator("#prod-reset").click();
    await expect(page.locator("#prod-time")).toHaveText("00:00:00");
    await expect(page.locator("#prod-status")).toHaveText(/pausado/i);
  });

  test("Produtividade: meta de tempo faz a contagem ser regressiva", async () => {
    const { page } = app;
    await openCentral(page, "system");
    await centralTab(page, "Produtividade");
    const meta = page.locator('input[data-id="productivity.goalMinutes"]');
    await meta.fill("5");
    await closeCentral(page);
    await expect(page.locator("#prod-time")).toHaveText(/00:05:00|00:04:5\d/);
  });

  test("Produtividade: desligar o cronômetro esconde a barra", async () => {
    const { page } = app;
    await openCentral(page, "system");
    await centralTab(page, "Produtividade");
    await configSwitch(page, "productivity.enabled").click();
    await expect(page.locator("#productivity-bar")).toBeHidden();
    await closeCentral(page);
  });

  test("o nome da central é um menu que leva a outra central", async () => {
    const { page } = app;
    await openCentral(page, "system");
    await page.locator("#central-title-btn").click();
    await expect(page.locator("#central-switcher")).toBeVisible();
    await page.locator("#central-switcher").getByText("Central de IA").click();
    await expect(page.locator("#central-title")).toContainText("IA");
    await closeCentral(page);
  });
});
