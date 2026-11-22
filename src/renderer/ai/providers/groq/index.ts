/**
 * @file Provedor Groq (API compatível com a OpenAI).
 */

import { createCompatProvider } from "../openaiCompat.js";

export const GROQ_URL = "https://api.groq.com/openai/v1";

export const { sendRequest, listModels } = createCompatProvider({ id: "groq", label: "Groq", baseUrl: GROQ_URL });
