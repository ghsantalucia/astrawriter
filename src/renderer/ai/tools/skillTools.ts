/**
 * @file Ferramenta que carrega skills (instruções) sob demanda.
 */

import { getSkill, listSkills } from "../skills/index.js";
import { uiBus } from "../../events/uiBus.js";
import { TRIGGERS } from "../../services/skillService.js";
import { toolRegistry } from "../aiTools.js";

/**
 * @param {import('./registry.js').ToolRegistry} registry
 */
export function registerSkillTools(registry) {
  registry.register({
    name: "load_skill",
    description:
      "Carrega as instruções completas de uma skill listada no contexto. Use antes de executar a tarefa correspondente.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome da skill." },
      },
      required: ["name"],
    },
    async execute({ name }) {
      const skill = getSkill(name);
      if (!skill) {
        const names = listSkills()
          .map((s) => s.name)
          .join(", ");
        throw new Error(`Skill "${name}" não existe. Disponíveis: ${names}`);
      }
      return skill.body;
    },
  });

  registry.register({
    name: "propose_skill",
    description:
      "Prepara uma NOVA skill e abre o formulário de criação já preenchido para o autor revisar e apertar \"Criar skill\" (você nunca cria a skill sozinha). ANTES de chamar, entreviste o autor em poucas perguntas: o objetivo, quando deve rodar (sob demanda ou em gatilhos), o que ela deve ler/alterar e peça 1 ou 2 exemplos de entrada e do resultado esperado para entender o padrão. Só chame quando entender bem o pedido. O texto das instruções deve ser detalhado (passo a passo, regras, o que NÃO fazer). Se a skill precisa de dados do autor a cada execução (ex.: nome de um autor, amostras), liste-os em 'inputs'.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Nome da skill (ex.: Revisar diálogos)." },
        name: { type: "string", description: "Identificador: minúsculas e hífens, 3 a 40 caracteres (ex.: revisar-dialogos)." },
        description: { type: "string", description: "Quando a IA deve usar a skill (uma frase)." },
        details: { type: "string", description: "Descrição completa em Markdown para a página da skill." },
        instructions: { type: "string", description: "Instruções completas que a IA seguirá ao executar (Markdown, passo a passo)." },
        kind: { type: "string", enum: ["once", "recurring"], description: "once = só quando o autor manda; recurring = nos gatilhos." },
        triggers: { type: "array", items: { type: "string" }, description: "Gatilhos (só para recurring), ex.: chapter-sync, created:character, deleted:event, sync." },
        tools: { type: "array", items: { type: "string" }, description: "Tools que a skill pode usar (o mínimo necessário)." },
        tags: { type: "array", items: { type: "string" } },
        inputs: { type: "array", items: { type: "string" }, description: "Perguntas que a skill faz ao autor antes de executar (uma janela com um campo por item)." },
        web: { type: "boolean", description: "true se a skill precisa pesquisar na internet (busca nativa do provedor)." },
        optimize: { type: "boolean", description: "Otimizar (compactar) as instruções nos perfis econômicos. Use false se a skill contém amostras de escrita ou textos exatos." },
      },
      required: ["title", "name", "description", "instructions"],
    },
    async execute(args) {
      const slug = String(args.name || "").trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) throw new Error("O identificador deve ter de 3 a 40 caracteres: letras minúsculas, números e hífens.");
      const known = new Set(toolRegistry.getDefinitions().map((d) => d.name));
      const tools = (args.tools || []).filter((t) => known.has(t));
      const triggers = (args.triggers || []).filter((t) => TRIGGERS.has(t));
      uiBus.emit("skills:propose", {
        title: String(args.title).trim(),
        slug,
        description: String(args.description).trim(),
        details: String(args.details || "").trim(),
        body: String(args.instructions).trim(),
        kind: args.kind === "recurring" ? "recurring" : "once",
        triggers: args.kind === "recurring" ? triggers : [],
        tools,
        tags: (args.tags || []).map(String),
        inputs: (args.inputs || []).map(String).filter(Boolean),
        compact: args.optimize !== false,
        web: args.web === true,
      });
      return `Formulário aberto na Central de IA → Skills, preenchido com a skill "${args.title}". Diga ao autor para revisar os campos e apertar "Criar skill". Tools ignoradas por não existirem: ${(args.tools || []).filter((t) => !known.has(t)).join(", ") || "nenhuma"}.`;
    },
  });
}
