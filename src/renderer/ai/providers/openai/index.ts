/**
 * @file Provedor ChatGPT (OpenAI) (API compatível com a OpenAI).
 */

import { createCompatProvider } from "../openaiCompat.js";

export const OPENAI_URL = "https://api.openai.com/v1";

export const { sendRequest, listModels } = createCompatProvider({ id: "openai", label: "ChatGPT (OpenAI)", baseUrl: OPENAI_URL });
