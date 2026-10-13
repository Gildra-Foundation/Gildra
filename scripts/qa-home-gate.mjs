#!/usr/bin/env node
// The landing scene and the contents book must not change (owner rule): the
// candidate build is compared with the live site pixel for pixel — / and /ru at
// 1440×900 and 390×844, and the book opened from /ru. Any differing pixel fails.
//   npm run qa:home-gate [-- --candidate http://127.0.0.1:3100 --base https://gildra.net]
import fs from "node:fs";
import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, all) => {
  if (arg.startsWith("--")) pairs.push([arg.slice(2), all[index + 1]]);
  return pairs;
}, []));
const candidate = args.candidate ?? "http://127.0.0.1:3100";
const base = args.base ?? "https://gildra.net";
const out = args.out ?? ".artifacts/home-gate";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();

async function shoot(origin, path, phone, book) {
  const context = await browser.newContext(phone
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: "reduce" }
    : { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await context.addInitScript(() => { try { localStorage.setItem("gildra-consent", "declined"); } catch {} });
  const page = await context.newPage();
  await page.goto(origin + path, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  if (book) {
    // Open the book the way a reader does: silent mode, continue, the GILDRA mark.
    await page.getByRole("radio", { name: "Без звука" }).click();
    await page.getByRole("button", { name: "Продолжить" }).click();
    await page.waitForTimeout(3000);
    await page.locator("button", { hasText: "GILDRA" }).first().click();
    await page.waitForTimeout(4000);
    await page.evaluate(() => document.fonts.ready);
  } else {
    await page.waitForTimeout(1000);
  }
  const shot = PNG.sync.read(await page.screenshot());
  await context.close();
  return shot;
}

let failed = 0;
for (const [label, path, phone, book] of [["desktop /", "/", false, false], ["desktop /ru", "/ru", false, false], ["phone /", "/", true, false], ["phone /ru", "/ru", true, false], ["book (desktop /ru)", "/ru", false, true]]) {
  const live = await shoot(base, path, phone, book);
  const next = await shoot(candidate, path, phone, book);
  const diff = new PNG({ width: live.width, height: live.height });
  const pixels = live.width === next.width && live.height === next.height ? pixelmatch(live.data, next.data, diff.data, live.width, live.height, { threshold: 0.1 }) : -1;
  fs.writeFileSync(`${out}/${label.replace(/\W+/g, "_")}.diff.png`, PNG.sync.write(diff));
  console.log(`${label.padEnd(20)} ${pixels === -1 ? "size differs" : `${pixels} px`}`);
  if (pixels !== 0) failed += 1;
}
await browser.close();
console.log(failed ? `qa:home-gate — ${failed} view(s) changed (diffs in ${out})` : "qa:home-gate — landing and book unchanged (0 px)");
process.exit(failed ? 1 : 0);
