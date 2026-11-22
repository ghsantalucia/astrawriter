import { test, expect } from "@playwright/test";
import { launchApp } from "./helpers/launch.mjs";

let app;
test.beforeAll(async () => {
  app = await launchApp();
});
test.afterAll(async () => {
  await app?.close();
});

test("o app abre com a interface principal e o título correto", async () => {
  const { page } = app;
  await expect(page).toHaveTitle("Astra Writer");
  await expect(page.locator("#book-dropdown-container")).toBeVisible();
  await expect(page.locator("#chat-container")).toBeVisible();
  await expect(page.locator("#editor-container")).toBeVisible();
});

test("a gaveta de configurações abre e fecha", async () => {
  const { page } = app;
  const drawer = page.locator("#settings-container");
  await expect(drawer).not.toHaveClass(/open/);
  await page.locator("#btn-open-menu").click();
  await expect(drawer).toHaveClass(/open/);
  await page.locator("#btn-close-menu").click();
  await expect(drawer).not.toHaveClass(/open/);
});
