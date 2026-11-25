/**
 * @file Simulação de tool calling para modelos que não têm suporte nativo (muitos modelos locais). O sistema ensina o
 * formato no prompt, lê os pedidos de tool no texto da resposta e devolve os resultados como mensagens comuns; o laço
 * (`runToolLoop`) e as tools são exatamente os mesmos do tool calling nativo.
 */

/**
 * Resumo de uma tool em uma linha (nome, parâmetros e descrição curta).
 * @param {{name: string, description: string, parameters: Object}} tool - Definição.
 * @returns {string}
 */
function describeTool(tool) {
  const props = tool.parameters?.properties || {};
  const required = new Set(tool.parameters?.required || []);
  const params = Object.entries(props)
    .map(([key, schema]: [string, any]) => `${key}${required.has(key) ? "" : "?"}: ${schema.type || "any"}`)
    .join(", ");
  const description = String(tool.description || "").replace(/\s+/g, " ").slice(0, 220);
  return `- ${tool.name}(${params}) — ${description}`;
}

/**
 * Trecho extra do prompt de sistema que ensina o modelo a pedir tools por texto.
 * @param {Array<{name: string, description: string, parameters: Object}>} definitions - Tools disponíveis.
 * @returns {string}
 */
export function buildSimulatedToolsPrompt(definitions) {
  if (!definitions.length) return "";
  return `

# Ferramentas (modo simulado)
Você pode usar ferramentas. Para usar uma, responda APENAS com um bloco neste formato exato (um bloco por ferramenta, sem texto depois):

<tool_call>
{"name": "nome_da_ferramenta", "arguments": {"parametro": "valor"}}
</tool_call>

O sistema executa a ferramenta e responde com uma mensagem começando por "[Resultado de nome_da_ferramenta]". Só então continue. Quando não precisar de mais ferramentas, responda normalmente, em texto, sem nenhum bloco <tool_call>.

Ferramentas disponíveis (nome(parâmetros) — descrição; "?" indica parâmetro opcional):
${definitions.map(describeTool).join("\n")}`;
}

/**
 * Lê do texto da resposta os pedidos de tool e devolve o texto restante.
 * Aceita `<tool_call>{...}</tool_call>` e blocos de código ```tool_call / ```json com `{"name": ...}`.
 * @param {string} text - Resposta crua do modelo.
 * @returns {{text: string, toolCalls: Array<{id: string, name: string, args: Object}>}}
 */
export function parseSimulatedCalls(text) {
  const toolCalls = [];
  let rest = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "");

  const take = (raw) => {
    try {
      const data = JSON.parse(raw.trim());
      const name = data.name || data.tool || data.function;
      if (typeof name !== "string") return false;
      const args = data.arguments ?? data.args ?? data.parameters ?? {};
      toolCalls.push({
        id: `sim-${Date.now().toString(36)}-${toolCalls.length}`,
        name,
        args: typeof args === "string" ? JSON.parse(args) : args,
      });
      return true;
    } catch {
      return false;
    }
  };

  rest = rest.replace(/<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/gi, (whole, body) => (take(body) ? "" : whole));
  rest = rest.replace(/```(?:tool_call|json)?\s*(\{[\s\S]*?\})\s*```/gi, (whole, body) =>
    /"name"\s*:/.test(body) && /"(arguments|args|parameters)"\s*:/.test(body) && take(body) ? "" : whole,
  );
  return { text: rest.trim(), toolCalls };
}

/**
 * Mensagem (papel "user") que devolve ao modelo o resultado de uma tool no modo simulado.
 * @param {Array<{call: Object, output: string, isError: boolean}>} results - Resultados.
 * @returns {string}
 */
export function formatSimulatedResults(results) {
  return results
    .map((r) => `[Resultado de ${r.call.name}${r.isError ? " (erro)" : ""}]\n${r.output}`)
    .join("\n\n");
}

/** Combinações (endereço + modelo) em que o modo automático já descobriu que não há tool calling nativo. */
const noNativeTools = new Set();

/**
 * Marca (ou consulta) se um modelo precisa do modo simulado.
 * @param {string} key - Chave `endereço|modelo`.
 * @param {boolean} [mark] - Se verdadeiro, registra o modelo como sem suporte nativo.
 * @returns {boolean}
 */
export function needsSimulation(key, mark = false) {
  if (mark) noNativeTools.add(key);
  return noNativeTools.has(key);
}

/**
 * Indica se o erro parece ser a recusa do envio de `tools` (modelo sem suporte).
 * @param {Error & {status?: number}} error - Erro da requisição.
 * @returns {boolean}
 */
export function looksLikeNoToolSupport(error) {
  return (
    [400, 404, 422, 501].includes(error?.status) && /tool|function|does not support/i.test(String(error?.message || ""))
  );
}
