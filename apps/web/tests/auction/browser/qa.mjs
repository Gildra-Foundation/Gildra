// Browser QA of /wow/auction against a running server (AUCTION_QA_URL), with the auction API mocked in the page:
// categories, sorting, compare tray and view, item detail, search suggestions, realm categories, error state, overflow.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
const base = process.env.AUCTION_QA_URL ?? "http://127.0.0.1:3141";
const output = process.env.AUCTION_QA_OUTPUT ?? "/tmp/auction-qa";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH ?? "/home/debian/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell", args: ["--no-sandbox"] });
const item = (itemId, name, level, minPrice, medianPrice, quantity, extra = {}) => ({ itemId, market: "commodities", name, iconUrl: null, qualityId: 2, classId: 7, subclassId: 7, level, rank: null, minPrice, medianPrice, quantity, lots: 3, ...extra });
const ore = [item(1, "Silver Ore", 23, 9900, 71400, 63568, { rank: 1 }), item(2, "Silver Ore", 23, 237300, 274000, 62037, { rank: 2 }), item(3, "Copper Ore", 23, 52200, 67000, 56088), item(4, "Tin Ore", 1, 1000, 1200, 500)];
const results = [];
try {
  for (const lang of ["ru", "en"]) for (const width of [320, 390, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: width === 1440 ? "no-preference" : "reduce" });
    const page = await context.newPage(), errors = [];
    let failing = false;
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/wow/auction?**", route => {
      const q = new URL(route.request().url()).searchParams;
      if (failing) return route.fulfill({ status: 503, json: { error: "upstream_unavailable" } });
      if (q.get("action") === "realms") return route.fulfill({ json: { realms: [{ name: "Гордунни / Gordunni", slug: "gordunni" }, { name: "Silvermoon", slug: "silvermoon" }] } });
      const view = { sourceUpdatedAt: new Date().toISOString(), stale: false, truncated: false };
      if (q.get("action") === "market") {
        if (q.get("items")) return route.fulfill({ json: { ...view, items: q.get("items").split(",").map(Number).map(id => ore.find(row => row.itemId === id) ?? item(id, `Item ${id}`, 1, 100, 100, 1)).map(row => ({ ...row, ladder: [[row.minPrice, 10], [row.medianPrice, 40], [Math.round(row.medianPrice * 1.5), 100]] })) } });
        if (q.get("category") === "armor") return route.fulfill({ json: { ...view, items: [{ ...item(9, "Chain Pauldrons", 600, 68100, 68100, 1), market: "realm", classId: 4 }] } });
        return route.fulfill({ json: { ...view, items: q.get("limit") ? ore.slice(0, 2) : ore } });
      }
      return route.fulfill({ json: { rows: [], total: 0, page: 1, pages: 1, market: "realm", sourceUpdatedAt: null, fetchedAt: new Date().toISOString(), stale: false, searchTruncated: false, connectedRealmId: 1 } });
    });
    const prefix = lang === "ru" ? "/ru" : "";
    await page.goto(`${base}${prefix}/wow/auction`, { waitUntil: "networkidle" });
    await page.locator("tbody tr").first().waitFor();
    const consent = page.getByRole("region", { name: lang === "ru" ? "Файлы cookie" : "Cookies" }).getByRole("button").last();
    if (await consent.count()) await consent.click();
    assert.equal(await page.locator("tbody tr").count(), 3, "current expansion only by default");
    await page.getByRole("radio", { name: lang === "ru" ? "Все" : "All", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 4);
    if (width > 760) await page.getByRole("button", { name: lang === "ru" ? "Мин. цена" : "Min price" }).click();
    else await page.getByRole("combobox", { name: lang === "ru" ? "Сортировать по" : "Sort by" }).selectOption("min:asc");
    await page.waitForFunction(() => new URL(location.href).searchParams.get("sort") === "min");
    assert.match(await page.locator("tbody tr").first().innerText(), /Tin Ore/);
    // Compare: tray, view, shareable address, back.
    const boxes = page.locator("tbody input[type=checkbox]");
    for (const index of [1, 2]) { await boxes.nth(index).click(); await page.waitForFunction(i => document.querySelectorAll("tbody input[type=checkbox]")[i].checked, index); }
    await page.getByRole("button", { name: new RegExp(lang === "ru" ? "^Сравнить · 2" : "^Compare · 2") }).click();
    await page.locator("[class*=compareCard]").nth(1).waitFor();
    assert.equal(new URL(page.url()).searchParams.get("view"), "compare");
    await page.goBack(); await page.locator("tbody tr").first().waitFor();
    // Item detail opens as a history step and closes with Escape.
    await page.locator("tbody th button").first().click();
    await page.getByRole("dialog").locator("[class*=depthPlot]").waitFor();
    assert(new URL(page.url()).searchParams.get("item"));
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !new URL(location.href).searchParams.has("item"));
    // Search: suggestions, Enter for the full list; the realm field appears for search.
    await page.mouse.move(1, 1);
    await page.locator("#auction-find").fill("ore");
    await page.locator("[role=listbox] [role=option]").first().waitFor();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "ore");
    await page.locator("#auction-realm").waitFor();
    // Realm categories need a realm, chosen by typing part of its name.
    await page.getByRole("button", { name: lang === "ru" ? "Броня" : "Armor" }).click();
    await page.getByText(lang === "ru" ? "Выберите сервер, чтобы увидеть лоты." : "Choose a realm to see its auctions.").waitFor();
    await page.locator("#auction-realm").fill("gord");
    await page.locator("[role=listbox] [role=option]").first().click();
    await page.locator("tbody tr").first().waitFor();
    assert.equal(new URL(page.url()).searchParams.get("realm"), "gordunni");
    // A failing API leaves one recoverable message.
    failing = true;
    await page.getByRole("button", { name: lang === "ru" ? "Ткань" : "Cloth" }).click();
    await page.locator("[class*=stateBox][role=alert]").waitFor();
    failing = false;
    await page.getByRole("button", { name: lang === "ru" ? "Повторить" : "Try again", exact: true }).click();
    await page.locator("tbody tr").first().waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${lang}/${width}: page overflow`);
    if (width === 1440 || width === 390) await page.screenshot({ path: `${output}/${lang}-${width}.png` });
    assert.deepEqual(errors, []); results.push({ lang, width, status: "pass" }); console.log(`PASS ${lang}/${width}`);
    await context.close();
  }
  await fs.writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(`PASS ${results.length} RU/EN viewport cases`);
} finally { await browser.close(); }
