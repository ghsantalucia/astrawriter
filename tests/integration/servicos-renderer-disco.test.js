// @vitest-environment happy-dom
/**
 * Integração: serviços do renderer ligados ao uiBus/domainBus, ao IPC real e ao disco (pasta temporária).
 * Cobre: skillRunnerService, issueService/Central de Revisões ("Corrigir tudo"), creationService.importChapters (com a
 * extração de arquivo), changelog, backup, productivityService (meta e contagem regressiva) e AiService (conta mock padrão,
 * histórico paginado do chat).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
vi.mock("electron", async () => (await import("../helpers/ipcBridge.js")).electronForBridge());
import { createIpcBridge, makeAiBook, writeFile, speedUpMockProvider } from "../helpers/ipcBridge.js";
import { uiBus } from "../../src/renderer/events/uiBus";
import { appSettings } from "../../src/renderer/utils/appSettings";

const require = createRequire(import.meta.url);
vi.setConfig({ testTimeout: 30000 });

let bridge;
let state;
let services;
let undoSpeed;
let bookSeq = 0;

beforeAll(async () => {
  bridge = await createIpcBridge();
  // O motor Hunspell (WASM) é uma borda pesada e demora para iniciar: dublê só dele; as regras do sistema (palavra repetida,
  // link quebrado) rodam de verdade
  window.electronAPI.findMisspelled = async () => [];
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
afterEach(async () => {
  undoSpeed();
  vi.restoreAllMocks();
  // janelas modais e skills de um teste não podem vazar para o seguinte
  uiBus.bus.off("modal:open");
  uiBus.bus.off("toast:show");
  for (const f of [...services.skills.files]) await services.skills.remove(f.slug);
  appSettings.set("skills.stats", {});
  appSettings.set("skills.prefs", {});
});

const rd = (p) => fs.readFileSync(p, "utf8");
const exists = (p) => fs.existsSync(p);

function openBook(profile = "balanced", mode = "assistant") {
  const book = makeAiBook(bridge.booksRoot, `book_${String(++bookSeq).padStart(3, "0")}`);
  state.currentBookPath = book;
  state.currentBookMetadata = { book_title: "Livro IA", ai_mode: mode };
  state.currentFilePath = null;
  state.aiSettings.analysis = { profile };
  appSettings.set("skills.askAlways", false);
  return book;
}

/** Responde às janelas modais do app (clica no botão pedido) e devolve o que foi mostrado. */
function answerModals(handler) {
  const seen = [];
  const listener = (payload) => {
    // só as janelas das skills (o sync também abre a pergunta de análise do livro, que não interessa aqui)
    if (!/^(Executar a skill|Informações para)/.test(payload.title || "")) return;
    seen.push(payload);
    const container = document.createElement("div");
    container.innerHTML = payload.content || "";
    document.body.appendChild(container);
    handler(payload, container, (label) => payload.buttons.find((b) => b.text === label)?.onClick({ close: () => {} }));
    container.remove();
  };
  uiBus.on("modal:open", listener, false);
  return { seen, stop: () => uiBus.bus.off("modal:open", listener) };
}

/** Cria uma skill do usuário (gravada pelo IPC real em userData/skills). */
async function makeSkill(over = {}) {
  const slug = over.slug || `skill-teste-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  await services.skills.save({
    slug,
    title: over.title || "Skill de teste",
    description: "Skill de teste",
    body: over.body || "Faça algo útil.",
    kind: over.kind || "once",
    triggers: over.triggers || [],
    tools: over.tools || ["read_file"],
    inputs: over.inputs || [],
  });
  return services.skills.get(slug);
}

/** Zera os travamentos de tempo do executor de skills entre os testes. */
function resetRunner() {
  services.skillRunner.lastEnd = 0;
  services.skillRunner.recent.clear();
  services.skillRunner.active = null;
}

describe("skillRunnerService: janela de campos, modos e permissão", () => {
  it("skill com campos: a janela mostra um campo por pergunta, não deixa continuar vazio e as respostas vão ao pedido da IA", async () => {
    openBook();
    resetRunner();
    const skill = await makeSkill({ inputs: ["Nome do autor de referência", "Cole uma amostra de escrita"] });
    const send = vi.spyOn(services.ai, "sendMessage");
    const toasts = [];
    uiBus.on("toast:show", (t) => toasts.push(t), false);
    let step = 0;
    const modals = answerModals((payload, c, click) => {
      step++;
      if (payload.title.startsWith("Informações")) {
        const fields = c.querySelectorAll("[data-skill-input]");
        expect(fields.length).toBe(2);
        if (step === 1) {
          // 1ª tentativa: só um campo preenchido -> avisa e mantém a janela
          fields[0].value = "Machado de Assis";
          click("Continuar");
          click("Cancelar"); // o autor desiste depois do aviso
        } else {
          fields[0].value = "Machado de Assis";
          fields[1].value = "Era uma vez um dragão.";
          click("Continuar");
        }
      } else click("Executar");
    });
    // a janela é reaberta pelo autor: aqui simulamos a 1ª tentativa incompleta fechando e pedindo de novo
    const first = await services.skillRunner.request(skill, { manual: true });
    expect(toasts.some((t) => /Preencha todos os campos/.test(t.message))).toBe(true);
    // a 1ª janela ficou sem resposta (continua aberta); o autor cancela
    expect(first).toEqual({ ran: false });
    resetRunner();
    const second = await services.skillRunner.request(skill, { manual: true });
    modals.stop();
    expect(second).toMatchObject({ ran: true, ok: true });
    const prompt = send.mock.calls.find((c) => c[0].prompt.startsWith("Execute agora a skill"))[0].prompt;
    expect(prompt).toContain("# Informações fornecidas pelo autor");
    expect(prompt).toContain("Nome do autor de referência: Machado de Assis");
    expect(prompt).toContain("Cole uma amostra de escrita: Era uma vez um dragão.");
  }, 30000);

  it("cancelar a janela de campos não executa a skill", async () => {
    openBook();
    resetRunner();
    const skill = await makeSkill({ inputs: ["Pergunta"] });
    const send = vi.spyOn(services.ai, "sendMessage");
    const modals = answerModals((p, c, click) => click("Cancelar"));
    const r = await services.skillRunner.request(skill, { manual: true });
    modals.stop();
    expect(r).toEqual({ ran: false });
    expect(send).not.toHaveBeenCalled();
    expect(services.skills.runs(skill.slug).length).toBe(0);
  });

  it("execução manual SEMPRE pede permissão (mostra tools e estimativa) e só roda se autorizada; a execução fica registrada", async () => {
    openBook();
    resetRunner();
    const skill = await makeSkill({ tools: ["read_file", "write_file"] });
    services.skills.setPrefs(skill.slug, { askBefore: false }); // mesmo sem "pedir antes", manual pede
    const modals = answerModals((p, c, click) => click("Executar"));
    const r = await services.skillRunner.request(skill, { manual: true });
    modals.stop();
    expect(modals.seen.length).toBe(1);
    expect(modals.seen[0].content).toContain("<code>write_file</code>");
    expect(modals.seen[0].content).toContain("modificar arquivos do seu livro");
    expect(modals.seen[0].content).toContain("Custo estimado");
    expect(r.ok).toBe(true);
    const runs = services.skills.runs(skill.slug);
    expect(runs.length).toBe(1);
    expect(runs[0]).toMatchObject({ ok: true, trigger: "manual" });
    expect(runs[0].tokens).toBeGreaterThan(0);
    // a 2ª estimativa usa a execução anterior (custo por token do livro)
    const est = services.skills.estimate(skill, 1000);
    expect(est.basis).toBe("suas execuções");
    expect(est.tokens).toBeGreaterThan(0);
  });

  it("negar a permissão não executa nem registra execução", async () => {
    openBook();
    resetRunner();
    const skill = await makeSkill();
    const send = vi.spyOn(services.ai, "sendMessage");
    const modals = answerModals((p, c, click) => click("Cancelar"));
    const r = await services.skillRunner.request(skill, { manual: true });
    modals.stop();
    expect(r.ran).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(services.skills.runs(skill.slug).length).toBe(0);
  });

  it("gatilho: skill recorrente ativa sem 'pedir antes' roda sozinha; com campos, em outro modo do livro ou desativada, não", async () => {
    openBook("balanced", "assistant");
    const auto = await makeSkill({ kind: "recurring", triggers: ["sync"] });
    services.skills.setPrefs(auto.slug, { askBefore: false, enabled: true });
    const withInputs = await makeSkill({ kind: "recurring", triggers: ["sync"], inputs: ["Algo?"] });
    services.skills.setPrefs(withInputs.slug, { askBefore: false, enabled: true });
    const otherMode = await makeSkill({ kind: "recurring", triggers: ["sync"] });
    services.skills.setPrefs(otherMode.slug, { askBefore: false, enabled: true });
    // (a tela de skills não edita "modes"; o campo vem do arquivo da skill)
    await services.skills.writeFile({ ...services.skills.get(otherMode.slug), modes: ["coauthor"] });
    await services.skills.load();
    const off = await makeSkill({ kind: "recurring", triggers: ["sync"] });
    services.skills.setPrefs(off.slug, { askBefore: false, enabled: false });

    resetRunner();
    const modals = answerModals(() => {});
    uiBus.emit("sync:completed", {});
    await vi.waitFor(() => expect(services.skills.runs(auto.slug).length).toBe(1));
    await services.skillRunner.queue;
    modals.stop();
    expect(modals.seen.length).toBe(0); // sem janela: o autor já configurou para rodar sozinha
    expect(services.skills.runs(withInputs.slug).length).toBe(0);
    expect(services.skills.runs(otherMode.slug).length).toBe(0);
    expect(services.skills.runs(off.slug).length).toBe(0);
  });

  it("depois de uma execução há um intervalo sem gatilhos (uma skill não dispara outra) e o mesmo gatilho não repete", async () => {
    openBook();
    resetRunner();
    const skill = await makeSkill({ kind: "recurring", triggers: ["sync"] });
    services.skills.setPrefs(skill.slug, { askBefore: false, enabled: true });
    uiBus.emit("sync:completed", {});
    await vi.waitFor(() => expect(services.skills.runs(skill.slug).length).toBe(1));
    await services.skillRunner.queue;
    // cooldown: o segundo gatilho logo em seguida é ignorado
    uiBus.emit("sync:completed", {});
    await services.skillRunner.queue;
    expect(services.skills.runs(skill.slug).length).toBe(1);
  });

  it("nos perfis Mínimo e Econômico toda skill pede permissão, mesmo a que está configurada para rodar sozinha", async () => {
    openBook("minimal");
    resetRunner();
    expect(services.skills.askAlways()).toEqual({ value: true, forced: true });
    const skill = await makeSkill({ kind: "recurring", triggers: ["sync"] });
    services.skills.setPrefs(skill.slug, { askBefore: false, enabled: true });
    const modals = answerModals((p, c, click) => click("Cancelar"));
    uiBus.emit("sync:completed", {});
    await vi.waitFor(() => expect(modals.seen.length).toBe(1));
    await services.skillRunner.queue;
    modals.stop();
    expect(services.skills.runs(skill.slug).length).toBe(0);
    state.aiSettings.analysis = { profile: "balanced" };
    expect(services.skills.askAlways().forced).toBe(false);
  });

  it("modo 'apenas conversa' impede executar skills (falha registrada, nada é enviado à IA)", async () => {
    openBook();
    resetRunner();
    state.aiSettings.analysis = { profile: "custom", chatOnly: true };
    const skill = await makeSkill();
    const send = vi.spyOn(services.ai, "sendMessage");
    const modals = answerModals((p, c, click) => click("Executar"));
    const r = await services.skillRunner.request(skill, { manual: true });
    modals.stop();
    expect(r).toMatchObject({ ran: true, ok: false });
    expect(send).not.toHaveBeenCalled();
    expect(services.skills.runs(skill.slug)[0].error).toMatch(/apenas conversa/);
  });

  it("gatilho de arquivo: só reexecuta se o arquivo mudou desde a última execução (hash 'inalterado') ou se a Sinopse/diretrizes mudaram", async () => {
    const book = openBook();
    resetRunner();
    const skill = await makeSkill({ kind: "recurring", triggers: ["chapter-sync"] });
    const target = `${book}/content/chapter_001/2_draft.md`;
    const modals = answerModals((p, c, click) => click("Executar"));
    const run1 = await services.skillRunner.request(skill, { trigger: "chapter-sync", payload: { path: target }, manual: true });
    expect(run1.ok).toBe(true);
    // ao terminar a execução com gatilho, o app guarda o hash do arquivo processado
    expect(await services.skillRunner.hasChanged(skill, target)).toBe(false);
    const skipped = await services.skillRunner.request(skill, { trigger: "chapter-sync", payload: { path: target } });
    expect(skipped).toEqual({ ran: false, skipped: true });
    // o arquivo muda -> volta a rodar
    writeFile(target, `${rd(target)}\nMais uma linha.\n`);
    expect(await services.skillRunner.hasChanged(skill, target)).toBe(true);
    await services.skillRunner.markDone(skill, target);
    expect(await services.skillRunner.hasChanged(skill, target)).toBe(false);
    // a Sinopse (diretrizes do livro) muda -> tudo precisa ser visto de novo
    writeFile(`${book}/content/plot.md`, `${rd(`${book}/content/plot.md`)}\nNovo tom.\n`);
    expect(await services.skillRunner.hasChanged(skill, target)).toBe(true);
    modals.stop();
    // o estado fica em .system/skills-state.json do livro
    expect(JSON.parse(rd(`${book}/.system/skills-state.json`))[skill.slug].files["content/chapter_001/2_draft.md"]).toMatch(/^[0-9a-f]{40}$/);
  });

  it("arquivos 'inalterados' chegam marcados no mapa do prompt e em list_files, e a skill é avisada para não relê-los", async () => {
    const book = openBook();
    resetRunner();
    const skill = await makeSkill();
    await services.skillRunner.markMany(skill, ["content/plot.md", "content/chapter_001/2_draft.md"]);
    const unchanged = await services.skillRunner.unchangedFiles(skill);
    expect([...unchanged].sort()).toEqual(["content/chapter_001/2_draft.md", "content/plot.md"]);
    // uma alteração tira o arquivo do conjunto
    writeFile(`${book}/content/plot.md`, "---\ntitle: Sinopse\naiRead: true\naiWrite: true\n---\nTrama mudou.\n");
    // (mudar a Sinopse muda as diretrizes: nada mais é 'inalterado')
    expect((await services.skillRunner.unchangedFiles(skill)).size).toBe(0);

    // em outro arquivo qualquer
    const s2 = await makeSkill();
    await services.skillRunner.markMany(s2, ["content/chapter_001/2_draft.md"]);
    const set = await services.skillRunner.unchangedFiles(s2);
    expect([...set]).toEqual(["content/chapter_001/2_draft.md"]);
    const r = await services.ai.sendMessage({ prompt: "/listar", history: [], unchanged: [...set] });
    expect(r.text).toMatch(/inalterado desde a última execução/);
  });

  it("run_skill pedido pela IA e skill recorrente configurada para rodar sozinha não perguntam de novo", async () => {
    openBook();
    resetRunner();
    const skill = await makeSkill({ kind: "recurring", triggers: ["sync"] });
    services.skills.setPrefs(skill.slug, { askBefore: false, enabled: true });
    const modals = answerModals((p, c, click) => click("Executar"));
    services.skillRunner.requestFromAi(services.skills.get(skill.slug));
    services.skillRunner.flushPending();
    await services.skillRunner.queue;
    modals.stop();
    expect(modals.seen.length).toBe(0);
    expect(services.skills.runs(skill.slug)[0].trigger).toBe("ai");
  });
});

describe("Central de Revisões: issueService e 'Corrigir tudo'", () => {
  /** Abre o livro com problemas conhecidos e deixa a central varrer. */
  async function openReviewBook(extra = {}) {
    const book = openBook();
    for (const [rel, content] of Object.entries(extra)) writeFile(`${book}/${rel}`, content);
    writeFile(`${book}/notes/problemas.md`, "---\ntitle: Problemas\naiRead: true\naiWrite: true\n---\nO gato gato dormiu. Veja [a ficha](/assets/characters/sumiu.md) agora.\n");
    uiBus.emit("book:changed");
    await services.issues.loaded;
    await services.issues.scan();
    return book;
  }

  it("a varredura acha palavra repetida e link quebrado (sem gastar IA), grava o cache em .system/review e conta por categoria", async () => {
    const book = await openReviewBook();
    const all = services.issues.list({});
    const types = all.map((i) => i.type);
    expect(types).toContain("repeated-word");
    expect(types).toContain("broken-link");
    expect(all.find((i) => i.type === "repeated-word").file).toBe("notes/problemas.md");
    expect(services.issues.list({ category: "links" }).every((i) => i.type === "broken-link")).toBe(true);
    expect(exists(`${book}/.system/review/state.json`)).toBe(true);
    expect(services.issues.summary().total).toBeGreaterThanOrEqual(2);
  });

  it("reanálise é incremental: só o arquivo alterado é relido (scan-book recebe os hashes conhecidos)", async () => {
    const book = await openReviewBook();
    const spy = vi.spyOn(window.electronAPI, "scanBook");
    await services.issues.scan();
    const known = spy.mock.calls[0][1];
    expect(Object.keys(known)).toContain("notes/problemas.md");
    const files = await window.electronAPI.scanBook(book, known);
    expect(files.every((f) => f.changed === false && f.content === null)).toBe(true);
  });

  it("fix() aplica a correção ao RASCUNHO (.md.temp), nunca ao oficial, e o issue some", async () => {
    const book = await openReviewBook();
    const issue = services.issues.list({}).find((i) => i.type === "repeated-word");
    const official = `${book}/notes/problemas.md`;
    const before = rd(official);
    await services.issues.fix(issue.id);
    expect(rd(official)).toBe(before);
    expect(rd(`${official}.temp`)).toContain("O gato dormiu.");
    expect(services.issues.find(issue.id)).toBeFalsy();
  });

  it("fix() recusa arquivo somente leitura para o autor e trecho que mudou desde a análise", async () => {
    const book = await openReviewBook({ "notes/ro.md": "---\ntitle: RO\nhumanWrite: false\naiRead: true\n---\nde de novo\n" });
    const ro = services.issues.list({}).find((i) => i.file === "notes/ro.md" && i.type === "repeated-word");
    await expect(services.issues.fix(ro.id)).rejects.toThrow(/somente leitura/);
    const issue = services.issues.list({}).find((i) => i.file === "notes/problemas.md" && i.type === "repeated-word");
    writeFile(`${book}/notes/problemas.md`, "---\ntitle: Problemas\naiRead: true\naiWrite: true\n---\nTexto totalmente outro.\n");
    await expect(services.issues.fix(issue.id)).rejects.toThrow(/foi alterado desde a análise/);
  });

  it("dispensar um issue persiste em disco, sobrevive a recarregar o livro e não volta na reanálise", async () => {
    const book = await openReviewBook();
    const issue = services.issues.list({}).find((i) => i.type === "broken-link");
    expect(await services.issues.dismiss([issue.id])).toBe(1);
    expect(JSON.parse(rd(`${book}/.system/review/dismissed.json`)).issues[issue.id]).toBeTruthy();
    uiBus.emit("book:cleared");
    uiBus.emit("book:changed");
    await services.issues.loaded;
    await services.issues.scan();
    expect(services.issues.list({}).some((i) => i.id === issue.id)).toBe(false);
  });

  it("issues registrados pela IA (register_issues) entram na central, exigem o trecho exato e podem ser resolvidos", async () => {
    const book = await openReviewBook();
    writeFile(`${book}/notes/fatos.md`, "---\ntitle: Fatos\naiRead: true\n---\nAna tem olhos azuis.\n");
    const result = await services.issues.register(
      [
        { type: "fact-conflict", file: "notes/fatos.md", excerpt: "olhos azuis", message: "Na ficha ela tem olhos verdes." },
        { type: "fact-conflict", file: "notes/fatos.md", excerpt: "trecho que nao existe", message: "x" },
        { type: "tipo-inventado", file: "notes/fatos.md", message: "x" },
        { type: "fact-conflict", file: "notes/nao-existe.md", message: "x" },
      ],
      services.changelog.aiActor(),
    );
    expect(result.registered).toBe(1);
    expect(result.skipped.map((s) => s.index)).toEqual([1, 2, 3]);
    const mine = services.issues.list({ category: "contradictions" })[0];
    expect(mine).toMatchObject({ source: "ai", file: "notes/fatos.md", excerpt: "olhos azuis" });
    expect(JSON.parse(rd(`${book}/.system/review/registered.json`)).issues.length).toBe(1);
    // repetir o mesmo issue é ignorado
    const again = await services.issues.register([{ type: "fact-conflict", file: "notes/fatos.md", excerpt: "olhos azuis", message: "Na ficha ela tem olhos verdes." }], services.changelog.aiActor());
    expect(again.registered).toBe(0);
    expect(await services.issues.resolve([mine.id], services.changelog.aiActor())).toBe(1);
    expect(services.issues.list({ category: "contradictions" })).toEqual([]);
  });

  // BUG: src/renderer/services/issueService.ts (doScan, ~linha 482): quando o conjunto de arquivos do livro muda entre duas
  // varreduras, doScan chama `await this.scan({ types: ["broken-link"] })` ainda DENTRO da varredura em andamento; scan() vê
  // `this.scanning` ocupado, só agenda um "rerun" e devolve a própria varredura, que então espera por si mesma (deadlock).
  // Esperado: a varredura termina e novos arquivos passam a ser analisados; obtido: a promessa nunca resolve e a Central trava.
  it("varredura continua funcionando depois que um arquivo novo aparece no livro (sem deadlock do passe de links)", async () => {
    const book = await openReviewBook();
    writeFile(`${book}/notes/chegou-depois.md`, "---\ntitle: Depois\naiRead: true\n---\nTexto novo novo.\n");
    const done = services.issues.scan().then(() => "ok");
    const timeout = new Promise((resolve) => setTimeout(() => resolve("travou"), 12000));
    try {
      expect(await Promise.race([done, timeout])).toBe("ok");
    } finally {
      // destrava o serviço para os demais testes
      services.issues.scanning = null;
      services.issues.rerun = null;
    }
  });

  it("'Corrigir tudo' monta o pedido certo: skill nativa corrigir-pendencias, categoria no pedido, janela de permissão e tools só da skill", async () => {
    await openReviewBook();
    resetRunner();
    const { IssuesPanel } = await import("../../src/renderer/components/Central/panels/issuesPanel");
    const ctx = { services, toast: vi.fn(), uiBus };
    const send = vi.spyOn(services.ai, "sendMessage");
    const modals = answerModals((p, c, click) => click("Executar"));
    IssuesPanel.prototype.fixWithAi.call({ ctx }, "links");
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    await services.skillRunner.queue;
    modals.stop();
    expect(modals.seen[0].title).toContain("Corrigir pendências");
    expect(modals.seen[0].content).toContain("Você pediu para executá-la");
    const args = send.mock.calls[0][0];
    expect(args.prompt).toContain("Categoria a corrigir: links (Links).");
    expect(args.prompt).toContain("# Instruções da skill");
    expect(args.skill.slug).toBe("corrigir-pendencias");
    expect(args.skill.tools).toEqual(expect.arrayContaining(["list_issues", "replace_in_file", "resolve_issues"]));
  });

  it("'Corrigir tudo' de todas as categorias diz 'todas' e, se a skill nativa sumir, avisa o autor em vez de falhar", async () => {
    await openReviewBook();
    resetRunner();
    const { IssuesPanel } = await import("../../src/renderer/components/Central/panels/issuesPanel");
    const toast = vi.fn();
    const send = vi.spyOn(services.ai, "sendMessage");
    const modals = answerModals((p, c, click) => click("Executar"));
    IssuesPanel.prototype.fixWithAi.call({ ctx: { services, toast, uiBus } }, "todas");
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    await services.skillRunner.queue;
    modals.stop();
    expect(send.mock.calls[0][0].prompt).toContain("Categoria a corrigir: todas (todas as categorias).");
    const fake = { skills: { get: () => undefined }, skillRunner: { request: vi.fn() } };
    IssuesPanel.prototype.fixWithAi.call({ ctx: { services: fake, toast, uiBus } }, "links");
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("Corrigir pendências"), "error");
    expect(fake.skillRunner.request).not.toHaveBeenCalled();
  });
});

describe("creationService.importChapters e importação por arquivo", () => {
  it("cria o livro, extrai um .txt pelo IPC real e grava os capítulos (pastas, manuscrito, folder.yml e índice)", async () => {
    // arquivo de origem escolhido no diálogo
    const src = path.join(bridge.dataDir, "romance.txt");
    fs.writeFileSync(src, "O VALE\n\nCapítulo 1\n\nA chuva caiu sobre o vale.\n\nCapítulo 2\n\nO sol voltou.\n\nCapítulo 3\n\nA noite chegou.\n");
    bridge.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [src] });
    const extracted = await window.electronAPI.extractBookFile();
    expect(extracted.success).toBe(true);
    expect(extracted.title).toBe("O VALE");
    expect(extracted.chapters.length).toBe(3);

    state.currentBookPath = null;
    const created = await services.creation.create({ kind: "book", values: { book_title: extracted.title, ai_mode: "assistant" } });
    expect(created.title).toBe("O VALE");
    expect(created.bookPath.startsWith(bridge.booksRoot.replace(/\\/g, "/"))).toBe(true);
    const n = await services.creation.importChapters(created.bookPath, extracted.chapters);
    expect(n).toBe(3);
    for (const i of ["001", "002", "003"]) expect(exists(`${created.bookPath}/content/chapter_${i}`)).toBe(true);
    const draft2 = rd(`${created.bookPath}/content/chapter_002/2_draft.md`);
    expect(draft2).toContain("chapter_title: Capítulo 2");
    expect(draft2).toContain("# Capítulo 2");
    expect(draft2).toContain("O sol voltou.");
    expect(rd(`${created.bookPath}/content/chapter_003/folder.yml`)).toContain("Capítulo 03");
    const index = rd(`${created.bookPath}/content/index.md`);
    expect(index).toContain("Capítulo 1");
    expect(index).toContain("chapter_003/2_draft.md");
    // o livro novo aparece na lista e a Sinopse tem o título
    const list = await window.electronAPI.getBooksList();
    expect(list.find((b) => b.fullPath.replace(/\\/g, "/") === created.bookPath).book_title).toBe("O VALE");
  });

  it("título de capítulo vazio vira 'Capítulo N'; capítulos existentes além do modelo são criados como cópia", async () => {
    state.currentBookPath = null;
    const created = await services.creation.create({ kind: "book", values: { book_title: "Livro sem títulos", ai_mode: "assistant" } });
    await services.creation.importChapters(created.bookPath, [{ title: "", text: "um" }, { title: "Dois", text: "dois" }]);
    expect(rd(`${created.bookPath}/content/chapter_001/2_draft.md`)).toContain("chapter_title: Capítulo 1");
    expect(rd(`${created.bookPath}/content/chapter_002/2_draft.md`)).toContain("chapter_title: Dois");
  });

  it("criar livro registra a criação no changelog do novo livro; capítulo novo da IA tem autor IA", async () => {
    state.currentBookPath = null;
    const created = await services.creation.create({ kind: "book", values: { book_title: "Registrado", ai_mode: "coauthor" } });
    const page = await window.electronAPI.changelogPage(created.bookPath, null);
    expect(page.entries.some((e) => e.action === "create")).toBe(true);
    expect(JSON.parse(rd(`${created.bookPath}/config.json`)).ai_mode).toBe("coauthor");
  });
});

describe("Changelog do renderer (autoria e restauração)", () => {
  it("edição do autor é 'user'; sincronizar rascunho da IA é 'ai'; restaurar volta o texto e registra 'restore'", async () => {
    const book = openBook();
    const file = `${book}/notes/diario.md`;
    writeFile(file, "---\ntitle: Diário\naiRead: true\naiWrite: true\n---\nversão 1\n");
    // o autor edita e sincroniza (rascunho -> oficial)
    await services.file.saveTempFile(file, "---\ntitle: Diário\naiRead: true\naiWrite: true\n---\nversão 2\n");
    await services.file.syncFile(file);
    // a IA edita e o autor sincroniza
    await services.ai.sendMessage({ prompt: `/tool append_to_file | ${JSON.stringify({ path: "notes/diario.md", text: "versão 3 (IA)" })}`, history: [] });
    await services.file.syncFile(file);
    const hist = await services.changelog.getFileHistory(file);
    const actors = hist.entries.filter((e) => e.action === "update").map((e) => e.actor.type);
    expect(actors).toContain("user");
    expect(actors).toContain("ai");
    const oldest = hist.entries[hist.entries.length - 1];
    const preview = await services.changelog.preview(file, oldest.id);
    expect(preview.success).toBe(true);
    const res = await services.changelog.restore(file, oldest.id);
    expect(res.success).toBe(true);
    expect(rd(file)).toContain("versão 1");
    const page = await services.changelog.getPage();
    expect(page.entries.some((e) => e.action === "restore")).toBe(true);
  });

  it("config.json não entra no changelog (é estado de interface)", async () => {
    const book = openBook();
    expect(services.changelog.isTracked(`${book}/config.json`)).toBe(false);
    expect(services.changelog.isTracked(`${book}/notes/a.md.temp`)).toBe(false);
    expect(services.changelog.isTracked(`${book}/notes/a.md`)).toBe(true);
  });
});

describe("Backup (backupService + IPC real)", () => {
  it("backup agora: um zip por livro (com rascunhos), mantém só as N últimas cópias e grava o horário", async () => {
    const JSZip = require("jszip");
    const book = openBook();
    writeFile(`${book}/content/plot.md.temp`, "rascunho para backup");
    const folder = path.join(bridge.dataDir, "backups-teste");
    appSettings.set("backup.folder", folder);
    appSettings.set("backup.keep", 2);
    appSettings.set("backup.lastAt", 0);
    expect(services.backup.configured).toBe(true);
    const r = await services.backup.runNow();
    expect(r.success).toBe(true);
    expect(r.count).toBeGreaterThanOrEqual(1);
    expect(appSettings.get("backup.lastAt")).toBeGreaterThan(0);
    const mine = r.files.find((f) => path.basename(f).includes(`[${path.basename(book)}]`));
    const zip = await JSZip.loadAsync(fs.readFileSync(mine));
    expect(Object.keys(zip.files).some((n) => n.endsWith("plot.md.temp"))).toBe(true);
    expect(Object.keys(zip.files).some((n) => n.includes(".system"))).toBe(false);

    // cópias antigas do mesmo livro: só as 2 mais recentes ficam
    const prefix = path.basename(mine).replace(/\d{4}-\d{2}-\d{2}_\d{4}\.zip$/, "");
    for (const stampName of ["2020-01-01_0000", "2020-01-02_0000", "2020-01-03_0000"]) fs.writeFileSync(path.join(folder, `${prefix}${stampName}.zip`), "x");
    await services.backup.runNow();
    const left = fs.readdirSync(folder).filter((n) => n.startsWith(prefix));
    expect(left.length).toBe(2);
    expect(left.some((n) => n.includes("2020-01-01"))).toBe(false);
    expect(left.some((n) => n.includes("2020-01-03"))).toBe(true);
  });

  it("sem pasta configurada o backup avisa; due() só vale com backup automático e intervalo vencido", async () => {
    appSettings.set("backup.folder", "");
    expect((await services.backup.runNow()).success).toBe(false);
    appSettings.set("backup.folder", path.join(bridge.dataDir, "b2"));
    appSettings.set("backup.auto", false);
    expect(services.backup.due()).toBe(false);
    appSettings.set("backup.auto", true);
    appSettings.set("backup.everyHours", 24);
    appSettings.set("backup.lastAt", Date.now());
    expect(services.backup.due()).toBe(false);
    appSettings.set("backup.lastAt", Date.now() - 25 * 3_600_000);
    expect(services.backup.due()).toBe(true);
    appSettings.set("backup.auto", false);
  });

  it("init() usa a pasta de backups padrão do app (ASTRA_DATA_DIR) quando nada foi configurado", async () => {
    appSettings.set("backup.folder", "");
    await services.backup.init();
    expect(appSettings.get("backup.folder")).toBe(path.join(bridge.dataDir, "backups"));
  });
});

describe("productivityService: meta de tempo e contagem regressiva", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    localStorage.clear();
    document.body.innerHTML = '<div id="productivity-bar"><span id="prod-time"></span><span id="prod-status"></span><button id="prod-toggle"></button></div>';
    appSettings.set("productivity.enabled", true);
    appSettings.set("productivity.auto", false);
  });
  afterEach(() => {
    vi.useRealTimers();
    appSettings.set("productivity.goalMinutes", 0);
  });

  /** Avança o relógio em passos de 1 s (como o setInterval do app). */
  function run(service, seconds) {
    for (let i = 0; i < seconds; i++) {
      vi.advanceTimersByTime(1000);
      service.tick();
    }
  }

  it("sem meta: conta para a frente; pausado não conta", async () => {
    const { ProductivityService } = await import("../../src/renderer/services/productivityService");
    const p = new ProductivityService();
    p.focused = true;
    run(p, 3);
    expect(p.current).toBeNull(); // começa pausado
    expect(document.getElementById("prod-time").textContent).toBe("00:00:00");
    p.toggle();
    run(p, 65);
    expect(document.getElementById("prod-time").textContent).toBe("00:01:05");
    p.toggle();
    run(p, 10);
    expect(p.dailyTotals()[0].ms).toBe(65_000);
  });

  it("com meta: mostra o tempo que FALTA, encerra a contagem ao chegar no fim, avisa e o play começa nova contagem", async () => {
    const { ProductivityService } = await import("../../src/renderer/services/productivityService");
    appSettings.set("productivity.goalMinutes", 1);
    const p = new ProductivityService();
    p.focused = true;
    const toasts = [];
    uiBus.on("toast:show", (t) => toasts.push(t), false);
    p.toggle();
    run(p, 20);
    expect(document.getElementById("prod-time").textContent).toBe("00:00:40");
    expect(document.getElementById("prod-status").textContent).toBe("faltam");
    expect(p.goalDone).toBe(false);
    run(p, 45);
    expect(p.goalDone).toBe(true);
    expect(p.manualPaused).toBe(true);
    expect(document.getElementById("prod-time").textContent).toBe("00:00:00");
    expect(document.getElementById("prod-status").textContent).toContain("meta cumprida");
    expect(toasts.some((t) => /Meta de tempo concluída/.test(t.message))).toBe(true);
    // o registro foi limitado exatamente à meta
    expect(p.records[p.records.length - 1].activeMs).toBe(60_000);
    expect(p.records[p.records.length - 1].open).toBe(false);
    // depois da meta, o tempo extra não conta; o play inicia uma nova contagem
    run(p, 30);
    expect(p.dailyTotals()[0].ms).toBe(60_000);
    p.toggle();
    expect(p.goalDone).toBe(false);
    run(p, 10);
    expect(document.getElementById("prod-time").textContent).toBe("00:00:50");
  });

  it("modo automático: janela sem foco ou parada pausa a contagem ('ausente'); registros persistem entre sessões", async () => {
    const { ProductivityService } = await import("../../src/renderer/services/productivityService");
    appSettings.set("productivity.auto", true);
    const p = new ProductivityService();
    p.manualPaused = false;
    p.focused = true;
    p.lastActivity = Date.now();
    run(p, 5);
    expect(p.status()).toBe("running");
    p.focused = false;
    expect(p.status()).toBe("away");
    run(p, 5);
    p.closeRecord();
    const total = p.dailyTotals()[0].ms;
    expect(total).toBe(5000);
    // um novo serviço (app reaberto) recupera os registros e fecha o que ficou aberto
    const again = new ProductivityService();
    expect(again.dailyTotals()[0].ms).toBe(5000);
    expect(again.records.every((r) => r.open === false)).toBe(true);
    again.reset();
    expect(again.goalDone).toBe(false);
  });

  it("get_productivity (tool da IA) enxerga o cronômetro do serviço", async () => {
    const { toolRegistry } = await import("../../src/renderer/ai/aiTools");
    const { ProductivityService } = await import("../../src/renderer/services/productivityService");
    const p = new ProductivityService();
    p.focused = true;
    p.toggle();
    run(p, 12);
    const out = await toolRegistry.execute("get_productivity", {}, { productivity: p, state });
    expect(out.isError).toBe(false);
    expect(out.output).toBeTruthy();
  });
});

describe("AiService: contas, conta mock padrão e histórico do chat", () => {
  it("instalação nova (sem configurações): a conta ativa é o Assistente Astra (mock), e isso é gravado em disco", async () => {
    fs.rmSync(path.join(bridge.userData, "ai-settings.json"), { force: true });
    const { State } = await import("../../src/renderer/core/state");
    const { AiService } = await import("../../src/renderer/services/aiService");
    const st = new State();
    const svc = new AiService(st, services.file, services.creation, services.changelog, {});
    await svc.loadSettings();
    expect(svc.activeAccount()).toMatchObject({ provider: "mock", nickname: "Assistente Astra" });
    expect(st.aiProvider).toBe("mock");
    const saved = JSON.parse(rd(path.join(bridge.userData, "ai-settings.json")));
    expect(saved.accounts.some((a) => a.provider === "mock")).toBe(true);
    expect(saved.activeAccount).toBe("acc-mock");
  });

  it("a conta mock não pode ser removida; remover a ativa passa para a primeira restante; a cadeia de fallback é limpa", async () => {
    const svc = services.ai;
    const claude = await svc.saveAccount({ provider: "claude", nickname: "Minha Claude", apiKey: "sk-secreta-123", activate: true });
    expect(svc.activeAccount().id).toBe(claude);
    expect(state.aiProvider).toBe("claude");
    await svc.saveExtraSettings({ fallback: { enabled: true, chain: [{ accountId: claude }] } });
    await svc.removeAccount("acc-mock");
    expect(svc.accounts().some((a) => a.provider === "mock")).toBe(true);
    await svc.removeAccount(claude);
    expect(svc.accounts().some((a) => a.id === claude)).toBe(false);
    expect(svc.activeAccount()).toBeTruthy();
    expect(state.aiSettings.fallback.chain).toEqual([]);
    const disk = JSON.parse(rd(path.join(bridge.userData, "ai-settings.json")));
    expect(disk.accounts.some((a) => a.id === claude)).toBe(false);
    await expect(svc.saveAccount({ provider: "provedor-inexistente" })).rejects.toThrow(/Provedor inválido/);
    await svc.selectAccount("acc-mock");
    expect(state.aiProvider).toBe("mock");
  });

  it("trocar de modelo/conta é registrado no changelog do livro SEM a chave de API", async () => {
    const book = openBook();
    const svc = services.ai;
    const id = await svc.saveAccount({ provider: "claude", nickname: "Chave", apiKey: "sk-ultra-secreta-999", activate: true });
    await svc.selectAccount("acc-mock");
    await svc.removeAccount(id);
    const page = await window.electronAPI.changelogPage(book, null);
    const text = JSON.stringify(page.entries);
    expect(text).toContain("ai.model");
    expect(text).not.toContain("sk-ultra-secreta-999");
    const log = JSON.stringify(await window.electronAPI.readAiErrorLog());
    expect(log).not.toContain("sk-ultra-secreta-999");
  });

  it("histórico do chat: rotaciona em arquivos de 50 mensagens e a leitura paginada vai da sessão mais recente para trás", async () => {
    const book = openBook();
    for (let i = 1; i <= 120; i++) {
      await services.ai.saveMessage({ role: i % 2 ? "user" : "assistant", content: `mensagem ${i}` });
    }
    const files = await services.ai.getChatLogFiles();
    expect(files.length).toBe(3);
    expect(files[0].replace(/\\/g, "/")).toContain("/.system/chatlog/");
    const p0 = await services.ai.loadChatHistoryPaged({ sessionOffset: 0 });
    expect(p0.messages.length).toBe(20);
    expect(p0.messages[0].content).toBe("mensagem 101");
    expect(p0.messages[19].content).toBe("mensagem 120");
    expect(p0.hasMore).toBe(true);
    const p1 = await services.ai.loadChatHistoryPaged({ sessionOffset: 1 });
    expect(p1.messages.length).toBe(50);
    expect(p1.messages[0].content).toBe("mensagem 51");
    expect(p1.hasMore).toBe(true);
    const p2 = await services.ai.loadChatHistoryPaged({ sessionOffset: 2 });
    expect(p2.messages[0].content).toBe("mensagem 1");
    expect(p2.hasMore).toBe(false);
    expect(await services.ai.loadChatHistoryPaged({ sessionOffset: 3 })).toEqual({ messages: [], hasMore: false });
    // o log do chat não vai para o conteúdo do livro (fica em .system) e não entra na busca nem no mapa
    expect(await window.electronAPI.searchBook(book, "mensagem 77")).toEqual([]);
  });

  it("mensagens vazias não são gravadas, botões e flag de erro são preservados, e sem livro aberto nada é gravado", async () => {
    const book = openBook();
    expect(await services.ai.saveMessage({ role: "user", content: "" })).toBe(false);
    await services.ai.saveMessage({ role: "assistant", content: "falhou", error: true, buttons: [{ label: "Ok", reply: "ok" }] });
    const { messages } = await services.ai.loadChatHistoryPaged({ sessionOffset: 0 });
    const last = messages[messages.length - 1];
    expect(last).toMatchObject({ role: "assistant", error: true, buttons: [{ label: "Ok", reply: "ok" }] });
    expect(book).toBeTruthy();
    state.currentBookPath = null;
    expect(await services.ai.saveMessage({ role: "user", content: "oi" })).toBe(false);
    expect(await services.ai.loadChatHistoryPaged()).toEqual({ messages: [], hasMore: false });
  });
});
