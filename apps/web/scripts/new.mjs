#!/usr/bin/env node
// Generators of the modular frontend (roadmap item 80):
//   npm run new:feature -- <name>                 components/wow/<name>/ from components/wow/_template
//   npm run new:page -- <path> <feature> [--title-en "…"] [--title-ru "…"]
//                                                 app/(site)/<path>/page.tsx + app/ru/<path>/page.tsx
//   npm run new:og -- <path> <kind>               link-preview wrappers for both languages (kinds: lib/og/routes.tsx)
// Never overwrites a file. Names are kebab-case ("world-quests").
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const [command, ...rest] = process.argv.slice(2);
const flags = {};
const args = [];
for (let index = 0; index < rest.length; index += 1) {
  if (rest[index].startsWith("--")) flags[rest[index].slice(2)] = rest[++index];
  else args.push(rest[index]);
}

const fail = (message) => { console.error(message); process.exit(1); };
const kebab = (value) => /^[a-z][a-z0-9-]*$/.test(value) ? value : fail(`"${value}" is not kebab-case`);
const pascal = (value) => value.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join("");
const camel = (value) => { const name = pascal(value); return name[0].toLowerCase() + name.slice(1); };
const written = [];
function write(file, content) {
  const full = path.join(root, file);
  if (fs.existsSync(full)) fail(`${file} exists — not overwriting`);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  written.push(file);
}

if (command === "feature") {
  const name = kebab(args[0] ?? fail("usage: new:feature <name>"));
  const source = path.join(root, "components/wow/_template");
  for (const file of fs.readdirSync(source)) {
    const target = file.replace("Template", pascal(name)).replace(/^template/, camel(name));
    const content = fs.readFileSync(path.join(source, file), "utf8")
      .replaceAll("TemplatePage", `${pascal(name)}Page`).replaceAll("templateCopy", `${camel(name)}Copy`)
      .replaceAll("./template.module.css", `./${camel(name)}.module.css`).replaceAll("Template", pascal(name)).replaceAll("_template", name);
    if (file === "README.md") continue;
    write(`components/wow/${name}/${target}`, content);
  }
} else if (command === "page") {
  const [route, feature] = args;
  if (!route || !feature) fail("usage: new:page <path> <feature> [--title-en …] [--title-ru …]");
  const clean = route.replace(/^\/+|\/+$/g, "");
  if (clean.startsWith("ru/")) fail("give the English path; the /ru mirror is written too");
  if (!fs.existsSync(path.join(root, "components/wow", feature, "index.ts"))) fail(`components/wow/${feature}/index.ts not found — run new:feature first`);
  const component = `${pascal(feature)}Page`;
  const page = (locale, title) => `import type { Metadata } from "next";
import { ${component} } from "@/components/wow/${feature}";

export const metadata: Metadata = {
  title: ${JSON.stringify(`${title} — Gildra`)},
  alternates: { canonical: ${JSON.stringify(locale === "ru" ? `/ru/${clean}` : `/${clean}`)}, languages: { en: ${JSON.stringify(`/${clean}`)}, ru: ${JSON.stringify(`/ru/${clean}`)} } },
  robots: { index: false, follow: true },
};
export default function Page() { return <${component} locale="${locale}" />; }
`;
  write(`app/(site)/${clean}/page.tsx`, page("en", flags["title-en"] ?? pascal(feature)));
  write(`app/ru/${clean}/page.tsx`, page("ru", flags["title-ru"] ?? flags["title-en"] ?? pascal(feature)));
} else if (command === "og") {
  const [route, kind] = args;
  if (!route || !kind) fail("usage: new:og <path> <kind>");
  const clean = route.replace(/^\/+|\/+$/g, "");
  const og = (locale) => `import { ogImage } from "@/lib/og/routes";

export const alt = "Gildra — World of Warcraft";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";
export default ogImage(${JSON.stringify(locale)}, ${JSON.stringify(kind)});
`;
  write(`app/(site)/${clean}/opengraph-image.tsx`, og("en"));
  write(`app/ru/${clean}/opengraph-image.tsx`, og("ru"));
} else {
  fail("usage: node scripts/new.mjs feature|page|og …");
}
console.log(written.map((file) => `+ ${file}`).join("\n"));
