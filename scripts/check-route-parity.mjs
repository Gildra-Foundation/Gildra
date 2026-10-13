#!/usr/bin/env node
// Every public page exists in both languages: app/(site)/<path>/page.tsx has a
// mirror app/ru/<path>/page.tsx that renders Russian, and the other way round;
// the same for link-preview images (opengraph-image.tsx). The two trees are the
// two root layouts (server-side <html lang>). English-only tools are listed in
// `englishOnly` with the reason. Run: npm run routes:check
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const app = path.join(root, "app");
const site = path.join(app, "(site)");
const englishOnly = {
  "api-console": "developer console of api.gildra.net",
  blueprints: "design archive",
  dev: "development galleries",
};
const files = ["page.tsx", "opengraph-image.tsx"];

function* walk(dir, rel = "") {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) yield* walk(path.join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name);
    else if (files.includes(entry.name)) yield { rel, file: entry.name };
  }
}

const problems = [];
let pairs = 0;
for (const { rel, file } of walk(app)) {
  if (rel === "ru" || rel.startsWith("ru/")) {
    const english = rel === "ru" ? "" : rel.slice(3);
    if (!fs.existsSync(path.join(site, english, file))) problems.push(`app/${rel}/${file} has no English page app/(site)/${english ? `${english}/` : ""}${file}`);
    const source = fs.readFileSync(path.join(app, rel, file), "utf8");
    if (!/["'`](ru|ru_RU)["'`]|lang="ru"|locale="ru"|\/ru\b|\.ru\./.test(source)) problems.push(`app/${rel}/${file} does not render the Russian page (no "ru" locale)`);
    continue;
  }
  if (rel !== "(site)" && !rel.startsWith("(site)/")) {
    // Outside the two trees only route handlers live (api, sitemaps, indexnow …).
    problems.push(`app/${rel}/${file} is outside app/(site) and app/ru — pages belong to one of the two root layouts`);
    continue;
  }
  const page = rel === "(site)" ? "" : rel.slice("(site)/".length);
  const top = page.split("/")[0];
  if (top in englishOnly) continue;
  pairs += 1;
  if (!fs.existsSync(path.join(app, "ru", page, file))) problems.push(`app/${rel}/${file} has no Russian mirror app/ru/${page ? `${page}/` : ""}${file}`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\nroutes:check — ${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`routes:check — ${pairs} English pages and previews all have Russian mirrors (English-only: ${Object.keys(englishOnly).join(", ")}).`);
