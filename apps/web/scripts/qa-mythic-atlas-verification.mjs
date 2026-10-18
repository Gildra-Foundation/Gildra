import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.MYTHIC_BASE_URL ?? "http://127.0.0.1:5188";
const output = process.env.MYTHIC_QA_OUTPUT ?? "/tmp/mythic-atlas-verification";
// Snapshot of Raider.IO's season-mn-2 response, checked 2026-10-18.
const timers = {
  "ruby-life-pools": "28:00", "altar-of-fangs": "30:00", "murder-row": "34:00",
  "den-of-nalorakk": "32:00", "the-blinding-vale": "30:00", "voidscar-arena": "30:00",
  "kings-rest": "33:00", "temple-of-sethraliss": "32:00",
};
const seconds = (time) => time.split(":").reduce((minutes, part) => minutes * 60 + Number(part), 0);
async function settleScroll(page) {
  let previous;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.waitForTimeout(100);
    const current = await page.evaluate(() => scrollY);
    if (current === previous) return;
    previous = current;
  }
  throw new Error("Native scrolling did not settle");
}
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
const results = [];
await mkdir(output, { recursive: true });

try {
  for (const locale of ["ru", "en"]) {
    const prefix = locale === "ru" ? "/ru" : "";
    const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}${prefix}/wow/mythic-plus`, { waitUntil: "networkidle" });
    const reject = page.getByRole("button", { name: locale === "ru" ? "Отклонить" : "Decline", exact: true });
    await reject.waitFor();
    await reject.click();
    await page.getByRole("table").waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const width of [1440, 390, 320]) {
      console.log(`Checking catalog ${locale} ${width}px`);
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await page.keyboard.press("Control+Home");
      const rows = page.locator("#timers tbody tr");
      assert.equal(await rows.count(), 8);
      const values = [];
      for (const row of await rows.all()) {
        const link = row.locator("a");
        const slug = (await link.getAttribute("href")).split("/").pop();
        const value = (await row.locator("td").textContent()).trim();
        assert.equal(value, timers[slug], `${locale}: incorrect timer for ${slug}`);
        values.push(seconds(value));
        const card = page.locator("#dungeons article").filter({ has: page.locator(`a[href$="/${slug}"]`) });
        // Off-screen cards use content-visibility; read their server-rendered
        // text without mistaking skipped layout for missing card data.
        assert.ok((await card.textContent()).includes(value), `Card timer disagrees for ${slug}`);
        assert.ok((await card.textContent()).includes(locale === "ru" ? "Маршрут — черновик" : "Draft route"));
        assert.equal((await card.locator("h3").textContent()).trim(), (await link.textContent()).trim());
      }
      assert.deepEqual(values, [...values].sort((a, b) => a - b));
      assert.ok(await page.locator("#timers").evaluate((element) => Boolean(element.compareDocumentPosition(document.querySelector("#dungeons")) & Node.DOCUMENT_POSITION_FOLLOWING)));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${locale}/${width}: horizontal overflow`);
      await page.locator('a[href="#timers"]').click();
      await page.waitForFunction(() => document.querySelector("#timers-title").getBoundingClientRect().top < 150);
      const headingTop = await page.locator("#timers-title").evaluate((element) => element.getBoundingClientRect().top);
      assert.ok(headingTop >= 60, `Timer heading is hidden under the toolbar: ${headingTop}`);
      // The complete compact comparison fits in one phone screen after jumping.
      if (width <= 390) assert.ok((await page.locator("#timers").boundingBox()).height < 700);
      await page.screenshot({ path: `${output}/timers-${locale}-${width}.png` });
      results.push({ locale, width, rows: 8, noOverflow: true, headingTop });
      console.log(`PASS catalog ${locale} ${width}px`);
    }
    const details = page.locator("details").filter({ has: page.locator("summary", { hasText: locale === "ru" ? "Источники и даты проверки" : "Sources and verification dates" }) });
    await details.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await details.evaluate((element) => element.open), true);
    assert.equal(await details.locator('time[datetime="2026-10-18"]').count(), 4);
    assert.equal(await details.locator("a").count(), 4);
    assert.ok((await details.innerText()).includes(locale === "ru" ? "Даты проверки тактики пока нет" : "No tactical verification date"));
    assert.ok((await details.innerText()).includes("12.1.5"));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${locale}: expanded sources overflow`);
    await page.screenshot({ path: `${output}/sources-${locale}-320.png` });
    for (const slug of ["altar-of-fangs", "the-blinding-vale", "temple-of-sethraliss"]) {
      await page.goto(`${base}${prefix}/wow/mythic-plus/midnight-season-2/${slug}`, { waitUntil: "networkidle" });
      await page.locator(`main[data-dungeon="${slug}"]`).waitFor();
      const summary = page.getByRole("region", { name: locale === "ru" ? "Сводка прохождения" : "Run summary", exact: true });
      assert.equal(await summary.locator("article").first().locator("b").innerText(), timers[slug]);
      const [planned, reserve] = (await summary.locator("article").first().locator("small").innerText()).match(/\d+:\d{2}/g);
      assert.equal(seconds(reserve), Math.max(0, seconds(timers[slug]) - seconds(planned)), `Reserve disagrees for ${slug}`);
      assert.ok((await page.locator("main").innerText()).includes(locale === "ru" ? "Маршрут — черновик" : "This route is a draft"));
      assert.ok(!(await page.locator("main").innerText()).includes(locale === "ru" ? "Обновление 12.1" : "Patch 12.1"));
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  // The comparison and native disclosure remain usable without JavaScript.
  const noJs = await browser.newContext({ javaScriptEnabled: false, reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
  const page = await noJs.newPage();
  await page.goto(`${base}/ru/wow/mythic-plus`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator("#timers tbody tr").count(), 8);
  for (let repeat = 0; repeat < 2; repeat += 1) {
    await page.mouse.wheel(0, -10_000);
    await settleScroll(page);
    await page.waitForFunction(() => scrollY < 1);
    await page.locator('a[href="#timers"]').click();
    await page.waitForFunction(() => {
      const top = document.querySelector("#timers-title").getBoundingClientRect().top;
      return top >= 60 && top < 150;
    });
    await settleScroll(page);
    const top = await page.locator("#timers-title").evaluate((element) => element.getBoundingClientRect().top);
    assert.ok(top >= 60 && top < 150, `Repeated no-JS timer anchor failed: ${top}`);
  }
  await page.getByText("Источники и даты проверки", { exact: true }).click();
  assert.equal(await page.locator("details[open] time").count(), 4);
  await noJs.close();
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(`PASS: RU/EN, 1440/390/320px, timers/names/drafts/sources, route reserves, keyboard and no-JS. Evidence: ${output}`);
} finally {
  await browser.close();
}
