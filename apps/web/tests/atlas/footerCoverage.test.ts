import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { it } from "node:test";
import { footerRoutes } from "../../scripts/footer-routes.mjs";
import { footerLanguageHref } from "../../components/atlas/footerLanguageHref.ts";

const web = join(import.meta.dirname, "../..");

function files(dir: string, test: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path, test) : test(name) ? [path] : [];
  });
}

/** app/(site)/wow/raids/[raid]/page.tsx → /wow/raids/[raid]; the Russian tree and route groups drop out. */
function template(file: string) {
  const route = relative(join(web, "app"), file).replace(/\/?page\.tsx$/, "").split("/")
    .filter(part => !/^\(.+\)$/.test(part)).filter((part, index) => !(index === 0 && part === "ru")).join("/");
  const path = `/${route}`;
  return /^\/wow\/forever\/dungeons\/[a-z-]+$/.test(path) && path !== "/wow/forever/dungeons/hall-of-thanes" ? "/wow/forever/dungeons/*" : path;
}

it("every page template of the app is in the footer coverage walk", () => {
  const known = new Set(footerRoutes.map(route => route.template));
  const pages = files(join(web, "app"), name => name === "page.tsx").map(template);
  const missing = [...new Set(pages)].filter(path => !known.has(path));
  assert.deepEqual(missing, [], "add a sample of each new page to scripts/footer-routes.mjs");
  const stale = [...known].filter(path => path !== "404" && !pages.includes(path));
  assert.deepEqual(stale, [], "footer-routes.mjs names templates the app no longer has");
});

it("no page opts out of the shared footer or brings its own", () => {
  const sources = files(join(web, "components"), name => /\.tsx$/.test(name)).concat(files(join(web, "app"), name => /\.tsx$/.test(name)));
  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    const at = relative(web, file);
    assert.ok(!/<AtlasFrame\b[^>]*\bfooter=\{false\}/.test(text), `${at}: AtlasFrame without the site footer`);
    assert.ok(!/<footer\b[^>]*>[^<]*(?:Gildra Foundation|API Console|Blizzard)/.test(text), `${at}: an old footer variant`);
    if (!at.startsWith("components/atlas/")) assert.ok(!/\bAtlasFrameFooter\b/.test(text), `${at}: the kit footer outside the app adapter`);
  }
});

it("footer language links name the same page, or the other hub when there is no twin", () => {
  assert.equal(footerLanguageHref("/wow/raids/sporefall", "ru"), "/ru/wow/raids/sporefall");
  assert.equal(footerLanguageHref("/ru/wow/raids/sporefall", "en"), "/wow/raids/sporefall");
  assert.equal(footerLanguageHref("/ru", "en"), "/");
  assert.equal(footerLanguageHref("/", "ru"), "/ru");
  assert.equal(footerLanguageHref("/ru/wow/stories", "en"), "/");
  assert.equal(footerLanguageHref("/ru/wow/stories", "ru"), "/ru/wow/stories");
  assert.equal(footerLanguageHref("/api-console", "ru"), "/ru");
  assert.equal(footerLanguageHref("/ru/missing-page", "en", true), "/");
  assert.equal(footerLanguageHref("/ru/missing-page", "ru", true), "/ru");
});
