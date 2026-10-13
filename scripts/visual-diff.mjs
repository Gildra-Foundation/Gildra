#!/usr/bin/env node
// Visual regression of the inner pages: screenshots of a candidate build against
// a reference (the live site by default, or saved PNGs with --baseline-dir),
// desktop 1440×900 and phone 390×844, reduced motion, consent declined.
//
//   npm run visual:diff                                  # local :3100 vs https://gildra.net, default routes
//   npm run visual:diff -- --routes /ru/wow,/wow/raids --max 0.5
//   npm run visual:diff -- --routes /dev/atlas --baseline-dir .artifacts/visual/atlas-baseline [--update]
//
// Prints the share of differing pixels per route and viewport; exits 1 when one
// exceeds --max (percent, default 0.5). Diff images go to --out.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, all) => {
  if (arg.startsWith("--")) pairs.push([arg.slice(2), all[index + 1] && !all[index + 1].startsWith("--") ? all[index + 1] : "true"]);
  return pairs;
}, []));
const candidate = args.candidate ?? "http://127.0.0.1:3100";
const reference = args.base ?? "https://gildra.net";
const baselineDir = args["baseline-dir"];
const update = args.update === "true";
const max = Number(args.max ?? 0.5);
const out = args.out ?? ".artifacts/visual";
const viewports = (args.viewports ?? "desktop,mobile").split(",");
const routes = (args.routes ?? [
  "/ru/wow", "/wow/raids", "/ru/wow/raids/the-voidspire", "/ru/wow/lairs", "/wow/classes", "/ru/wow/mythic-plus",
  "/ru/wow/delves", "/ru/database", "/tier-lists", "/ru/library", "/ru/search", "/wow/mythic-plus/midnight-season-2/murder-row",
].join(",")).split(",");
const sizes = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

fs.mkdirSync(out, { recursive: true });
if (baselineDir) fs.mkdirSync(baselineDir, { recursive: true });
const browser = await chromium.launch();

async function shoot(origin, route, viewport, file) {
  const context = await browser.newContext({ viewport: sizes[viewport], reducedMotion: "reduce", deviceScaleFactor: 1 });
  await context.addInitScript(() => { try { localStorage.setItem("gildra-consent", "declined"); } catch {} });
  // The staging copy marks itself with a badge (components/StagingBadge.tsx); compare the page, not the mark.
  await context.addInitScript(() => { document.addEventListener("DOMContentLoaded", () => { const style = document.createElement("style"); style.textContent = ".staging-badge{display:none!important}"; document.head.append(style); }); });
  const page = await context.newPage();
  await page.goto(origin + route, { waitUntil: "networkidle", timeout: 90_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: file });
  await context.close();
  return PNG.sync.read(fs.readFileSync(file));
}

let failed = 0;
for (const viewport of viewports) {
  for (const route of routes) {
    const name = `${viewport}-${route.replace(/\W+/g, "_").replace(/^_/, "") || "root"}`;
    try {
      const next = await shoot(candidate, route, viewport, path.join(out, `${name}.candidate.png`));
      const baselineFile = baselineDir ? path.join(baselineDir, `${name}.png`) : null;
      if (baselineFile && (update || !fs.existsSync(baselineFile))) {
        fs.copyFileSync(path.join(out, `${name}.candidate.png`), baselineFile);
        console.log(`${viewport.padEnd(7)} ${route}  baseline written`);
        continue;
      }
      const before = baselineFile ? PNG.sync.read(fs.readFileSync(baselineFile)) : await shoot(reference, route, viewport, path.join(out, `${name}.reference.png`));
      if (before.width !== next.width || before.height !== next.height) throw new Error(`size ${before.width}×${before.height} vs ${next.width}×${next.height}`);
      const diff = new PNG({ width: next.width, height: next.height });
      const pixels = pixelmatch(before.data, next.data, diff.data, next.width, next.height, { threshold: 0.12 });
      fs.writeFileSync(path.join(out, `${name}.diff.png`), PNG.sync.write(diff));
      const share = (100 * pixels) / (next.width * next.height);
      const over = share > max;
      if (over) failed += 1;
      console.log(`${viewport.padEnd(7)} ${route}  ${share.toFixed(2)}%${over ? `  > ${max}%` : ""}`);
    } catch (error) {
      failed += 1;
      console.log(`${viewport.padEnd(7)} ${route}  ERROR ${error.message.split("\n")[0]}`);
    }
  }
}
await browser.close();
console.log(failed ? `visual:diff — ${failed} route(s) over ${max}% or failed; diffs in ${out}` : `visual:diff — every route within ${max}%`);
process.exit(failed ? 1 : 0);
