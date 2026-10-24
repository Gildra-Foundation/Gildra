import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
const base = process.env.AUCTION_QA_URL ?? "http://127.0.0.1:3284";
const output = process.env.AUCTION_QA_OUTPUT ?? "/home/debian/gildra-auction-browser-checks-20261024/browser";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH ?? "/home/debian/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell", args: ["--no-sandbox"] });
const results = [];
const makeRows = (page, market) => Array.from({ length: page === 1 ? 40 : 3 }, (_, i) => ({
  id: (page - 1) * 40 + i + 1, itemId: 100 + i, quantity: i + 1, unitPrice: 123456,
  buyout: market === "realm" ? 123456 * (i + 1) : null, bid: market === "realm" ? 100000 : null,
  timeLeft: "LONG", bonusIds: [101], context: 2, modifiers: [], name: "Тестовый предмет / Test item",
}));
try {
  for (const lang of ["ru", "en"]) for (const width of [320, 390, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: width === 1440 ? "no-preference" : "reduce", timezoneId: "Europe/Warsaw" });
    console.log(`START ${lang}/${width}`);
    const page = await context.newPage(), errors = [];
    let releaseFirst; let gate = new Promise(resolve => { releaseFirst = resolve; });
    let mode = "full", realmMode = "full", delay = 0;
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/wow/auction?**", async route => {
      const q = new URL(route.request().url()).searchParams;
      if (q.get("action") === "realms") return route.fulfill({ status: realmMode === "full" ? 200 : 503, json: realmMode === "full" ? { realms: [{ name: "Гордунни / Gordunni", slug: "gordunni" }, { name: "Silvermoon", slug: "silvermoon" }] } : { error: "upstream_unavailable" } });
      if (gate) await gate;
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (mode === "error") return route.fulfill({ status: 503, json: { error: "upstream_unavailable" } });
      const currentPage = Number(q.get("page") ?? 1), market = q.get("market") ?? "realm";
      return route.fulfill({ json: { rows: mode === "empty" ? [] : makeRows(currentPage, market), total: mode === "empty" ? 0 : 43,
        page: currentPage, pages: mode === "empty" ? 1 : 2, market, sourceUpdatedAt: "2026-10-24T10:00:00Z", fetchedAt: "2026-10-24T10:05:00Z", stale: mode === "stale", searchTruncated: mode === "partial", connectedRealmId: market === "realm" ? 1602 : null } });
    });
    const prefix = lang === "ru" ? "/ru" : "";
    await page.goto(`${base}${prefix}/wow/auction`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const title = lang === "ru" ? "Аукцион" : "Auction House", show = lang === "ru" ? "Показать лоты" : "Show auctions";
    await page.getByRole("heading", { name: title, exact: true }).waitFor();
    await page.locator("#auction-realm").selectOption("gordunni");
    await page.locator("#auction-item").fill("100");
    delay = 0;
    await page.getByRole("button", { name: show, exact: true }).click();
    await page.getByText(lang === "ru" ? "Загружаем лоты…" : "Loading auctions…", { exact: true }).first().waitFor();
    gate = null; releaseFirst();
    await page.locator("tbody tr").first().waitFor(); delay = 0;
    assert.equal(await page.locator("tbody tr").count(), 40);
    assert(new URL(page.url()).searchParams.get("realm") === "gordunni");
    await page.getByRole("button", { name: lang === "ru" ? "Далее" : "Next", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 3);
    await page.waitForFunction(() => document.activeElement?.getAttribute("tabindex") === "-1");
    assert.equal(new URL(page.url()).searchParams.get("page"), "2");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 3);
    await page.locator("#auction-market").selectOption("commodities");
    assert.equal(await page.locator("tbody").count(), 0, "old-market listings cleared");
    await page.getByRole("button", { name: show, exact: true }).click(); await page.locator("tbody tr").first().waitFor();
    assert.equal(await page.locator("#auction-realm").count(), 0);
    assert(await page.locator("tbody tr").first().textContent().then(text => text.includes(lang === "ru" ? "По цене за единицу" : "Sold at unit price")));
    // Error, empty and stale are distinct states, all recoverable.
    for (const nextMode of ["empty", "error", "stale", "partial", "full"]) {
      mode = nextMode;
      await page.getByRole("button", { name: show, exact: true }).click();
      if (mode === "empty") await page.getByRole("heading", { name: lang === "ru" ? "Лотов не найдено" : "No auctions found" }).waitFor();
      else if (mode === "error") await page.getByRole("alert").filter({ hasText: lang === "ru" ? "Не удалось" : "could not" }).waitFor();
      else { await page.locator("tbody tr").first().waitFor(); if (mode === "stale") await page.getByText(lang === "ru" ? /Снимок устарел/ : /snapshot is old/).waitFor(); }
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${lang}/${width}: page overflow`);
    if (width === 1440) {
      const toggle = page.getByRole("button", { name: lang === "ru" ? "Инструменты: все страницы раздела" : "Tools: all pages" });
      await toggle.focus(); await page.keyboard.press("Enter");
      assert.equal(await toggle.getAttribute("aria-expanded"), "true");
      await page.keyboard.press("Escape"); assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      assert.equal(await toggle.evaluate(el => el === document.activeElement), true);
    } else {
      const menu = page.getByRole("button", { name: lang === "ru" ? "Открыть меню" : "Open menu" });
      await menu.click();
      await page.getByRole("navigation", { name: lang === "ru" ? "Все разделы" : "All sections" }).getByRole("link", { name: new RegExp(title) }).first().waitFor();
      await page.keyboard.press("Escape");
      assert.equal(await menu.evaluate(el => el === document.activeElement), true);
    }
    // Changing filters during an outstanding request must not restore the old market.
    delay = 500; await page.getByRole("button", { name: show, exact: true }).click();
    await page.locator("#auction-region").selectOption("us");
    await page.waitForTimeout(700); assert.equal(await page.locator("tbody").count(), 0); delay = 0;
    await page.locator("#auction-market").selectOption("realm");
    realmMode = "error"; await page.locator("#auction-region").selectOption("kr");
    await page.getByRole("alert").waitFor(); realmMode = "full";
    await page.getByRole("button", { name: lang === "ru" ? "Повторить" : "Try again", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector("#auction-realm").disabled);
    await page.locator("#auction-realm").selectOption("silvermoon");
    await page.getByRole("button", { name: show, exact: true }).click(); await page.locator("tbody tr").first().waitFor();
    if ((lang === "ru" && width === 1440) || (lang === "en" && width === 390)) await page.screenshot({ path: `${output}/${lang}-${width}.png` });
    assert.deepEqual(errors, []); results.push({ lang, width, status: "pass" }); console.log(`PASS ${lang}/${width}`);
    await fs.writeFile(`${output}/results.json`, JSON.stringify(results, null, 2)); await context.close();
  }
  await fs.writeFile(`${output}/results.json`, JSON.stringify(results, null, 2)); console.log(`PASS ${results.length} RU/EN viewport cases: filters, pagination/reload, market switch, loading/empty/error/stale, menu keyboard, cancellation and retry`);
} finally { await browser.close(); }
