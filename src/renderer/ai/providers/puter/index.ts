// @ts-nocheck
/**
 * @file Provedor Puter (API compatível com a OpenAI).
 */

import { createCompatProvider } from "../openaiCompat.js";

export const PUTER_URL = "https://api.puter.com/puterai/openai/v1";

export const { sendRequest, listModels } = createCompatProvider({ id: "puter", label: "Puter", baseUrl: PUTER_URL });
