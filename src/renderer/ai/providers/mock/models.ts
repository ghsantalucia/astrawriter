/**
 * @file Modelo único do provedor Mock (a janela de contexto é fictícia, para testar o indicador de tokens).
 */

import { t } from "../../../../shared/i18n.js";

export const MOCK_MODELS = [
  { id: "mock-1", label: t("Assistente básico (sem IA)"), contextWindow: 20000 },
];

export const MOCK_DEFAULT_MODEL = "mock-1";
