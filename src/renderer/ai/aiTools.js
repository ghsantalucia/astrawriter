/**
 * @file Define as ferramentas, funções auxiliares e utilitários integrados para uso dos modelos de Inteligência Artificial.
 * Para adicionar uma ferramenta, crie um módulo em /ai/tools com `registerXTools(registry)` e chame-o aqui.
 * IMPORTANTE: toda tool nova (ou alterada) deve ser documentada em docs/ai-tools.md.
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

export const toolRegistry = new ToolRegistry();

registerBookTools(toolRegistry);
registerSkillTools(toolRegistry);
registerCreationTools(toolRegistry);
registerChatTools(toolRegistry);
registerStructureTools(toolRegistry);
registerVariableTools(toolRegistry);
registerHistoryTools(toolRegistry);
registerProjectTools(toolRegistry);
