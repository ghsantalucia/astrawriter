// @ts-nocheck
/**
 * @file Provedor Compatível com OpenAI (API compatível com a OpenAI).
 */

import { createCompatProvider } from "../openaiCompat.js";

export const COMPAT_URL = "";

export const { sendRequest, listModels } = createCompatProvider({ id: "compat", label: "Servidor compatível", baseUrl: COMPAT_URL });
