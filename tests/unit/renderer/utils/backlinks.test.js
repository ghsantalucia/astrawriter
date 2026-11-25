import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { citationsOf, invalidateBacklinks } from "../../../../src/renderer/utils/backlinks";
import { uiBus } from "../../../../src/renderer/events/uiBus";
import { domainBus } from "../../../../src/renderer/events/domainBus";

const LIVRO = "C:/livros/book_1";
const arquivo = (rel, content, metadata = {}) => ({ originalPath: `${LIVRO}/${rel}`, metadata, content });

let conteudos;
let tree;
let api;

function monta(lista) {
  conteudos = new Map(lista.map((f) => [`${LIVRO}/${f.rel}`, f.content]));
  tree = { files: Object.fromEntries(lista.map((f, i) => [`k${i}`, { originalPath: `${LIVRO}/${f.rel}`, metadata: f.metadata || { title: f.title || f.rel } }])), folders: {} };
}

beforeEach(() => {
  invalidateBacklinks();
  api = {
    getTree: vi.fn(async () => tree),
    readFile: vi.fn(async (p) => conteudos.get(p) ?? null),
  };
  window.electronAPI = api;
});
afterEach(() => {
  delete window.electronAPI;
});

describe("backlinks.citationsOf", () => {
  it("sem livro ou sem caminho devolve vazio sem consultar", async () => {
    expect(await citationsOf("", "a.md")).toEqual([]);
    expect(await citationsOf(LIVRO, "")).toEqual([]);
    expect(api.getTree).not.toHaveBeenCalled();
  });
  it("acha os arquivos que citam o alvo, com o parágrafo e o texto do link", async () => {
    monta([
      { rel: "assets/characters/ana.md", content: "---\ntitle: Ana\n---\n# Ana", title: "Ana" },
      { rel: "content/chapter_001/2_draft.md", content: "---\ntitle: Cap\n---\nPrimeiro parágrafo.\n\nAqui [Ana](/assets/characters/ana.md) apareceu.\n\nFim.", title: "Capítulo 1" },
    ]);
    const r = await citationsOf(LIVRO, "assets/characters/ana.md");
    expect(r).toEqual([{ rel: "content/chapter_001/2_draft.md", title: "Capítulo 1", paragraph: "Aqui [Ana](/assets/characters/ana.md) apareceu.", label: "Ana", occurrence: 0 }]);
  });
  it("normaliza o alvo pedido (barra inicial, barras invertidas e caixa)", async () => {
    monta([{ rel: "n.md", content: "[x](assets/a.md)" }]);
    expect(await citationsOf(LIVRO, "/Assets\\A.md")).toHaveLength(1);
  });
  it("ocorrências do mesmo texto de link são numeradas; links com título e fragmento funcionam", async () => {
    monta([{ rel: "n.md", content: 'a [Ana](assets/a.md) e [Ana](/assets/a.md#auto) e [Ana](assets/a.md "dica")' }]);
    const r = await citationsOf(LIVRO, "assets/a.md");
    expect(r.map((c) => c.occurrence)).toEqual([0, 1, 2]);
  });
  it("decodifica %20 e ignora links externos, âncoras e não-.md", async () => {
    monta([{ rel: "n.md", content: "[a](assets/meu%20arq.md) [b](https://x.com/a.md) [c](#sec) [d](assets/foto.png) [e](mailto:a@b.md)" }]);
    expect(await citationsOf(LIVRO, "assets/meu arq.md")).toHaveLength(1);
    expect(await citationsOf(LIVRO, "assets/foto.png")).toEqual([]);
    expect(await citationsOf(LIVRO, "a.md")).toEqual([]);
  });
  it("um arquivo não conta citação a si mesmo", async () => {
    monta([{ rel: "assets/a.md", content: "[eu](assets/a.md)" }]);
    expect(await citationsOf(LIVRO, "assets/a.md")).toEqual([]);
  });
  it("índices e linha do tempo não contam como citações", async () => {
    monta([
      { rel: "assets/characters/index.md", content: "- [Ana](assets/characters/ana.md)" },
      { rel: "assets/events/timeline.md", content: "1. [Ana](assets/characters/ana.md)" },
      { rel: "n.md", content: "[Ana](assets/characters/ana.md)" },
    ]);
    const r = await citationsOf(LIVRO, "assets/characters/ana.md");
    expect(r.map((c) => c.rel)).toEqual(["n.md"]);
  });
  it("o frontmatter não conta como parágrafo de citação", async () => {
    monta([{ rel: "n.md", content: "---\nref: \"[x](assets/a.md)\"\n---\ntexto [y](assets/a.md)" }]);
    const r = await citationsOf(LIVRO, "assets/a.md");
    expect(r).toHaveLength(1);
    expect(r[0].paragraph).toBe("texto [y](assets/a.md)");
  });
  it("monta o índice uma vez por livro (cache) e reconstrói após invalidar", async () => {
    monta([{ rel: "n.md", content: "[x](assets/a.md)" }]);
    await citationsOf(LIVRO, "assets/a.md");
    await citationsOf(LIVRO, "assets/b.md");
    expect(api.getTree).toHaveBeenCalledTimes(1);
    invalidateBacklinks();
    await citationsOf(LIVRO, "assets/a.md");
    expect(api.getTree).toHaveBeenCalledTimes(2);
  });
  it("eventos da interface e do domínio invalidam o cache", async () => {
    monta([{ rel: "n.md", content: "[x](assets/a.md)" }]);
    await citationsOf(LIVRO, "assets/a.md");
    uiBus.emit("sync:completed");
    await citationsOf(LIVRO, "assets/a.md");
    expect(api.getTree).toHaveBeenCalledTimes(2);
    domainBus.emit("file:created", {});
    await citationsOf(LIVRO, "assets/a.md");
    expect(api.getTree).toHaveBeenCalledTimes(3);
  });
  it("erro ao montar o índice resulta em lista vazia", async () => {
    api.getTree.mockRejectedValue(new Error("falhou"));
    expect(await citationsOf(LIVRO, "assets/a.md")).toEqual([]);
  });
  it("arquivos vazios ou sem leitura são pulados", async () => {
    monta([{ rel: "vazio.md", content: "" }, { rel: "ok.md", content: "[x](assets/a.md)" }]);
    const r = await citationsOf(LIVRO, "assets/a.md");
    expect(r.map((c) => c.rel)).toEqual(["ok.md"]);
  });
});
