/**
 * @file Abre o Astra Writer (modo desenvolvimento, via Electron Forge) com uma pasta de dados ISOLADA e conecta o Playwright pelo
 * protocolo de depuração do Chromium. Os testes nunca tocam nos livros e nas chaves reais do usuário (`ASTRA_DATA_DIR`).
 */
import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
let nextPort = 9600 + Math.floor(Math.random() * 200);

/** Copia uma pasta inteira (usada para semear o livro de teste). */
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(source, target);
    else fs.copyFileSync(source, target);
  }
}

/**
 * Cria a pasta de dados isolada com um livro de teste (a partir do modelo do app).
 * @param {{books?: boolean}} [opts] - `books: false` deixa a biblioteca vazia.
 * @returns {{dataDir: string, bookDir: string|null}}
 */
export function seedData({ books = true } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-e2e-"));
  fs.mkdirSync(path.join(dataDir, "books"), { recursive: true });
  let bookDir = null;
  if (books) {
    bookDir = path.join(dataDir, "books", "book_001");
    copyDir(path.join(ROOT, "templates", "book"), bookDir);
    const config = JSON.parse(fs.readFileSync(path.join(bookDir, "config.json"), "utf8"));
    config.book_title = "Livro de Teste";
    fs.writeFileSync(path.join(bookDir, "config.json"), JSON.stringify(config, null, 2));
    fs.writeFileSync(
      path.join(bookDir, "content", "chapter_001", "2_draft.md"),
      "---\ntitle: Manuscrito\nhumanRead: true\nhumanWrite: true\naiRead: true\naiWrite: true\nadvanced: false\n---\nAna chegou ao porto de Eldoria ao amanhecer.\n",
    );
  }
  return { dataDir, bookDir };
}

/**
 * Abre o app e conecta o Playwright.
 * @param {{books?: boolean, dataDir?: string, keepData?: boolean}} [opts] - Semente de dados; `dataDir` reabre dados existentes; `keepData` preserva a pasta ao fechar.
 * @returns {Promise<{page: import('@playwright/test').Page, dataDir: string, bookDir: string|null, close: () => Promise<void>}>}
 */
export async function launchApp(opts = {}) {
  // `dataDir` existente: reabre o app sobre os mesmos dados (não semeia nem apaga a pasta ao fechar)
  const reuse = Boolean(opts.dataDir);
  const { dataDir, bookDir } = reuse ? { dataDir: opts.dataDir, bookDir: path.join(opts.dataDir, "books", "book_001") } : seedData(opts);
  const port = nextPort++;
  const child = spawn(`npx electron-forge start -- --remote-debugging-port=${port}`, {
    cwd: ROOT,
    shell: true,
    stdio: "ignore",
    env: { ...process.env, ASTRA_DATA_DIR: dataDir, ASTRA_HIDDEN: process.env.ASTRA_E2E_VISIBLE ? "0" : "1", NODE_ENV: "development" },
  });

  const kill = () => {
    if (child.pid) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  };

  // Espera o Chromium abrir a porta de depuração (o Forge compila antes)
  const deadline = Date.now() + 120000;
  let browser = null;
  while (Date.now() < deadline && !browser) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!browser) {
    kill();
    throw new Error("O app não abriu a tempo (porta de depuração indisponível).");
  }

  // Espera a janela principal (a página do app)
  let page = null;
  while (Date.now() < deadline && !page) {
    page = browser.contexts().flatMap((c) => c.pages()).find((p) => !p.url().startsWith("devtools://")) || null;
    if (!page) await new Promise((r) => setTimeout(r, 500));
  }
  if (!page) {
    kill();
    throw new Error("A janela do app não apareceu.");
  }
  await page.waitForLoadState("domcontentloaded");

  return {
    page,
    dataDir,
    bookDir,
    /**
     * Fecha o app. `graceful: true` pede ao app para fechar a janela (grava localStorage e configurações como num fechamento
     * normal); sem isso, o processo é encerrado à força.
     * @param {{graceful?: boolean}} [closeOpts]
     */
    async close(closeOpts = {}) {
      if (closeOpts.graceful) {
        const exited = new Promise((resolve) => child.once("exit", resolve));
        await page.evaluate(() => window.close()).catch(() => {});
        await Promise.race([exited, new Promise((r) => setTimeout(r, 10000))]);
      }
      try {
        await browser.close();
      } catch {
        // já fechado
      }
      kill();
      await new Promise((r) => setTimeout(r, 1500));
      if (!reuse && !opts.keepData) fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
