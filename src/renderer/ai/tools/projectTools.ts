// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Ferramentas da IA sobre o projeto e o app: alternar a exibição dos arquivos avançados, consultar o
 * `config.json` dos livros e os modelos de IA configurados (sem nunca expor chaves de API).
 */

import { normalizePath } from "../../utils/helpers.js";
import { AI_PROVIDERS } from "../providers/index.js";
import { uiBus } from "../../events/uiBus.js";

/**
 * Livro (da lista do app) correspondente a um nome de pasta, ou o atual quando nada é informado.
 * @param {Object} state - Estado global.
 * @param {string} [folderName] - Nome da pasta do livro.
 * @returns {Object} Item da lista de livros.
 * @throws {Error} Se o livro não existe.
 */
function findBook(state, folderName) {
  const books = state.bookList || [];
  if (!folderName) {
    const current = books.find(
      (b) => normalizePath(b.fullPath) === normalizePath(state.currentBookPath),
    );
    if (!current) throw new Error("Nenhum livro selecionado.");
    return current;
  }
  const found = books.find(
    (b) => String(b.folderName).toLowerCase() === folderName.toLowerCase(),
  );
  if (!found) {
    throw new Error(
      `Livro "${folderName}" não encontrado. Disponíveis: ${books.map((b) => b.folderName).join(", ") || "(nenhum)"}`,
    );
  }
  return found;
}

/**
 * Registra as ferramentas de projeto e de configuração consultável.
 * @param {import('./registry.js').ToolRegistry} registry
 */
export function registerProjectTools(registry) {
  registry.register({
    name: "toggle_advanced_files",
    description:
      "Liga ou desliga a exibição dos arquivos avançados (índices e arquivos técnicos) no explorer do livro atual, como o botão de olho do explorer. É só uma preferência de visualização do autor (salva no config.json do livro).",
    parameters: {
      type: "object",
      properties: {
        enabled: {
          type: "boolean",
          description:
            "true mostra os arquivos avançados; false oculta. Se omitido, alterna o estado atual.",
        },
      },
    },
    async execute({ enabled }, ctx) {
      const book = findBook(ctx.state);
      book.explorer_state = book.explorer_state || {};
      const next =
        typeof enabled === "boolean"
          ? enabled
          : !book.explorer_state.advanced_mode;
      book.explorer_state.advanced_mode = next;
      await ctx.bookService.updateConfig(book.fullPath);
      uiBus.emit("explorer:advanced-changed", { enabled: next });
      return next
        ? "Arquivos avançados agora estão visíveis no explorer."
        : "Arquivos avançados agora estão ocultos no explorer.";
    },
  });

  registry.register({
    name: "get_book_config",
    description:
      "Lê o config.json de um livro (título, bloqueio da IA, estado do explorer). Sem parâmetros, lê o do livro atual. Informe `book` (nome da pasta) para ler o de outro livro. Somente leitura.",
    parameters: {
      type: "object",
      properties: {
        book: {
          type: "string",
          description:
            "Nome da pasta do livro (ex.: book_001). Omita para o livro atual.",
        },
      },
    },
    async execute({ book }, ctx) {
      const item = findBook(ctx.state, book);
      const text = await window.electronAPI.readFile(
        `${normalizePath(item.fullPath)}/config.json`,
      );
      if (text === null) throw new Error("O config.json do livro não existe.");
      let config;
      try {
        config = JSON.parse(text);
      } catch {
        throw new Error("O config.json do livro está inválido.");
      }
      return { folder: item.folderName, config };
    },
  });

  registry.register({
    name: "list_ai_models",
    description:
      "Lista os provedores e modelos de IA do app: quais estão configurados para funcionar (têm chave de API ou não precisam dela), qual está ativo e o modelo escolhido em cada um. A chave de API nunca é exibida. Somente leitura.",
    parameters: { type: "object", properties: {} },
    async execute(_args, ctx) {
      const settings = ctx.state.aiSettings || {};
      const providerInfo = (id) => AI_PROVIDERS.find((p) => p.id === id);

      // Cada conta de IA do autor (apelido, provedor, modelo); a chave nunca é exibida
      const accounts = (settings.accounts || []).map((a) => ({
        account: a.nickname,
        provider: a.provider,
        configured: !providerInfo(a.provider)?.requiresKey || Boolean(String(a.apiKey || "").trim()),
        active: a.id === settings.activeAccount,
        selectedModel: a.model || providerInfo(a.provider)?.defaultModel,
      }));
      const catalog = AI_PROVIDERS.map((provider) => {
        const fetched = ctx.state.aiModels?.[provider.id];
        return {
          provider: provider.id,
          label: provider.label,
          models: (fetched?.length ? fetched : provider.models).map((m) => ({ id: m.id, label: m.label })),
        };
      });
      return { accounts, catalog };
    },
  });
}
