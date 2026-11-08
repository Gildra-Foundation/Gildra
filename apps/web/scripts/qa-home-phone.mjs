import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.HOME_ENTRY_BASE_URL ?? "http://127.0.0.1:3134";
const output = process.env.HOME_ENTRY_OUTPUT ?? "/tmp/home/phone-review-final";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const reports = [];
try {
  for (const [width, height, lang, reducedMotion] of [[390, 844, "ru", "reduce"], [390, 844, "en", "reduce"], [320, 740, "ru", "reduce"], [768, 1024, "ru", "reduce"], [390, 844, "ru", "no-preference"]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion, deviceScaleFactor: 2 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem("gildra-consent", "declined"));
    await page.goto(`${base}${lang === "ru" ? "/ru" : "/"}`, { waitUntil: "networkidle" });
    const cover = page.getByRole("button", { name: lang === "ru" ? /Открыть книгу —/ : /Open the book —/ });
    await cover.click();
    await page.waitForFunction(() => document.querySelector("main[data-book-state]")?.dataset.bookState === "open");
    await page.waitForFunction(() => [...document.querySelectorAll('dialog[open] img[src*="icecrown-phone-"]')].every(image => image.complete && image.naturalWidth > 0));
    await page.evaluate(() => document.fonts.ready);
    const dialog = page.locator("dialog[open]");
    const stem = `${width}-${lang}-${reducedMotion}`;
    for (const [index, name] of (lang === "ru" ? ["Оглавление", "Путеводитель"] : ["Contents", "Companion"]).entries()) {
      await dialog.getByRole("button", { name, exact: true }).click();
      await page.waitForFunction(index => {
        const track = document.querySelector('dialog[open] [data-moving]');
        if (track) return false;
        const image = document.querySelectorAll('dialog[open] img[src*="icecrown-phone-"]')[index];
        const rect = image?.getBoundingClientRect();
        return rect && rect.left >= 0 && rect.right <= innerWidth && Math.abs((rect.left + rect.right) / 2 - innerWidth / 2) <= 8;
      }, index);
      const geometry = await dialog.evaluate((element, index) => {
        const image = element.querySelectorAll('img[src*="icecrown-phone-"]')[index];
        const frame = image.getBoundingClientRect();
        const close = element.querySelector('button[aria-label]');
        const control = close.getBoundingClientRect();
        const bar = close.parentElement.getBoundingClientRect();
        const tabs = element.querySelector('nav[aria-label="Страницы книги"],nav[aria-label="Book pages"]')?.getBoundingClientRect();
        return { frame: frame.toJSON(), close: control.toJSON(), bar: bar.toJSON(), tabs: tabs.toJSON(), background: getComputedStyle(element).backgroundColor, overflow: element.scrollHeight - element.clientHeight };
      }, index);
      assert.ok(geometry.close.width >= 44 && geometry.close.height >= 44, "Close target must be at least 44px");
      assert.ok(geometry.close.top >= geometry.bar.top && geometry.close.bottom <= geometry.bar.bottom, "Close stays inside its own bar");
      assert.ok(geometry.frame.left >= 0 && geometry.frame.right <= width, "Whole leaf fits the screen");
      assert.ok(Math.abs((geometry.frame.left + geometry.frame.right) / 2 - width / 2) <= 8, "Leaf stays centred");
      assert.ok(geometry.tabs.top - geometry.frame.bottom <= 24, "Tabs follow the leaf without a large gap");
      assert.ok(geometry.tabs.bottom <= height && geometry.overflow <= 1, "Book and tabs fit one viewport");
      assert.ok(!geometry.background.includes("rgba") && geometry.background !== "transparent", "Modal obscures the header behind it");
      await page.screenshot({ path: `${output}/${stem}-${index ? "companion" : "contents"}.png` });
      reports.push({ width, height, lang, reducedMotion, index, ...geometry });
    }
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector("main[data-book-state]")?.dataset.bookState === "closed");
    assert.equal(await cover.evaluate(element => element === document.activeElement), true);
    assert.deepEqual(errors, []);
    await page.close();
  }
  await writeFile(`${output}/report.json`, JSON.stringify(reports, null, 2));
  console.log(`Phone book: ${reports.length} framed page, target, compact layout and focus checks passed.`);
} finally {
  await browser.close();
}
