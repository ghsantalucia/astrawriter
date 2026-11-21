// @ts-nocheck
// Migração JS → TS: o arquivo já é TypeScript, mas ainda não está tipado. Ao tipá-lo, remova a linha acima.
/**
 * @file Define as ferramentas, funções auxiliares e utilitários integrados para uso dos modelos de Inteligência Artificial.
 * Para adicionar uma ferramenta, crie um módulo em /ai/tools com `registerXTools(registry)` e chame-o aqui.
 * IMPORTANTE: toda tool nova (ou alterada) deve ser documentada em docs/ai/ai-tools.md.
 */

import { ToolRegistry } from "./tools/registry.js";
import { registerBookTools } from "./tools/bookTools.js";
import { registerSkillTools } from "./tools/skillTools.js";
import { registerCreationTools } from "./tools/creationTools.js";
import { registerChatTools } from "./tools/chatTools.js";
import { registerStructureTools } from "./tools/structureTools.js";
import { registerVariableTools } from "./tools/variableTools.js";
import { registerHistoryTools } from "./tools/historyTools.js";
import { registerProjectTools } from "./tools/projectTools.js";
import { registerIssueTools } from "./tools/issueTools.js";
import { registerEventTools } from "./tools/eventTools.js";
import { registerDigestTools } from "./tools/digestTools.js";
import { registerSystemTools } from "./tools/systemTools.js";

export const toolRegistry = new ToolRegistry();

registerBookTools(toolRegistry);
registerSkillTools(toolRegistry);
registerCreationTools(toolRegistry);
registerChatTools(toolRegistry);
registerStructureTools(toolRegistry);
registerVariableTools(toolRegistry);
registerHistoryTools(toolRegistry);
registerProjectTools(toolRegistry);
registerIssueTools(toolRegistry);
registerEventTools(toolRegistry);
registerDigestTools(toolRegistry);
registerSystemTools(toolRegistry);

/** Modo "apenas conversa": só as tools internas do chat (botões de resposta pronta), sem acesso aos arquivos do livro. */
export const chatOnlyRegistry = new ToolRegistry();
registerChatTools(chatOnlyRegistry);
