// @ts-check
import { defineConfig } from "@playwright/test";

/**
 * Testes E2E do Astra Writer. Cada arquivo `*.spec.js` abre o app (modo desenvolvimento, via Electron Forge) com uma pasta de
 * dados isolada (`ASTRA_DATA_DIR`) e o controla pelo Playwright (ver tests/e2e/helpers/launch.mjs). Rode com `npm run test:e2e`.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.js$/,
  timeout: 90 * 1000,
  expect: { timeout: 10 * 1000 },
  // Um app por vez: o Forge usa portas fixas do Vite
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  outputDir: "tests/reports/playwright/test-results",
  reporter: [["list"], ["html", { outputFolder: "tests/reports/playwright/html", open: "never" }]],
  use: { trace: "retain-on-failure" },
});
