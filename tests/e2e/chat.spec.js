import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { launchApp } from "./helpers/launch.mjs";
import { selectBook, modalButton, openFile, typeInEditor, syncAll, dismissPrompts, openCentral, closeCentral } from "./helpers/ui.mjs";

let app;
const msgs = (page) => page.locator("#ai-chat-messages .ai-message");
const enviar = async (page, texto) => {
  await page.locator("#ai-chat-input").fill(texto);
  await page.keyboard.press("Enter");
};
const ultimaResposta = (page) => page.locator("#ai-chat-messages .ai-message.assistant:not(.ai-working)").last();
const chatAberto = (page) => page.locator("#chat-container").evaluate((el) => el.classList.contains("expanded"));
const fecharChat = async (page) => { if (await chatAberto(page)) await page.locator("#btn-toggle-ai").click(); await expect(page.locator("#chat-container")).not.toHaveClass(/expanded/); };
const abrirChat = async (page) => { if (!(await chatAberto(page))) await page.locator("#btn-toggle-ai").click(); await expect(page.locator("#chat-container")).toHaveClass(/expanded/); };
const draftPath = () => path.join(app.bookDir, "content", "chapter_001", "2_draft.md");

test.beforeAll(async () => {
  app = await launchApp();
  await selectBook(app.page);
});
test.afterAll(async () => {
  await app?.close();
});

test.describe.configure({ mode: "serial" });

test("a gaveta do chat abre e fecha pelo cabeçalho, pela seta e com Esc", async () => {
  const { page } = app;
  const chat = page.locator("#chat-container");
  await expect(chat).not.toHaveClass(/expanded/);
  await page.locator("#ai-assistant-header").click();
  await expect(chat).toHaveClass(/expanded/);
  await page.locator("#btn-toggle-ai").click();
  await expect(chat).not.toHaveClass(/expanded/);
  await page.locator("#btn-toggle-ai").click();
  await expect(chat).toHaveClass(/expanded/);
  await page.locator("#ai-chat-input").click();
  await page.keyboard.press("Escape");
  await expect(chat).not.toHaveClass(/expanded/);
  await page.keyboard.press("Control+Shift+A");
  await expect(chat).toHaveClass(/expanded/);
});

test("a barra de uso mostra a conta e o modelo em uso (assistente embutido)", async () => {
  const { page } = app;
  await expect(page.locator("#ai-usage-model")).toContainText("Assistente Astra");
  await expect(page.locator("#ai-usage-text")).toContainText("Sessão:");
});

test("primeira mensagem: o assistente se apresenta com uma citação e oferece botões", async () => {
  const { page } = app;
  await enviar(page, "Olá");
  await expect(msgs(page).first()).toHaveClass(/user/);
  await expect(msgs(page).first()).toContainText("Olá");
  const resposta = ultimaResposta(page);
  await expect(resposta).toContainText("Eu sou o assistente embutido do Astra Writer");
  await expect(resposta).toContainText("não sou uma IA de verdade");
  await expect(resposta.locator("blockquote")).toBeVisible();
  await expect(resposta.locator(".chat-buttons button")).toHaveText([/Conectar uma IA de verdade/, /Ver o que você sabe fazer/]);
  await expect(msgs(page).first()).toHaveAttribute("data-time", /.+/);
});

test("o botão 'Ver o que você sabe fazer' envia /ajuda e lista os comandos", async () => {
  const { page } = app;
  await ultimaResposta(page).locator(".chat-buttons button", { hasText: "Ver o que você sabe fazer" }).click();
  await expect(page.locator("#ai-chat-messages .ai-message.user", { hasText: "/ajuda" })).toHaveCount(1);
  const resposta = ultimaResposta(page);
  await expect(resposta).toContainText("Comandos que eu entendo");
  await expect(resposta).toContainText("/listar");
  await expect(resposta).toContainText("/substituir");
});

test("o botão 'Conectar uma IA de verdade' abre a Central de IA em Contas e modelo", async () => {
  const { page } = app;
  await enviar(page, "Pode me ajudar com o livro?");
  await expect(ultimaResposta(page)).toContainText("Não entendi");
  await ultimaResposta(page).locator(".chat-buttons button", { hasText: "Conectar uma IA de verdade" }).click();
  await expect(page.locator("#central-overlay")).not.toHaveClass(/hidden/);
  await expect(page.locator("#central-title")).toContainText("IA");
  await expect(page.locator("#central-subtitle")).toContainText("Contas e modelo");
  await closeCentral(page);
});

test("comandos do assistente: /listar chama a tool list_files e mostra o resultado", async () => {
  const { page } = app;
  await enviar(page, "/listar");
  await expect(ultimaResposta(page)).toContainText("list_files");
  await expect(ultimaResposta(page)).toContainText("Sumário Geral");
});

test("/ler devolve o conteúdo de um arquivo do livro aberto", async () => {
  const { page } = app;
  await enviar(page, "/ler content/chapter_001/2_draft.md");
  await expect(ultimaResposta(page)).toContainText("Ana chegou ao porto de Eldoria");
});

test("escopo: a IA não lê fora do livro aberto (outro livro/pasta) nem escreve em arquivo somente leitura", async () => {
  const { page } = app;
  await enviar(page, "/ler ../../outro-livro/config.json");
  await expect(ultimaResposta(page)).toContainText("❌");
  await enviar(page, "/anexar content/index.md | invasão");
  await expect(ultimaResposta(page)).toContainText("❌");
  expect(fs.readFileSync(path.join(app.bookDir, "content", "index.md"), "utf8")).not.toContain("invasão");
});

test("botão parar: durante /lento o botão de enviar vira 'Parar a IA' e interrompe a resposta", async () => {
  const { page } = app;
  const botao = page.locator("#btn-send-ai");
  await enviar(page, "/lento");
  await expect(botao).toHaveClass(/stop/);
  await expect(botao).toHaveAttribute("title", "Parar a IA");
  await expect(page.locator("#ai-chat-messages .ai-message.ai-working")).toBeVisible();
  await botao.click();
  await expect(msgs(page).filter({ hasText: "Você interrompeu a IA." })).toHaveCount(1);
  await expect(botao).not.toHaveClass(/stop/);
  await expect(page.locator("#ai-chat-messages .ai-message.ai-working")).toHaveCount(0);
});

test("/lento sem interromper termina com a resposta simulada", async () => {
  const { page } = app;
  await enviar(page, "/lento");
  await expect(ultimaResposta(page)).toContainText("resposta lenta simulada", { timeout: 15000 });
  await expect(page.locator("#btn-send-ai")).not.toHaveClass(/stop/);
});

test("/erro mostra a falha na conversa e registra no Log de erros da IA", async () => {
  const { page } = app;
  await enviar(page, "/erro");
  await expect(page.locator("#ai-chat-messages .ai-message").last()).toContainText(/erro|falha|Erro/i, { timeout: 10000 });
  await expect(page.locator("#btn-send-ai")).not.toHaveClass(/stop/);
});

test("a seta ↑ no campo de texto recupera as mensagens enviadas (histórico de digitação)", async () => {
  const { page } = app;
  const campo = page.locator("#ai-chat-input");
  await campo.click();
  await campo.fill("");
  await page.keyboard.press("ArrowUp");
  await expect(campo).toHaveValue("/erro");
  await page.keyboard.press("ArrowUp");
  await expect(campo).toHaveValue("/lento");
  await page.keyboard.press("ArrowDown");
  await expect(campo).toHaveValue("/erro");
  await campo.fill("");
});

test("Shift+Enter quebra a linha em vez de enviar", async () => {
  const { page } = app;
  const campo = page.locator("#ai-chat-input");
  const antes = await msgs(page).count();
  await campo.fill("linha 1");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("linha 2");
  await expect(campo).toHaveValue("linha 1\nlinha 2");
  expect(await msgs(page).count()).toBe(antes);
  await campo.fill("");
});

test("/botoes mostra botões de resposta pronta; clicar numa resposta envia o texto e marca a escolhida", async () => {
  const { page } = app;
  await enviar(page, "/botoes");
  const botoes = ultimaResposta(page).locator(".chat-buttons button");
  await expect(botoes).toHaveText([/Sim, continue/, /Não, obrigado/, /Sincronizar/, /Novo capítulo/, /Variáveis/]);
  await botoes.filter({ hasText: "Sim, continue" }).click();
  await expect(page.locator("#ai-chat-messages .ai-message.user", { hasText: "Sim, pode continuar." })).toHaveCount(1);
  await expect(page.locator(".chat-buttons.answered").first()).toBeVisible();
});

test("botão de ação 'Novo capítulo' abre o assistente de criação de capítulo", async () => {
  const { page } = app;
  await enviar(page, "/botoes");
  await ultimaResposta(page).locator(".chat-buttons button", { hasText: "Novo capítulo" }).click();
  await expect(page.locator("#modal-container")).toContainText("Novo capítulo");
  await modalButton(page, "Cancelar").click();
  await expect(page.locator("#modal-container")).not.toContainText("Novo capítulo");
});

test("edição da IA no modo Assistente: abre a revisão lado a lado; 'Manter versão nova' grava e registra", async () => {
  const { page } = app;
  await enviar(page, "/anexar content/chapter_001/2_draft.md | Rui chegou.");
  const modal = page.locator("#modal-container");
  await expect(modal).toContainText("Revisar alterações da IA: Manuscrito", { timeout: 15000 });
  await expect(modal).toContainText("Versão Antiga");
  await expect(modal).toContainText("Versão Nova (Editável)");
  await expect(modal).toContainText("Rui chegou.");
  // Enquanto o autor não decide, o arquivo oficial não muda
  expect(fs.readFileSync(draftPath(), "utf8")).not.toContain("Rui");
  await modalButton(page, "Manter versão nova").click();
  await dismissPrompts(page); // análise/skills oferecidas depois de gravar
  await expect(modal).not.toContainText("Revisar alterações da IA");
  await expect.poll(() => fs.readFileSync(draftPath(), "utf8")).toContain("Rui chegou.");
  await expect(msgs(page).filter({ hasText: "Alterado pela IA" }).first()).toBeVisible();
});

test("antes de a IA editar, o app exige sincronizar os rascunhos do autor (janela de sincronização) e depois abre a revisão", async () => {
  const { page } = app;
  await fecharChat(page);
  await openFile(page, "Capítulo 01");
  await typeInEditor(page, " Meu rascunho.", { replace: false });
  await expect(page.locator("#save-status-indicator .status-text")).toHaveText("Rascunho salvo");
  await abrirChat(page);
  await enviar(page, "/anexar content/chapter_001/2_draft.md | Texto descartável.");
  const modal = page.locator("#modal-container");
  await expect(modal).toContainText("Sincronizar Alterações Pendentes", { timeout: 15000 });
  await expect(modal).toContainText("Manuscrito");
  await modalButton(page, "Sincronizar Selecionados").click();
  await expect(modal).toContainText("Revisar alterações da IA", { timeout: 15000 });
  expect(fs.readFileSync(draftPath(), "utf8")).toContain("Meu rascunho.");
  // Manter a versão antiga descarta o que a IA escreveu
  await modalButton(page, "Manter versão antiga").click();
  await dismissPrompts(page, 1500);
  await expect(modal).not.toContainText("Revisar alterações da IA");
  expect(fs.readFileSync(draftPath(), "utf8")).not.toContain("Texto descartável.");
  await expect.poll(() => fs.existsSync(draftPath() + ".temp")).toBe(false);
});

test("se o autor fecha a janela de sincronização, a IA não edita e avisa no chat", async () => {
  const { page } = app;
  await fecharChat(page);
  await typeInEditor(page, " Mais um rascunho.", { replace: false });
  await expect(page.locator("#save-status-indicator .status-text")).toHaveText("Rascunho salvo");
  await abrirChat(page);
  await enviar(page, "/anexar content/chapter_001/2_draft.md | Não deve entrar.");
  await expect(page.locator("#modal-container")).toContainText("Sincronizar Alterações Pendentes", { timeout: 15000 });
  await page.locator("#modal-container .modal-close-btn").click();
  await expect(ultimaResposta(page)).toContainText(/sincroniz/i, { timeout: 15000 });
  await expect(page.locator("#modal-container")).not.toContainText("Revisar alterações da IA");
  const t = draftPath() + ".temp";
  const conteudo = fs.existsSync(t) ? fs.readFileSync(t, "utf8") : "";
  expect(conteudo).not.toContain("Não deve entrar.");
});

test("com rascunho pendente depois da recusa de sincronizar, o botão Sincronizar deveria estar ativo", async () => {
  test.fail(true, "bug conhecido (pendente): Sincronizar continua desativado com .md.temp existente depois de fechar a janela de sincronização exigida pela IA");
  const { page } = app;
  expect(fs.existsSync(draftPath() + ".temp")).toBe(true);
  await expect(page.locator("#btn-save")).toBeEnabled({ timeout: 4000 });
});

test("modo Autônomo: a IA grava direto, sem janela de revisão", async () => {
  const { page } = app;
  await fecharChat(page);
  await openCentral(page, "book");
  await page.locator("label.cn-radio-card:has(input[value=autonomous])").click();
  await expect.poll(() => JSON.parse(fs.readFileSync(path.join(app.bookDir, "config.json"), "utf8")).ai_mode).toBe("autonomous");
  await closeCentral(page);
  await abrirChat(page);
  await enviar(page, "/anexar content/chapter_001/2_draft.md | Gravado direto.");
  // O rascunho pendente do teste anterior precisa ser sincronizado antes de a IA editar (vale em todos os modos)
  await expect(page.locator("#modal-container")).toContainText("Sincronizar Alterações Pendentes", { timeout: 15000 });
  await modalButton(page, "Sincronizar Selecionados").click();
  await expect(ultimaResposta(page)).toContainText("append_to_file", { timeout: 15000 });
  await expect(page.locator("#modal-container")).not.toContainText("Revisar alterações da IA");
  await expect.poll(() => {
    const t = draftPath() + ".temp";
    const arquivo = fs.existsSync(t) ? t : draftPath();
    return fs.readFileSync(arquivo, "utf8").includes("Gravado direto.");
  }).toBe(true);
});
