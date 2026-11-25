// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { uiBus } from "../../src/renderer/events/uiBus";
import * as chatHandler from "../../src/renderer/controllers/handlers/chatHandler";

/** Cria um AiService de mentira com o contrato que o chatHandler usa. */
function makeAiService(overrides = {}) {
  return {
    saveMessage: vi.fn().mockResolvedValue(true),
    loadChatHistoryPaged: vi.fn().mockResolvedValue({ messages: [], hasMore: false }),
    sendMessage: vi.fn().mockResolvedValue({ text: "Test passed.", buttons: [] }),
    ...overrides,
  };
}

describe("Integração: envio, persistência e recebimento de mensagens do chat", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("persiste e envia a mensagem do usuário, persiste e emite a resposta da IA (na ordem certa)", async () => {
    const aiService = makeAiService();
    const emitSpy = vi.spyOn(uiBus, "emit");
    const promptText = "Return strictly: Test passed.";

    await chatHandler.onSendMessage({ promptText }, aiService);

    expect(aiService.saveMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ role: "user", content: promptText, timestamp: expect.any(String) }));
    expect(emitSpy).toHaveBeenNthCalledWith(1, "chat:render-message", expect.objectContaining({ role: "user", content: promptText }));
    expect(emitSpy).toHaveBeenNthCalledWith(2, "chat:set-loading", true);
    expect(aiService.loadChatHistoryPaged).toHaveBeenCalledWith({ sessionOffset: 0 });
    expect(aiService.sendMessage).toHaveBeenCalledWith({ prompt: promptText, history: [] });
    expect(aiService.saveMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ role: "assistant", content: "Test passed." }));
    expect(emitSpy).toHaveBeenNthCalledWith(3, "chat:render-message", expect.objectContaining({ role: "assistant", content: "Test passed." }));
    expect(emitSpy).toHaveBeenNthCalledWith(4, "chat:set-loading", false);
  });

  it("leva ao chat os botões que a IA pediu", async () => {
    const buttons = [{ label: "Abrir", action: "x" }];
    const aiService = makeAiService({ sendMessage: vi.fn().mockResolvedValue({ text: "ok", buttons }) });
    const emitSpy = vi.spyOn(uiBus, "emit");

    await chatHandler.onSendMessage({ promptText: "oi" }, aiService);

    expect(emitSpy).toHaveBeenCalledWith("chat:render-message", expect.objectContaining({ role: "assistant", buttons }));
  });

  it("não processa nada se o prompt for vazio (nem salva, nem consulta a IA, nem emite eventos)", async () => {
    const aiService = makeAiService();
    const emitSpy = vi.spyOn(uiBus, "emit");

    await chatHandler.onSendMessage({ promptText: "   " }, aiService);

    expect(aiService.saveMessage).not.toHaveBeenCalled();
    expect(aiService.loadChatHistoryPaged).not.toHaveBeenCalled();
    expect(aiService.sendMessage).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it("se a IA falhar: mostra o motivo na conversa, marca como erro, avisa por toast e libera a interface", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const aiService = makeAiService({ sendMessage: vi.fn().mockRejectedValue(new Error("Falha na API da IA")) });
    const emitSpy = vi.spyOn(uiBus, "emit");

    await chatHandler.onSendMessage({ promptText: "oi" }, aiService);

    expect(emitSpy).toHaveBeenCalledWith("toast:show", { message: "Falha na API da IA", type: "error" });
    expect(emitSpy).toHaveBeenCalledWith(
      "chat:render-message",
      expect.objectContaining({ role: "assistant", error: true, content: expect.stringContaining("Falha na API da IA") }),
    );
    // o erro é gravado no histórico, marcado como erro (não vai de contexto para a IA)
    expect(aiService.saveMessage).toHaveBeenLastCalledWith(expect.objectContaining({ error: true }));
    expect(emitSpy).toHaveBeenLastCalledWith("chat:set-loading", false);
  });

  it("se o autor interromper a IA: só um aviso discreto, sem mensagem de erro", async () => {
    const abort = Object.assign(new Error("abortado"), { name: "AbortError" });
    const aiService = makeAiService({ sendMessage: vi.fn().mockRejectedValue(abort) });
    const emitSpy = vi.spyOn(uiBus, "emit");

    await chatHandler.onSendMessage({ promptText: "oi" }, aiService);

    expect(emitSpy).not.toHaveBeenCalledWith("toast:show", expect.anything());
    expect(emitSpy).toHaveBeenLastCalledWith("chat:set-loading", false);
    expect(aiService.saveMessage).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("interrompeu") }));
  });
});
