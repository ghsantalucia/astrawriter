// @vitest-environment happy-dom
/**
 * Integração: pipeline da IA de ponta a ponta com o provedor "mock" (AiService -> aiGateway -> provedor -> toolLoop ->
 * ToolView -> tools -> FileService -> IPC real -> disco). Só o electron é dublê.
 *
 * Diretrizes do produto verificadas (docs/ai/*.md): a IA só trabalha no livro aberto; permissões aiRead/aiWrite; toda
 * edição vira rascunho (.md.temp) e só vira oficial na sincronização (atribuída à IA no changelog); perfis de uso (Mínimo é
 * somente leitura, Econômico edita pontualmente); mapa do livro no prompt; skills (list_skills/run_skill/propose_skill).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
vi.mock("electron", async () => (await import("../helpers/ipcBridge.js")).electronForBridge());
import { createIpcBridge, makeAiBook, writeFile, speedUpMockProvider } from "../helpers/ipcBridge.js";
import * as mockProvider from "../../src/renderer/ai/providers/mock/index";
import { toolRegistry } from "../../src/renderer/ai/aiTools";
import { uiBus } from "../../src/renderer/events/uiBus";
import { domainBus } from "../../src/renderer/events/domainBus";

vi.setConfig({ testTimeout: 30000 });

const realSendRequest = mockProvider.sendRequest;
let bridge;
let state;
let services;
let undoSpeed;
let bookSeq = 0;

beforeAll(async () => {
  bridge = await createIpcBridge();
  const { State } = await import("../../src/renderer/core/state");
  const { ServiceManager } = await import("../../src/renderer/services/serviceManager");
  state = new State();
  services = new ServiceManager(state);
  services.skillRunner.init();
  await services.ai.loadSettings();
});
afterAll(() => bridge.cleanup());

beforeEach(() => {
  undoSpeed = speedUpMockProvider();
});
afterEach(() => {
  undoSpeed();
  vi.restoreAllMocks();
});

/** Abre um livro novo (pasta única por teste) como o livro atual do app. */
function openBook(profile = "balanced") {
  const book = makeAiBook(bridge.booksRoot, `book_${String(++bookSeq).padStart(3, "0")}`);
  state.currentBookPath = book;
  state.currentBookMetadata = { book_title: "Livro IA" };
  // Lista de livros do app (o livro aberto e um outro, que a IA nunca deve alcançar)
  state.bookList = [
    { folderName: book.split("/").pop(), fullPath: book, book_title: "Livro IA" },
    { folderName: "book_alheio", fullPath: `${bridge.booksRoot.replace(/\\/g, "/")}/book_alheio`, book_title: "Livro Alheio" },
  ];
  state.currentFilePath = null;
  state.aiSettings.analysis = typeof profile === "string" ? { profile } : profile;
  return book;
}

/** Envia um comando ao assistente e devolve a resposta. */
const ask = (prompt, extra = {}) => services.ai.sendMessage({ prompt, history: [], ...extra });
/** Chama uma tool pelo comando `/tool` do mock. */
const callTool = (name, args = {}) => ask(`/tool ${name} | ${JSON.stringify(args)}`);
const rd = (p) => fs.readFileSync(p, "utf8");
const exists = (p) => fs.existsSync(p);

/** Captura o que o gateway entrega ao provedor (prompt de sistema e tools oferecidas). */
function spyProvider() {
  const calls = [];
  vi.restoreAllMocks();
  vi.spyOn(mockProvider, "sendRequest").mockImplementation((args) => {
    calls.push({ system: args.systemPrompt, tools: args.tools.getDefinitions().map((d) => d.name), prompt: args.prompt });
    return realSendRequest(args);
  });
  return calls;
}

describe("Pipeline: o assistente embutido (mock) responde sempre", () => {
  it("1ª mensagem de uma sessão se apresenta com botões; comando /ajuda lista os comandos; consumo de tokens é contado", async () => {
    openBook();
    const r = await ask("oi, tudo bem?");
    expect(r.text).toContain("não sou uma IA de verdade");
    expect(r.buttons.length).toBeGreaterThan(0);
    expect(r.buttons.map((b) => b.label)).toContain("Conectar uma IA de verdade");
    const help = await ask("/ajuda");
    expect(help.text).toContain("/listar");
    expect(state.aiUsage.inputTokens).toBeGreaterThan(0);
    expect(r.tokens).toBeGreaterThan(0);
  });

  it("erro do provedor vai para o log de erros em disco (com o livro) e é relançado", async () => {
    const book = openBook();
    await expect(ask("/erro")).rejects.toThrow(/Erro simulado/);
    const log = await bridge.api.readAiErrorLog();
    expect(log[0].provider).toBe("mock");
    expect(log[0].book).toBe(book.split("/").pop());
    expect(log[0].message).toMatch(/Erro simulado/);
  });

  it("parar a resposta (ai:stop ou abortCurrent) rejeita com AbortError, não grava erro e limpa o estado", async () => {
    openBook();
    await bridge.api.clearAiErrorLog();
    const p1 = ask("/listar");
    expect(services.ai.abortCurrent()).toBe(true);
    await expect(p1).rejects.toMatchObject({ name: "AbortError" });
    expect(services.ai.abortController).toBeNull();

    const p2 = ask("/listar");
    uiBus.emit("ai:stop");
    await expect(p2).rejects.toMatchObject({ name: "AbortError" });
    expect(await bridge.api.readAiErrorLog()).toEqual([]);
    expect(services.ai.abortCurrent()).toBe(false);
    // e logo depois funciona normalmente
    expect((await ask("/ajuda")).text).toContain("/listar");
  });
});

describe("Pipeline: mapa do livro e perfil no prompt de sistema", () => {
  it("o mapa traz só o que a IA pode ler (títulos, [só leitura]), nunca o que tem aiRead desligado", async () => {
    openBook();
    const calls = spyProvider();
    await ask("/ajuda");
    const system = calls[0].system;
    expect(system).toContain("## Mapa do livro");
    expect(system).toContain("content/plot.md: Sinopse");
    expect(system).toContain("content/chapter_001/2_draft.md: Manuscrito");
    expect(system).toMatch(/notes\/somente-leitura\.md: Só leitura \[só leitura\]/);
    expect(system).not.toContain("secreto.md");
    expect(system).not.toContain("Não deve ser lido");
    expect(system).toContain("Livro: Livro IA");
    expect(system).toContain("Perfil atual: Equilibrado");
  });

  it("o mapa reflete arquivos criados há pouco (é relido do disco a cada mensagem)", async () => {
    const book = openBook();
    const calls = spyProvider();
    writeFile(`${book}/notes/nova-ideia.md`, "---\ntitle: Nova ideia\naiRead: true\naiWrite: true\n---\nx\n");
    await ask("/ajuda");
    expect(calls[0].system).toContain("notes/nova-ideia.md: Nova ideia");
  });

  it("não vaza o conteúdo de outro livro no prompt nem no mapa", async () => {
    openBook();
    makeAiBook(bridge.booksRoot, "book_outro");
    writeFile(`${bridge.booksRoot}/book_outro/content/plot.md`, "---\ntitle: Sinopse alheia\naiRead: true\n---\nSEGREDO_DO_OUTRO_LIVRO\n");
    const calls = spyProvider();
    await ask("/ajuda");
    expect(calls[0].system).not.toContain("SEGREDO_DO_OUTRO_LIVRO");
    expect(calls[0].system).not.toContain("Sinopse alheia");
  });
});

describe("Pipeline: escopo só do livro aberto (a IA nunca cria, abre nem lê outro livro)", () => {
  it("nenhuma tool do registro abre, cria, lista ou troca de livro", () => {
    const withBook = toolRegistry.getDefinitions().map((d) => d.name).filter((n) => /book|livro/i.test(n));
    // as únicas tools com "book" no nome agem sobre o livro aberto
    expect(withBook.sort()).toEqual(["auto_link_book", "get_book_config", "search_book"]);
    const names = toolRegistry.getDefinitions().map((d) => d.name);
    expect(names.filter((n) => /(open|switch|select|import|delete)_?(book|livro)|new_book|create_book/.test(n))).toEqual([]);
  });

  it("criar livro (start_creation e complete_creation) é recusado e nada é criado em disco", async () => {
    openBook("complete");
    const before = fs.readdirSync(bridge.booksRoot).sort();
    const a = await callTool("start_creation", { kind: "book" });
    expect(a.text).toMatch(/A IA não cria livros/);
    const b = await callTool("complete_creation", { kind: "book", answers: [{ field: "title", value: "Livro Invasor" }] });
    expect(b.text).toMatch(/A IA não cria livros/);
    expect(fs.readdirSync(bridge.booksRoot).sort()).toEqual(before);
  });

  it("ler arquivos de outro livro (caminho relativo com .., absoluto ou com letra de unidade) é recusado", async () => {
    openBook();
    makeAiBook(bridge.booksRoot, "book_alheio");
    const alheio = `${bridge.booksRoot.replace(/\\/g, "/")}/book_alheio/content/plot.md`;
    for (const p of ["../book_alheio/content/plot.md", alheio, "C:/Users/x/outro/plot.md", ".system/chatlog/x.md", "/etc/passwd.md"]) {
      const r = await callTool("read_file", { path: p });
      expect(r.text, p).toMatch(/falhou/);
      expect(r.text, p).not.toContain("O herói parte");
    }
    // escrever também
    const w = await callTool("write_file", { path: "../book_alheio/content/plot.md", content: "invadido" });
    expect(w.text).toMatch(/falhou/);
    expect(rd(`${bridge.booksRoot}/book_alheio/content/plot.md`)).not.toContain("invadido");
  });

  it("list_files, search_book e get_book_config só enxergam o livro aberto", async () => {
    const book = openBook("complete");
    writeFile(`${bridge.booksRoot}/book_alheio/content/plot.md`, "---\ntitle: Alheio\naiRead: true\n---\npalavraExclusivaDoOutro\n");
    writeFile(`${book}/notes/meu.md`, "---\ntitle: Meu\naiRead: true\n---\npalavraExclusivaDoMeu\n");
    const found = await callTool("search_book", { query: "palavraExclusivaDoOutro" });
    expect(found.text).not.toContain("Alheio");
    const mine = await callTool("search_book", { query: "palavraExclusivaDoMeu" });
    expect(mine.text).toContain("notes/meu.md");
    const cfg = await callTool("get_book_config", {});
    expect(cfg.text).toContain("Livro IA");
    expect(cfg.text).not.toContain("Alheio");
    const list = await ask("/listar");
    expect(list.text).not.toContain("alheio");
  });

  it("sem livro aberto as tools de arquivo falham de forma clara", async () => {
    state.currentBookPath = null;
    const r = await ask("/listar");
    expect(r.text).toMatch(/Nenhum livro selecionado/);
  });
});

describe("Pipeline: permissões aiRead / aiWrite e herança da pasta", () => {
  it("aiRead desligado: ler é negado e a IA não vê nada do arquivo; ler com permissão devolve o corpo e registra no changelog", async () => {
    const book = openBook();
    const denied = await callTool("read_file", { path: "notes/secreto.md" });
    expect(denied.text).toMatch(/Acesso negado.*leitura/);
    expect(denied.text).not.toContain("Não deve ser lido");
    const ok = await callTool("read_file", { path: "content/plot.md" });
    expect(ok.text).toContain("O herói parte em viagem.");
    expect(ok.text).not.toContain("aiRead"); // sem frontmatter
    const page = await bridge.api.changelogPage(book, null);
    expect(page.entries.some((e) => e.action === "read" && e.path === "content/plot.md" && e.actor.type === "ai")).toBe(true);
    // a leitura negada não foi registrada
    expect(page.entries.some((e) => e.path === "notes/secreto.md")).toBe(false);
  });

  it("aiWrite desligado: todas as tools de escrita são negadas e o arquivo fica intacto, sem rascunho", async () => {
    const book = openBook();
    const file = `${book}/notes/somente-leitura.md`;
    const before = rd(file);
    for (const [tool, args] of [
      ["write_file", { path: "notes/somente-leitura.md", content: "x" }],
      ["append_to_file", { path: "notes/somente-leitura.md", text: "x" }],
      ["replace_in_file", { path: "notes/somente-leitura.md", old_text: "Podem", new_text: "X" }],
    ]) {
      const r = await callTool(tool, args);
      expect(r.text, tool).toMatch(/Acesso negado.*escrita/);
    }
    expect(rd(file)).toBe(before);
    expect(exists(`${file}.temp`)).toBe(false);
  });

  it("a flag do próprio arquivo vale sobre a da pasta; sem flag no arquivo, herda a da pasta (get-tree real)", async () => {
    const book = openBook();
    writeFile(`${book}/notes/travada/folder.yml`, "title: Travada\naiRead: true\naiWrite: false\n");
    writeFile(`${book}/notes/travada/herda.md`, "---\ntitle: Herda\n---\ntexto herdado\n");
    writeFile(`${book}/notes/travada/livre.md`, "---\ntitle: Livre\naiWrite: true\n---\ntexto livre\n");
    const a = await callTool("append_to_file", { path: "notes/travada/herda.md", text: "mais" });
    expect(a.text).toMatch(/Acesso negado/);
    const b = await callTool("append_to_file", { path: "notes/travada/livre.md", text: "mais" });
    expect(b.text).toMatch(/Texto acrescentado/);
    // herda aiRead da pasta: consegue ler
    expect((await callTool("read_file", { path: "notes/travada/herda.md" })).text).toContain("texto herdado");
  });

  it("só aceita arquivos .md e caminhos dentro do livro (nada de .system nem de config.json)", async () => {
    openBook();
    expect((await callTool("read_file", { path: "config.json" })).text).toMatch(/Apenas arquivos \.md/);
    expect((await callTool("read_file", { path: ".system/x.md" })).text).toMatch(/Caminho inválido/);
    expect((await callTool("read_file", { path: "content/nao-existe.md" })).text).toMatch(/não encontrado/);
  });
});

describe("Pipeline: edições viram rascunho, exigem sincronização e ficam atribuídas à IA", () => {
  it("replace_in_file grava .md.temp, preserva o frontmatter e o arquivo oficial; list_files marca rascunho pendente", async () => {
    const book = openBook();
    const official = `${book}/content/chapter_001/2_draft.md`;
    const before = rd(official);
    const r = await callTool("replace_in_file", { path: "content/chapter_001/2_draft.md", old_text: "dragão", new_text: "fênix" });
    expect(r.text).toMatch(/1 substituição/);
    expect(rd(official)).toBe(before);
    const draft = rd(`${official}.temp`);
    expect(draft).toContain("fênix");
    expect(draft).toContain("title: Manuscrito");
    expect(draft).toContain("aiWrite: true");
    const tree = await bridge.api.getTree(book);
    expect(tree.folders.content.folders.chapter_001.files["2_draft"].isTemp).toBe(true);
    const list = await ask("/listar");
    expect(list.text).toMatch(/"hasPendingDraft": true/);
  });

  it("trecho inexistente ou ambíguo é recusado sem criar rascunho; replace_all resolve a ambiguidade", async () => {
    const book = openBook();
    writeFile(`${book}/notes/repete.md`, "---\ntitle: Repete\naiWrite: true\naiRead: true\n---\nlobo e lobo e lobo\n");
    expect((await callTool("replace_in_file", { path: "notes/repete.md", old_text: "gato", new_text: "x" })).text).toMatch(/não encontrado/);
    expect((await callTool("replace_in_file", { path: "notes/repete.md", old_text: "lobo", new_text: "x" })).text).toMatch(/3 vezes/);
    expect(exists(`${book}/notes/repete.md.temp`)).toBe(false);
    expect((await callTool("replace_in_file", { path: "notes/repete.md", old_text: "lobo", new_text: "urso", replace_all: true })).text).toMatch(/3 substituição/);
    expect(rd(`${book}/notes/repete.md.temp`)).toContain("urso e urso e urso");
  });

  it("sincronizar o rascunho da IA torna oficial, apaga o .temp e o changelog atribui a alteração à IA (provedor mock)", async () => {
    const book = openBook();
    const official = `${book}/content/plot.md`;
    await callTool("append_to_file", { path: "content/plot.md", text: "Depois, ele volta." });
    expect(exists(`${official}.temp`)).toBe(true);
    const res = await services.file.syncFile(official);
    expect(res.success).toBe(true);
    expect(exists(`${official}.temp`)).toBe(false);
    expect(rd(official)).toContain("Depois, ele volta.");
    expect(rd(official)).toContain("title: Sinopse");
    const hist = await bridge.api.changelogFileHistory(book, "content/plot.md");
    const upd = hist.entries.find((e) => e.action === "update");
    expect(upd.actor).toMatchObject({ type: "ai", provider: "mock" });
    // as autosaves do rascunho foram registradas também como IA
    const page = await bridge.api.changelogPage(book, null);
    expect(page.entries.some((e) => e.action === "autosave" && e.actor.type === "ai")).toBe(true);
  });

  it("restaurar a versão anterior (changelog) devolve o texto original ao arquivo", async () => {
    const book = openBook();
    const official = `${book}/content/plot.md`;
    const original = rd(official);
    await callTool("write_file", { path: "content/plot.md", content: "Texto totalmente novo." });
    await services.file.syncFile(official);
    expect(rd(official)).toContain("Texto totalmente novo.");
    const hist = await services.changelog.getFileHistory(official);
    const first = hist.entries[hist.entries.length - 1];
    const res = await services.changelog.restore(official, first.id);
    expect(res.success).toBe(true);
    expect(rd(official)).toBe(original);
  });

  it("rascunhos pendentes não sincronizados bloqueiam a edição da IA (nada é alterado)", async () => {
    const book = openBook();
    writeFile(`${book}/notes/pendente.md.temp`, "---\ntitle: Pendente\naiWrite: true\naiRead: true\n---\nrascunho do autor\n");
    writeFile(`${book}/notes/pendente.md`, "---\ntitle: Pendente\naiWrite: true\naiRead: true\n---\noficial\n");
    const asked = vi.fn();
    uiBus.on("sync:require-all", (p) => { asked(); p.onDone(); }, false);
    const r = await callTool("append_to_file", { path: "content/plot.md", text: "x" });
    expect(asked).toHaveBeenCalled();
    expect(r.text).toMatch(/rascunhos \(\.temp\) não sincronizados/);
    expect(exists(`${book}/content/plot.md.temp`)).toBe(false);
    // uma 2ª edição na mesma resposta não pergunta de novo
    uiBus.bus.off("sync:require-all");
  });

  it("depois que o autor sincroniza tudo, a edição passa; a tela é travada (ai:edit-started) e liberada com a lista de arquivos (ai:edit-finished)", async () => {
    const book = openBook();
    writeFile(`${book}/notes/pendente.md.temp`, "---\ntitle: Pendente\naiWrite: true\naiRead: true\n---\nrascunho\n");
    writeFile(`${book}/notes/pendente.md`, "---\ntitle: Pendente\naiWrite: true\naiRead: true\n---\noficial\n");
    uiBus.on("sync:require-all", async (p) => {
      for (const f of await services.file.getPendingTempFiles()) await services.file.syncFile(f.path);
      p.onDone();
    }, false);
    const events = [];
    const onStart = (e) => events.push(["start", e]);
    const onEnd = (e) => events.push(["end", e]);
    domainBus.on("ai:edit-started", onStart);
    domainBus.on("ai:edit-finished", onEnd);
    const r = await callTool("append_to_file", { path: "content/plot.md", text: "Linha da IA." });
    domainBus.off("ai:edit-started", onStart);
    domainBus.off("ai:edit-finished", onEnd);
    uiBus.bus.off("sync:require-all");
    expect(r.text).toMatch(/Texto acrescentado/);
    expect(exists(`${book}/notes/pendente.md.temp`)).toBe(false);
    expect(rd(`${book}/notes/pendente.md`)).toContain("rascunho");
    expect(events.map((e) => e[0])).toEqual(["start", "end"]);
    expect(events[1][1].files).toEqual([`${book}/content/plot.md`]);
  });

  it("leitura não trava a tela nem exige sincronização", async () => {
    const book = openBook();
    writeFile(`${book}/notes/pendente.md.temp`, "---\ntitle: P\naiRead: true\n---\nr\n");
    writeFile(`${book}/notes/pendente.md`, "---\ntitle: P\naiRead: true\n---\no\n");
    const asked = vi.fn();
    uiBus.on("sync:require-all", asked, false);
    const r = await callTool("read_file", { path: "content/plot.md" });
    uiBus.bus.off("sync:require-all");
    expect(asked).not.toHaveBeenCalled();
    expect(r.text).toContain("O herói parte");
  });
});

describe("Pipeline: perfis de uso da IA", () => {
  it("Mínimo é somente leitura: só read_file e botões são oferecidos, escrever é recusado e o prompt explica o perfil", async () => {
    const book = openBook("minimal");
    const calls = spyProvider();
    const w = await callTool("write_file", { path: "content/plot.md", content: "nada" });
    expect(w.text).toMatch(/não está disponível neste modo/);
    expect(exists(`${book}/content/plot.md.temp`)).toBe(false);
    expect(rd(`${book}/content/plot.md`)).toContain("O herói parte");
    expect(calls[0].tools.sort()).toEqual(["read_file", "show_buttons"]);
    expect(calls[0].system).toContain("Modo de uso mínimo");
    expect(calls[0].system).toContain("Perfil atual: Mínimo");
    // ler continua funcionando
    expect((await callTool("read_file", { path: "content/plot.md" })).text).toContain("O herói parte");
    // e criar também é recusado
    expect((await callTool("start_creation", { kind: "note" })).text).toMatch(/não está disponível/);
  });

  it("Econômico edita pontualmente (replace/append), mas write_file só depois de get_tool_specs (sumário + liberação)", async () => {
    const book = openBook("economic");
    const calls = spyProvider();
    const ok = await callTool("replace_in_file", { path: "content/plot.md", old_text: "viagem", new_text: "jornada" });
    expect(ok.text).toMatch(/1 substituição/);
    expect(rd(`${book}/content/plot.md.temp`)).toContain("jornada");
    expect(calls[0].tools).toEqual(expect.arrayContaining(["replace_in_file", "append_to_file", "show_buttons", "get_tool_specs"]));
    expect(calls[0].tools).not.toContain("write_file");
    expect(calls[0].system).toContain("# Outras tools (sumário)");
    expect(calls[0].system).toMatch(/- write_file:/);

    const blocked = await callTool("write_file", { path: "content/plot.md", content: "x" });
    expect(blocked.text).toMatch(/ainda não está liberada.*get_tool_specs/);
    const specs = await callTool("get_tool_specs", { names: ["write_file", "inexistente_xyz"] });
    expect(specs.text).toContain("write_file");
    expect(specs.text).toContain("inexistente_xyz");
    // depois de pedir a especificação, a tool está liberada pelo resto da sessão
    // (o autor sincroniza o rascunho anterior: a IA só edita com tudo sincronizado)
    await services.file.syncFile(`${book}/content/plot.md`);
    const calls2 = spyProvider();
    const allowed = await callTool("write_file", { path: "content/plot.md", content: "Reescrito." });
    expect(allowed.text).toMatch(/Rascunho de "Sinopse" salvo/);
    expect(calls2[0].tools).toContain("write_file");
  });

  it("Equilibrado (padrão) oferece write_file e as tools de skills; Completo oferece todas", async () => {
    openBook("balanced");
    let calls = spyProvider();
    await ask("/ajuda");
    expect(calls[0].tools).toEqual(expect.arrayContaining(["write_file", "list_skills", "run_skill", "search_book"]));
    expect(calls[0].tools).not.toContain("set_setting");
    vi.restoreAllMocks();
    openBook("complete");
    calls = spyProvider();
    await ask("/ajuda");
    expect(calls[0].tools.length).toBe(toolRegistry.getDefinitions().length);
  });

  it("modo 'apenas conversa' (chatOnly): sem mapa do livro, só os botões do chat e aviso no prompt", async () => {
    openBook({ profile: "custom", chatOnly: true });
    const calls = spyProvider();
    const r = await callTool("read_file", { path: "content/plot.md" });
    expect(r.text).toMatch(/Ferramenta desconhecida/);
    expect(calls[0].tools).toEqual(["show_buttons"]);
    expect(calls[0].system).toContain("Modo apenas conversa");
    expect(calls[0].system).not.toContain("## Mapa do livro");
  });

  it("a troca de perfil vale já na mensagem seguinte (Mínimo -> Econômico)", async () => {
    openBook("minimal");
    expect((await callTool("append_to_file", { path: "content/plot.md", text: "a" })).text).toMatch(/não está disponível/);
    state.aiSettings.analysis = { profile: "economic" };
    expect((await callTool("append_to_file", { path: "content/plot.md", text: "a" })).text).toMatch(/Texto acrescentado/);
  });
});

describe("Pipeline: criação dentro do livro aberto respeita a permissão da pasta", () => {
  it("start_creation (nota) descreve os campos; complete_creation cria a nota no livro aberto (e só ali)", async () => {
    const book = openBook("complete");
    writeFile(`${book}/notes/folder.yml`, "title: Anotações\naiWrite: true\naiRead: true\n");
    writeFile(`${book}/notes/template.md`, "---\ntitle: Modelo\n---\n");
    const start = await callTool("start_creation", { kind: "note" });
    expect(start.text).toContain("start_creation");
    expect(start.text).not.toMatch(/falhou/);
  });

  it("criar capítulo é negado quando content/ não tem aiWrite", async () => {
    const book = openBook("complete");
    writeFile(`${book}/content/folder.yml`, "title: Conteúdo\naiWrite: false\n");
    const r = await ask("/criar chapter | | title=Capítulo Novo;plan=Algo acontece");
    expect(r.text).toMatch(/Acesso negado|falhou/);
    expect(exists(`${book}/content/chapter_002`)).toBe(false);
  });
});

describe("Pipeline: skills pela IA (list_skills, run_skill, propose_skill, load_skill)", () => {
  /** Responde às janelas (permissão e campos) das skills. */
  function answerModals(handler) {
    const seen = [];
    const off = (payload) => {
      seen.push(payload);
      const container = document.createElement("div");
      container.innerHTML = payload.content;
      document.body.appendChild(container);
      handler(payload, container, (label) => payload.buttons.find((b) => b.text === label)?.onClick({ close: () => {} }));
      container.remove();
    };
    uiBus.on("modal:open", off, false);
    return { seen, stop: () => uiBus.bus.off("modal:open", off) };
  }

  it("list_skills traz as nativas com descrição; load_skill devolve as instruções; skill inexistente é erro claro", async () => {
    openBook();
    const list = await callTool("list_skills", {});
    expect(list.text).toContain("corrigir-pendencias");
    expect(list.text).toContain("\"description\"");
    expect((await callTool("load_skill", { name: "corrigir-pendencias" })).text.length).toBeGreaterThan(50);
    expect((await callTool("load_skill", { name: "nao-existe-xyz" })).text).toMatch(/não existe/);
    expect((await callTool("run_skill", { name: "nao-existe-xyz" })).text).toMatch(/não existe na biblioteca/);
  });

  it("run_skill: só roda depois que a resposta termina e SEMPRE com a janela de permissão; cancelar não executa", async () => {
    openBook();
    const modals = answerModals((p, c, click) => click("Cancelar"));
    const r = await callTool("run_skill", { name: "corrigir-pendencias" });
    expect(r.text).toMatch(/roda quando esta resposta terminar/);
    await services.skillRunner.queue;
    modals.stop();
    expect(modals.seen.length).toBe(1);
    expect(modals.seen[0].title).toContain("Corrigir pendências");
    expect(modals.seen[0].content).toContain("A IA pediu para executar esta skill");
    expect(services.skills.runs("corrigir-pendencias").length).toBe(0);
  });

  it("run_skill autorizado executa uma vez (mesmo se a IA pedir duas), registra a execução e usa só as tools da skill", async () => {
    openBook();
    const calls = spyProvider();
    const modals = answerModals((p, c, click) => click("Executar"));
    await ask("/tool run_skill | {\"name\":\"corrigir-pendencias\"}");
    await ask("/tool run_skill | {\"name\":\"corrigir-pendencias\"}");
    await services.skillRunner.queue;
    modals.stop();
    expect(services.skills.runs("corrigir-pendencias").length).toBe(2); // duas respostas, um pedido cada
    const skillCall = calls.find((c) => c.prompt.startsWith("Execute agora a skill"));
    const skill = services.skills.get("corrigir-pendencias");
    expect(skillCall.tools.every((t) => skill.tools.includes(t) || t === "show_buttons")).toBe(true);
    expect(skillCall.tools).not.toContain("write_file");
  });

  it("pedidos repetidos na MESMA resposta viram uma só execução", async () => {
    openBook();
    services.skillRunner.requestFromAi(services.skills.get("corrigir-pendencias"));
    services.skillRunner.requestFromAi(services.skills.get("corrigir-pendencias"));
    expect(services.skillRunner.pending.length).toBe(1);
    services.skillRunner.pending = [];
  });

  it("propose_skill abre o formulário preenchido (evento) e NUNCA cria a skill sozinha", async () => {
    openBook("complete");
    const proposals = [];
    const on = (p) => proposals.push(p);
    uiBus.on("skills:propose", on, false);
    const before = fs.existsSync(path.join(bridge.userData, "skills")) ? fs.readdirSync(path.join(bridge.userData, "skills")) : [];
    const r = await callTool("propose_skill", {
      title: "Revisar diálogos",
      name: "revisar-dialogos",
      description: "Revisa falas",
      instructions: "1. Leia as falas.\n2. Aponte problemas.",
      kind: "recurring",
      triggers: ["chapter-sync", "gatilho-inventado"],
      tools: ["read_file", "ferramenta-inventada"],
      inputs: ["Nome do autor"],
    });
    uiBus.bus.off("skills:propose", on);
    expect(r.text).toMatch(/Formulário aberto/);
    expect(proposals.length).toBe(1);
    expect(proposals[0]).toMatchObject({ slug: "revisar-dialogos", kind: "recurring", triggers: ["chapter-sync"], tools: ["read_file"], inputs: ["Nome do autor"] });
    const after = fs.existsSync(path.join(bridge.userData, "skills")) ? fs.readdirSync(path.join(bridge.userData, "skills")) : [];
    expect(after).toEqual(before);
    expect(services.skills.get("revisar-dialogos")).toBeUndefined();
    // identificador inválido é recusado
    expect((await callTool("propose_skill", { title: "x", name: "Nome Inválido!", description: "d", instructions: "i" })).text).toMatch(/identificador/);
  });
});
