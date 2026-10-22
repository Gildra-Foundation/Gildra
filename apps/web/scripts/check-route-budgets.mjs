#!/usr/bin/env node
// Per-route budgets (roadmap item 63): JavaScript, CSS, image and font bytes a first
// visit downloads (decoded size, the cost to parse and paint), at 1440×900 on a
// cold cache. Budgets live in budgets.json next to this script's repo root.
//   npm run budgets [-- --base https://gildra.net] [--only /,/ru] [--update]   (--update writes measured × 1.25 as the new budgets)
import fs from "node:fs";
import { chromium } from "playwright";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, all) => {
  if (arg.startsWith("--")) pairs.push([arg.slice(2), all[index + 1] && !all[index + 1].startsWith("--") ? all[index + 1] : "true"]);
  return pairs;
}, []));
const base = args.base ?? "http://127.0.0.1:3100";
const file = new URL("../budgets.json", import.meta.url);
const budgets = JSON.parse(fs.readFileSync(file, "utf8"));
const routes = args.only ? [...new Set(args.only.split(","))] : Object.keys(budgets.routes);
for (const route of routes) {
  if (!Object.hasOwn(budgets.routes, route)) throw new Error(`No budget configured for route: ${route}`);
}
const kb = (bytes) => Math.round(bytes / 1024);

const browser = await chromium.launch();
const measured = {};
const failures = [];
for (const route of routes) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => { try { localStorage.setItem("gildra-consent", "declined"); } catch {} });
  const page = await context.newPage();
  await page.goto(base + route, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(1500);
  const totals = await page.evaluate(() => {
    const sum = { js: 0, css: 0, img: 0, font: 0 };
    for (const entry of performance.getEntriesByType("resource")) {
      const size = entry.decodedBodySize || entry.encodedBodySize || 0;
      // Fonts and background images can both report "css" as their initiator.
      // Classify their URLs before falling back to initiator-based CSS totals.
      const pathname = entry.name.split(/[?#]/)[0];
      if (/\.(woff2?|ttf|otf|eot)$/i.test(pathname)) sum.font += size;
      else if (entry.initiatorType === "img" || /\/_next\/image$|\.(webp|avif|png|jpe?g|gif|svg|ico)$/i.test(pathname)) sum.img += size;
      else if (entry.initiatorType === "script" || /\.m?js$/i.test(pathname)) sum.js += size;
      else if (entry.initiatorType === "css" || /\.css$/i.test(pathname)) sum.css += size;
    }
    return sum;
  });
  await context.close();
  measured[route] = { js: kb(totals.js), css: kb(totals.css), img: kb(totals.img), font: kb(totals.font) };
  const budget = budgets.routes[route];
  const over = ["js", "css", "img", "font"].filter((kind) => budget[kind] !== undefined && measured[route][kind] > budget[kind]);
  console.log(`${route.padEnd(48)} JS ${String(measured[route].js).padStart(5)} / ${budget.js} KB   CSS ${String(measured[route].css).padStart(4)} / ${budget.css} KB   img ${String(measured[route].img).padStart(5)} / ${budget.img} KB   font ${String(measured[route].font).padStart(4)} / ${budget.font ?? "—"} KB${over.length ? `   OVER: ${over.join(", ")}` : ""}`);
  if (over.length) failures.push(route);
}
await browser.close();
if (args.update === "true") {
  for (const [route, value] of Object.entries(measured)) budgets.routes[route] = { ...budgets.routes[route], js: Math.ceil(value.js * 1.25), css: Math.ceil(value.css * 1.25), img: Math.ceil(value.img * 1.25) };
  fs.writeFileSync(file, `${JSON.stringify(budgets, null, 2)}\n`);
  console.log("budgets.json updated (measured + 25 %)");
}
console.log(failures.length ? `budgets — ${failures.length} route(s) over budget` : "budgets — every route within budget");
process.exit(failures.length && args.update !== "true" ? 1 : 0);
