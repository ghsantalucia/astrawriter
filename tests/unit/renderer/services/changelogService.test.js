import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ChangelogService } from "../../../../src/renderer/services/changelogService";
import { AI_PROVIDERS, DEFAULT_AI_PROVIDER } from "../../../../src/renderer/ai/providers/index";

const LIVRO = "C:/livros/book_1";
let api;
let svc;

beforeEach(() => {
  api = {
    changelogRecord: vi.fn(async (_book, payload) => ({ entry: { id: 1, ...payload } })),
    changelogFileHistory: vi.fn(async () => ({ entries: [{ id: 3 }], restoredFrom: null })),
    changelogPreview: vi.fn(async () => ({ success: true, content: "v", current: "c" })),
    changelogAutosave: vi.fn(async () => ({ entry: { id: 9 } })),
    readFile: vi.fn(async () => null),
  };
  window.electronAPI = api;
  vi.spyOn(console, "error").mockImplementation(() => {});
  svc = new ChangelogService({ currentBookPath: "C:\\livros\\book_1\\", aiProvider: DEFAULT_AI_PROVIDER, aiSettings: { providers: {} } });
});
afterEach(() => {
  vi.restoreAllMocks();
  delete window.electronAPI;
});

describe("changelogService: autores", () => {
  it("userActor e systemActor", () => {
    expect(svc.userActor()).toEqual({ type: "user" });
    expect(svc.systemActor()).toEqual({ type: "system" });
  });
  it("aiActor usa o modelo configurado ou o padrão do provedor", () => {
    const padrao = AI_PROVIDERS.find((p) => p.id === DEFAULT_AI_PROVIDER).defaultModel;
    expect(svc.aiActor()).toEqual({ type: "ai", provider: DEFAULT_AI_PROVIDER, model: padrao });
    svc.state.aiSettings = { providers: { [DEFAULT_AI_PROVIDER]: { model: "meu-modelo" } } };
    expect(svc.aiActor().model).toBe("meu-modelo");
  });
  it("aiActor com provedor desconhecido tem modelo vazio", () => {
    svc.state.aiProvider = "inexistente";
    expect(svc.aiActor()).toEqual({ type: "ai", provider: "inexistente", model: "" });
  });
  it("rascunho da IA: actorFor devolve a IA até o rascunho ser limpo (inclusive pelo caminho .temp)", () => {
    expect(svc.actorFor(`${LIVRO}/a.md`)).toEqual({ type: "user" });
    svc.markAiDraft(`${LIVRO}/a.md`);
    expect(svc.actorFor(`${LIVRO}/a.md`).type).toBe("ai");
    svc.clearDraft(`${LIVRO}/a.md.temp`);
    expect(svc.actorFor(`${LIVRO}/a.md`).type).toBe("user");
  });
});

describe("changelogService: o que é rastreado", () => {
  it("ignora .temp, config.json e caminho vazio", () => {
    expect(svc.isTracked(`${LIVRO}/a.md`)).toBe(true);
    expect(svc.isTracked(`${LIVRO}/a.md.temp`)).toBe(false);
    expect(svc.isTracked(`${LIVRO}/config.json`)).toBe(false);
    expect(svc.isTracked("")).toBe(false);
    expect(svc.isTracked(undefined)).toBe(false);
  });
  it("resolveBook só aceita arquivos dentro do livro", () => {
    expect(svc.resolveBook(`${LIVRO}/a.md`)).toBe(LIVRO);
    expect(svc.resolveBook("C:\\livros\\book_1\\sub\\a.md")).toBe(LIVRO);
    expect(svc.resolveBook("C:/livros/book_10/a.md")).toBeNull();
    expect(svc.resolveBook("D:/outro/a.md")).toBeNull();
    expect(svc.resolveBook("D:/outro/a.md", "D:/outro/")).toBe("D:/outro");
    svc.state.currentBookPath = null;
    expect(svc.resolveBook(`${LIVRO}/a.md`)).toBeNull();
  });
});

describe("changelogService: registro", () => {
  it("record envia ao processo principal com autor padrão usuário e devolve a entrada", async () => {
    const e = await svc.record({ action: "update", filePath: `${LIVRO}/a.md`, before: "x", after: "y", meta: { m: 1 } });
    expect(api.changelogRecord).toHaveBeenCalledWith(LIVRO, { action: "update", filePath: `${LIVRO}/a.md`, before: "x", after: "y", actor: { type: "user" }, meta: { m: 1 } });
    expect(e.id).toBe(1);
  });
  it("record não faz nada para arquivo não rastreado ou fora do livro", async () => {
    expect(await svc.record({ action: "update", filePath: `${LIVRO}/a.md.temp` })).toBeNull();
    expect(await svc.record({ action: "update", filePath: "D:/fora.md" })).toBeNull();
    expect(api.changelogRecord).not.toHaveBeenCalled();
  });
  it("record nunca lança erro", async () => {
    api.changelogRecord.mockRejectedValue(new Error("boom"));
    expect(await svc.record({ action: "create", filePath: `${LIVRO}/a.md` })).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
  it("recordAiRead registra leitura pela IA com a ferramenta", async () => {
    await svc.recordAiRead(`${LIVRO}/a.md`, "read_file");
    const [, payload] = api.changelogRecord.mock.calls[0];
    expect(payload).toMatchObject({ action: "read", actor: { type: "ai" }, meta: { tool: "read_file" } });
    await svc.recordAiRead(`${LIVRO}/a.md`);
    expect(api.changelogRecord.mock.calls[1][1].meta).toBeUndefined();
  });
  it("recordBookRead registra no escopo do livro; sem livro devolve null", async () => {
    await svc.recordBookRead("list_files", { count: 4 });
    expect(api.changelogRecord).toHaveBeenCalledWith(LIVRO, expect.objectContaining({ action: "read", scope: "book", filePath: LIVRO, meta: { tool: "list_files", count: 4 } }));
    svc.state.currentBookPath = null;
    expect(await svc.recordBookRead("x")).toBeNull();
  });
  it("recordSetting e recordReview (com e sem arquivo)", async () => {
    await svc.recordSetting({ setting: "ai.model", from: "a", to: "b" });
    expect(api.changelogRecord.mock.calls[0][1]).toMatchObject({ action: "setting", scope: "book", actor: { type: "user" } });
    await svc.recordReview({ kind: "fixed", count: 1 });
    expect(api.changelogRecord.mock.calls[1][1]).toMatchObject({ action: "review", scope: "book", filePath: LIVRO, actor: { type: "system" } });
    await svc.recordReview({ kind: "fixed", count: 1 }, undefined, "notes/n.md");
    const p = api.changelogRecord.mock.calls[2][1];
    expect(p.filePath).toBe(`${LIVRO}/notes/n.md`);
    expect("scope" in p).toBe(false);
  });
  it("recordMove registra o caminho antigo relativo ao livro, com autor Sistema", async () => {
    await svc.recordMove(`${LIVRO}/content/chapter_002/a.md`, "C:\\livros\\book_1\\content\\chapter_001\\a.md");
    expect(api.changelogRecord.mock.calls[0][1]).toMatchObject({ action: "move", actor: { type: "system" }, meta: { from: "content/chapter_001/a.md" } });
    expect(await svc.recordMove("D:/fora/x.md", "D:/fora/y.md")).toBeNull();
  });
});

describe("changelogService: consulta", () => {
  it("getFileHistory usa o caminho relativo; fora do livro devolve vazio", async () => {
    const h = await svc.getFileHistory(`${LIVRO}/notes/n.md`);
    expect(api.changelogFileHistory).toHaveBeenCalledWith(LIVRO, "notes/n.md");
    expect(h.entries).toHaveLength(1);
    expect(await svc.getFileHistory("D:/fora.md")).toEqual({ entries: [], restoredFrom: null });
    api.changelogFileHistory.mockResolvedValue(null);
    expect(await svc.getFileHistory(`${LIVRO}/a.md`)).toEqual({ entries: [], restoredFrom: null });
  });
  it("preview recusa arquivo fora do livro", async () => {
    expect((await svc.preview("D:/fora.md", 1)).success).toBe(false);
    expect((await svc.preview(`${LIVRO}/a.md`, 4)).content).toBe("v");
    expect(api.changelogPreview).toHaveBeenCalledWith(LIVRO, `${LIVRO}/a.md`, 4);
  });
  it("getPage sem livro devolve página vazia", async () => {
    svc.state.currentBookPath = null;
    expect(await svc.getPage()).toEqual({ file: null, entries: [], older: null });
  });
});

describe("changelogService: salvamento automático (sessões)", () => {
  it("beginAutosave lê o rascunho, depois o oficial, depois vazio, e reaproveita a sessão", async () => {
    api.readFile.mockImplementation(async (p) => (p.endsWith(".temp") ? "rascunho" : "oficial"));
    const a = await svc.beginAutosave(`${LIVRO}/a.md`, { type: "user" });
    expect(a.before).toBe("rascunho");
    const b = await svc.beginAutosave(`${LIVRO}/a.md.temp`, { type: "user" });
    expect(b).toEqual({ sessionId: a.sessionId, before: null });

    api.readFile.mockImplementation(async (p) => (p.endsWith(".temp") ? null : "oficial"));
    expect((await svc.beginAutosave(`${LIVRO}/b.md`, { type: "user" })).before).toBe("oficial");
    api.readFile.mockResolvedValue(null);
    expect((await svc.beginAutosave(`${LIVRO}/c.md`, { type: "user" })).before).toBe("");
  });
  it("beginAutosave de arquivo não rastreado devolve null; sessões de usuário e IA são separadas", async () => {
    expect(await svc.beginAutosave(`${LIVRO}/config.json`, { type: "user" })).toBeNull();
    const u = await svc.beginAutosave(`${LIVRO}/a.md`, { type: "user" });
    const i = await svc.beginAutosave(`${LIVRO}/a.md`, { type: "ai" });
    expect(u.sessionId).not.toBe(i.sessionId);
  });
  it("recordAutosave envia a sessão e nunca lança erro", async () => {
    const s = await svc.beginAutosave(`${LIVRO}/a.md`, { type: "user" });
    const e = await svc.recordAutosave(`${LIVRO}/a.md.temp`, s, "novo", { type: "user" });
    expect(api.changelogAutosave).toHaveBeenCalledWith(LIVRO, { sessionId: s.sessionId, filePath: `${LIVRO}/a.md`, before: s.before, after: "novo", actor: { type: "user" } });
    expect(e.id).toBe(9);
    expect(await svc.recordAutosave(`${LIVRO}/a.md`, null, "x", {})).toBeNull();
    api.changelogAutosave.mockRejectedValue(new Error("x"));
    expect(await svc.recordAutosave(`${LIVRO}/a.md`, s, "x", {})).toBeNull();
  });
  it("endSession encerra as duas sessões do arquivo", async () => {
    await svc.beginAutosave(`${LIVRO}/a.md`, { type: "user" });
    await svc.beginAutosave(`${LIVRO}/a.md`, { type: "ai" });
    svc.endSession(`${LIVRO}/a.md.temp`);
    expect(svc.autosaveSessions.size).toBe(0);
  });
  it("endSessionsExcept mantém só a sessão de usuário do arquivo em edição (e as da IA)", async () => {
    await svc.beginAutosave(`${LIVRO}/a.md`, { type: "user" });
    await svc.beginAutosave(`${LIVRO}/b.md`, { type: "user" });
    await svc.beginAutosave(`${LIVRO}/b.md`, { type: "ai" });
    svc.endSessionsExcept(`${LIVRO}/a.md`);
    expect([...svc.autosaveSessions.keys()].sort()).toEqual([`${LIVRO}/a.md|user`, `${LIVRO}/b.md|ai`]);
    svc.endSessionsExcept(null);
    expect([...svc.autosaveSessions.keys()]).toEqual([`${LIVRO}/b.md|ai`]);
  });
  it("endAiSessions só encerra as da IA", async () => {
    await svc.beginAutosave(`${LIVRO}/a.md`, { type: "user" });
    await svc.beginAutosave(`${LIVRO}/a.md`, { type: "ai" });
    svc.endAiSessions();
    expect([...svc.autosaveSessions.keys()]).toEqual([`${LIVRO}/a.md|user`]);
  });
});
