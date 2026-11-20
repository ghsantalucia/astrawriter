// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Assistente embutido do Astra (provedor interno "mock"). Não é uma IA: não chama nenhuma API e responde de forma
 * determinística, por comandos. É o provedor que sempre existe (não pode ser removido), para o chat nunca ficar sem resposta:
 * na primeira mensagem de cada sessão ele se apresenta com uma citação de escritor, explica que não é uma IA de verdade e
 * oferece instalar uma IA real ou ver o que sabe fazer. Também permite exercitar tool calling, travas e revisão de
 * rascunhos por comandos.
 *
 * Comandos (digite no chat):
 *   /ajuda                                 lista os comandos
 *   /listar                                chama list_files
 *   /ler <caminho>                         chama read_file
 *   /anexar <caminho> | <texto>            chama append_to_file
 *   /substituir <caminho> | <de> | <para>  chama replace_in_file
 *   /escrever <caminho> | <conteúdo>       chama write_file
 *   /botoes                                chama show_buttons (respostas prontas e ações do app)
 *   /iniciar <tipo> [| <pasta>]            chama start_creation (book, chapter, entity, note)
 *   /criar <tipo> | <pasta> | campo=valor;… chama complete_creation (pasta vazia fora de fichas)
 *   /tool <nome> | <json>                  chama QUALQUER tool com os argumentos em JSON (ex.: /tool move_file | {"path":"notes/note_001.md","destination":"notes/ideias"})
 *   /lento                                 demora 6s (testa o indicador de carregamento)
 *   /erro                                  lança um erro (testa o tratamento de falhas)
 * Qualquer outro texto recebe uma resposta em Markdown.
 *
 * Análises em segundo plano (digest de arquivo e verificação de contradições) recebem JSON determinístico: o digest extrai
 * frases no formato "Nome tem olhos azuis." e "Nome tem 20 anos."; a verificação sempre responde "conflict".
 */

import { runToolLoop } from "../../toolLoop.js";
import { randomQuote } from "./quotes.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const HELP = `**Assistente Astra (sem IA)** — eu não sou uma IA de verdade: respondo a comandos. Para conversar de verdade, conecte uma IA na **Central de IA → Contas e modelo**.

Comandos que eu entendo:

- \`/ajuda\`: esta lista
- \`/listar\`
- \`/ler <caminho>\`
- \`/anexar <caminho> | <texto>\`
- \`/substituir <caminho> | <de> | <para>\`
- \`/escrever <caminho> | <conteúdo>\`
- \`/botoes\`
- \`/iniciar <tipo> [| <pasta>]\` (book, chapter, entity, note)
- \`/criar <tipo> | <pasta> | campo=valor;campo=valor\`
- \`/tool <nome> | <json>\` (chama qualquer tool; args em JSON)
- \`/lento\` e \`/erro\`

Mesmo sem IA você pode mexer no livro por estes comandos (ficam mais trabalhosos que pedir em português a uma IA de verdade).`;

/** Botões da apresentação: instalar uma IA de verdade ou ver o que o assistente sabe fazer. */
const WELCOME_BUTTONS = [
  { label: "Conectar uma IA de verdade", action: "open-central", central: "ai", tab: "model" },
  { label: "Ver o que você sabe fazer", reply: "/ajuda" },
];

/**
 * Apresentação do assistente (primeira mensagem de cada sessão): uma citação sorteada e o aviso de que não é uma IA.
 * @returns {string}
 */
function welcomeText() {
  const quote = randomQuote();
  return [
    `> “${quote.text}”`,
    `> — *${quote.author}*`,
    "",
    "Olá! Eu sou o **assistente embutido do Astra Writer**. Ainda **não sou uma IA de verdade**: não converso nem escrevo textos, só respondo a comandos simples (digite \`/ajuda\` para vê-los).",
    "",
    "Para ter uma IA que lê o seu livro, sugere e escreve com você, conecte uma na **Central de IA** (Gemini, Claude, ChatGPT, Groq ou um modelo local no seu computador).",
  ].join("\n");
}

/** @returns {boolean} A conversa ainda não tem nenhuma resposta do assistente (primeira mensagem da sessão)? */
function isFirstOfSession(history) {
  return !(history || []).some((m) => m.role === "assistant" && !m.error);
}

/** Estima tokens (~4 caracteres por token). */
const estimateTokens = (text) => Math.ceil((text || "").length / 4);

/**
 * Converte o prompt em um plano: uma chamada de ferramenta ou uma resposta direta.
 * @param {string} prompt
 * @returns {{tool?: {name: string, args: Object}, reply?: string, delay?: number, fail?: boolean}}
 */
function parseCommand(prompt) {
  const [command, ...rest] = prompt.trim().split(/\s+/);
  const args = prompt.trim().slice(command.length).trim();
  const parts = args.split("|").map((p) => p.trim());

  switch (command) {
    case "/ajuda":
      return { reply: HELP };
    case "/listar":
      return { tool: { name: "list_files", args: {} } };
    case "/ler":
      return { tool: { name: "read_file", args: { path: args } } };
    case "/anexar":
      return {
        tool: {
          name: "append_to_file",
          args: { path: parts[0], text: parts[1] },
        },
      };
    case "/substituir":
      return {
        tool: {
          name: "replace_in_file",
          args: { path: parts[0], old_text: parts[1], new_text: parts[2] },
        },
      };
    case "/escrever":
      return {
        tool: {
          name: "write_file",
          args: { path: parts[0], content: parts[1] },
        },
      };
    case "/botoes":
      return {
        tool: {
          name: "show_buttons",
          args: {
            buttons: [
              { label: "Sim, continue", reply: "Sim, pode continuar." },
              { label: "Não, obrigado" },
              { label: "Sincronizar", action: "open-sync" },
              { label: "Novo capítulo", action: "new-chapter" },
              { label: "Variáveis", action: "edit-variables" },
            ],
          },
        },
        reply: "Escolha uma opção (botões de teste do provedor Mock):",
      };
    case "/iniciar":
      return {
        tool: {
          name: "start_creation",
          args: { kind: parts[0], folder: parts[1] || undefined },
        },
      };
    case "/criar": {
      const answers = (parts[2] || "")
        .split(";")
        .map((pair) => pair.split("="))
        .filter(([field]) => field?.trim())
        .map(([field, ...value]) => ({
          field: field.trim(),
          value: value.join("=").trim(),
        }));
      return {
        tool: {
          name: "complete_creation",
          args: { kind: parts[0], folder: parts[1] || undefined, answers },
        },
      };
    }
    case "/tool": {
      let toolArgs = {};
      try {
        toolArgs = parts[1]
          ? JSON.parse(args.slice(args.indexOf("|") + 1))
          : {};
      } catch {
        return { reply: "JSON inválido nos argumentos de `/tool`." };
      }
      return { tool: { name: parts[0], args: toolArgs } };
    }
    case "/lento":
      return {
        delay: 6000,
        reply: "Terminei de **pensar** (resposta lenta simulada).",
      };
    case "/erro":
      return { fail: true };
    default:
      return {
        tool: { name: "show_buttons", args: { buttons: WELCOME_BUTTONS } },
        reply: [
          "Não entendi. Eu **não sou uma IA de verdade**, só respondo a comandos (como `/ajuda`).",
          "",
          "Para conversar em português, conecte uma IA na **Central de IA**.",
        ].join("\n"),
      };
  }
}

/**
 * Formata o resultado das ferramentas como resposta final em Markdown.
 * @param {Array<{call: Object, output: string, isError: boolean}>} results
 */
function formatResults(results) {
  return results
    .map(({ call, output, isError }) =>
      isError
        ? `❌ **${call.name}** falhou: ${output}`
        : `✅ **${call.name}**:\n\n\`\`\`\n${output}\n\`\`\``,
    )
    .join("\n\n");
}

/**
 * Simula uma requisição ao provedor, executando ferramentas reais quando o comando pedir.
 * @param {Object} params
 * @param {string} params.prompt
 * @param {string} params.systemPrompt
 * @param {Object} params.toolContext
 * @returns {Promise<{text: string, usage: import("../../toolLoop.js").TokenUsage}>}
 */
export async function sendRequest({ prompt, systemPrompt = "", history = [], toolContext }) {
  await sleep(600);

  // Análises do livro (sem ferramentas): respostas JSON determinísticas para testar o fluxo
  if (/^Você extrai metadados/.test(systemPrompt)) {
    const facts = [];
    for (const m of prompt.matchAll(/(\p{Lu}\p{L}+) tem olhos (\p{L}+)/gu)) {
      facts.push({ entity: m[1], attribute: "cor dos olhos", value: m[2], quote: m[0] });
    }
    for (const m of prompt.matchAll(/(\p{Lu}\p{L}+) tem (\d+) anos/gu)) {
      facts.push({ entity: m[1], attribute: "idade", value: m[2], quote: m[0] });
    }
    const text = JSON.stringify({ summary: "Resumo simulado (Mock).", entities: [], facts, events: [] });
    return { text, usage: { inputTokens: estimateTokens(prompt), outputTokens: estimateTokens(text), contextTokens: 0, requests: 1 } };
  }
  if (/^Você confere se afirmações/.test(systemPrompt)) {
    const text = JSON.stringify({ verdict: "conflict", explanation: "Simulado (Mock): os valores informados não podem ser verdade ao mesmo tempo." });
    return { text, usage: { inputTokens: estimateTokens(prompt), outputTokens: estimateTokens(text), contextTokens: 0, requests: 1 } };
  }

  let plan = parseCommand(prompt);
  // Primeira mensagem da sessão (e não é um comando): apresentação com a citação e os botões
  if (!prompt.trim().startsWith("/") && isFirstOfSession(history)) {
    plan = { tool: { name: "show_buttons", args: { buttons: WELCOME_BUTTONS } }, reply: welcomeText() };
  }
  if (plan.fail) throw new Error("Erro simulado pelo provedor Mock.");
  if (plan.delay) await sleep(plan.delay);

  const inputTokens = estimateTokens(systemPrompt) + estimateTokens(prompt);

  return runToolLoop({
    conversation: { step: 0, results: [] },
    toolContext,

    async callModel(conversation) {
      // Após as ferramentas, simula o tempo de "escrever" a resposta final
      await sleep(conversation.step === 0 ? 300 : 1500);
      if (conversation.step === 0 && plan.tool) {
        return {
          text: "",
          raw: null,
          usage: { input: inputTokens, output: 20 },
          toolCalls: [{ id: "mock-call", ...plan.tool }],
        };
      }
      // Com `reply` definido, ele é o texto final mesmo após a ferramenta (ex.: /botoes)
      const text =
        plan.tool && !plan.reply
          ? formatResults(conversation.results)
          : plan.reply;
      return {
        text,
        raw: null,
        usage: { input: inputTokens, output: estimateTokens(text) },
        toolCalls: [],
      };
    },

    appendToolResults(conversation, _turn, results) {
      conversation.step = 1;
      conversation.results = results;
    },
  });
}
