import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Page-level SEO against a running server (npm run test:seo, SEO_BASE_URL as in open.test.ts),
 * read the way a crawler reads it (Googlebot user agent: metadata is in <head>, not streamed):
 * own title/description/og:image/og:url per page, valid JSON-LD with the expected types,
 * hub links that do not bounce through redirects, and the cached profession region view.
 */
const base = (process.env.SEO_BASE_URL ?? "http://localhost:3420").replace(/\/$/, "");
const origin = (process.env.SEO_CANONICAL_ORIGIN ?? "https://gildra.net").replace(/\/$/, "");
const BOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

async function get(path: string) {
  const response = await fetch(`${base}${path}`, { redirect: "manual", headers: { "user-agent": BOT }, signal: AbortSignal.timeout(120_000) });
  return { status: response.status, type: response.headers.get("content-type") ?? "", location: response.headers.get("location"), body: await response.text() };
}

const decode = (value: string | undefined) => value?.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
const head = (html: string) => html.split("</head>")[0];
const metaContent = (html: string, attribute: "name" | "property", key: string) =>
  decode(head(html).match(new RegExp(`<meta[^>]+${attribute}="${key}"[^>]+content="([^"]*)"`, "i"))?.[1]);
const titleOf = (html: string) => decode(head(html).match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]);
const canonicalOf = (html: string) => head(html).match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1];
function jsonLdTypes(html: string) {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap((match) => {
    const data = JSON.parse(match[1]) as unknown; // throws on invalid JSON-LD
    return (Array.isArray(data) ? data : [data]).map((thing) => (thing as { "@type": string })["@type"]);
  });
}

/** Indexable pages of every family and the structured data each must carry. */
const pages: Array<[path: string, types: string[]]> = [
  ["/", ["WebSite", "Organization"]],
  ["/ru", ["WebSite", "Organization"]],
  ["/tier-lists", ["BreadcrumbList"]],
  ["/tier-lists/raid", ["BreadcrumbList"]],
  ["/ru/tier-lists/arena", ["BreadcrumbList"]],
  ["/tier-lists/arena/solo-shuffle", ["BreadcrumbList"]],
  ["/wow/professions", ["BreadcrumbList", "ItemList"]],
  ["/ru/wow/professions/alchemy", ["BreadcrumbList"]],
  ["/wow/classes", ["BreadcrumbList", "ItemList"]],
  ["/wow/classes/priest/holy-priest", ["BreadcrumbList"]],
  ["/wow/mythic-plus/leaderboard", ["BreadcrumbList"]],
  ["/wow/mythic-plus/leaderboard/holy-priest", ["BreadcrumbList"]],
  ["/wow/mythic-plus/stats", ["BreadcrumbList"]],
  ["/wow/mythic-plus/comps", ["BreadcrumbList"]],
  ["/wow/mythic-plus/midnight-season-2/kings-rest", []],
  ["/ru/wow/mythic-plus/midnight-season-2/kings-rest", []],
  ["/wow/raids/the-voidspire", []],
  ["/wow/raids/composition", ["BreadcrumbList"]],
  ["/wow/lairs/luashal", []],
  ["/wow/transmog", ["BreadcrumbList"]],
  ["/wow/auction", ["BreadcrumbList"]],
];

describe("seo: page metadata as crawlers read it", () => {
  const seen = new Map<string, string>();
  for (const [path, types] of pages) {
    it(path, async () => {
      const { status, body } = await get(path);
      assert.equal(status, 200);
      const title = titleOf(body) ?? "";
      const description = metaContent(body, "name", "description") ?? "";
      assert.ok(title.length >= 15 && title.length <= 70, `title (${title.length}) ${title}`);
      assert.ok(description.length >= 50 && description.length <= 170, `description (${description.length}) ${description}`);
      for (const [other, otherTitle] of seen) assert.notEqual(otherTitle, title, `same title as ${other}`);
      seen.set(path, title);
      const canonical = canonicalOf(body);
      assert.equal(canonical?.replace(/\/$/, ""), `${origin}${path}`.replace(/\/$/, ""));
      assert.equal(metaContent(body, "property", "og:url")?.replace(/\/$/, ""), canonical?.replace(/\/$/, ""), "og:url");
      const image = metaContent(body, "property", "og:image");
      assert.ok(image, "og:image");
      assert.ok(metaContent(body, "name", "twitter:image"), "twitter:image");
      const found = jsonLdTypes(body);
      for (const type of types) assert.ok(found.includes(type), `JSON-LD ${type} in [${found}]`);
    });
  }

  it("Open Graph cards of the new page families answer as JPEG images", async () => {
    for (const path of ["/wow/professions/alchemy", "/ru/wow/mythic-plus/leaderboard/holy-priest", "/wow/classes/priest/holy-priest", "/wow/raids/composition"]) {
      const image = metaContent((await get(path)).body, "property", "og:image");
      assert.ok(image, path);
      const card = await get(new URL(image).pathname + new URL(image).search);
      assert.equal(card.status, 200, `${path} → ${image}`);
      assert.match(card.type, /^image\//, `${path} → ${image}`);
    }
  });
});

describe("seo: internal links", () => {
  it("the raid hub links to boss sections, not to redirecting boss URLs", async () => {
    for (const path of ["/wow/raids", "/ru/wow/raids"]) {
      const { body } = await get(path);
      const bossLinks = [...body.matchAll(/<a\b[^>]*data-hub-boss-link[^>]*>/g)].map((match) => match[0].match(/href="([^"]+)"/)?.[1] ?? "");
      assert.ok(bossLinks.length >= 10, `${path}: ${bossLinks.length} boss links`);
      for (const href of bossLinks) assert.match(href, /^(\/ru)?\/wow\/raids\/[^/#]+#/, `${path}: ${href}`);
    }
  });
});

describe("seo: tier-list modes", () => {
  it("old mode queries answer 308 to the mode's own page, other options kept", async () => {
    const cases: Array<[string, string]> = [
      ["/tier-lists?activity=raid", "/tier-lists/raid"],
      ["/ru/tier-lists?activity=pvp&bracket=shuffle&role=healer", "/ru/tier-lists/arena/solo-shuffle?role=healer"],
      ["/tier-lists?activity=pvp", "/tier-lists/arena"],
      ["/tier-lists?mode=raid", "/tier-lists/raid"],
      ["/tier-lists/arena/3v3", "/tier-lists/arena"],
      ["/tier-lists/arena?bracket=2v2", "/tier-lists/arena/2v2"],
    ];
    for (const [from, to] of cases) {
      const response = await get(from);
      assert.equal(response.status, 308, from);
      assert.equal(new URL(response.location ?? "", base).pathname + new URL(response.location ?? "", base).search, to, from);
    }
    assert.equal((await get("/tier-lists/arena/5v5")).status, 404);
  });

  it("every mode page names its language twins", async () => {
    const page = await get("/ru/tier-lists/raid");
    assert.match(head(page.body), new RegExp(`hrefLang="en" href="${origin}/tier-lists/raid"`, "i"));
    assert.match(head(page.body), new RegExp(`hrefLang="x-default" href="${origin}/tier-lists/raid"`, "i"));
  });
});

describe("seo: related links", () => {
  it("spec pages, spec leaderboards and dungeon pages link to their neighbours", async () => {
    const expectations: Array<[string, string[]]> = [
      ["/wow/classes/priest/holy-priest", ["/tier-lists/raid", "/wow/mythic-plus/meta", "/talents/holy-priest", "/wow/mythic-plus/leaderboard/holy-priest"]],
      ["/ru/wow/mythic-plus/leaderboard/holy-priest", ["/ru/wow/classes/priest/holy-priest", "/ru/talents/holy-priest", "/ru/tier-lists"]],
      ["/wow/mythic-plus/midnight-season-2/kings-rest", ["/wow/mythic-plus/comps?dungeon=kings-rest", "/wow/mythic-plus/routes?dungeon=kings-rest"]],
      ["/wow/professions/alchemy", ["/wow/auction?cat=herbs"]],
      ["/wow/professions", ["/wow/auction?cat=ore"]],
    ];
    for (const [path, hrefs] of expectations) {
      const { body } = await get(path);
      for (const href of hrefs) assert.ok(body.includes(`href="${href}"`), `${path} → ${href}`);
    }
  });
});

describe("seo: cached views", () => {
  it("the US view answers on ?region=us with the page's canonical; its internal path is a 404", async () => {
    const us = await get("/wow/professions/alchemy?region=us");
    assert.equal(us.status, 200);
    assert.equal(canonicalOf(us.body), `${origin}/wow/professions/alchemy`);
    for (const path of ["/wow/professions/alchemy/region/us", "/ru/wow/professions/alchemy/region/eu"]) assert.equal((await get(path)).status, 404, path);
    assert.equal((await get("/wow/professions/no-such-profession")).status, 404);
  });

  it("the unfiltered Mythic+ data pages answer from their cached views under their own address", async () => {
    for (const path of ["/wow/mythic-plus/stats", "/ru/wow/mythic-plus/comps", "/wow/mythic-plus/leaderboard", "/wow/mythic-plus/leaderboard/holy-priest"]) {
      const page = await get(path);
      assert.equal(page.status, 200, path);
      assert.equal(canonicalOf(page.body), `${origin}${path}`, path);
    }
    for (const path of ["/wow/mythic-plus/cached/stats", "/ru/wow/mythic-plus/cached/leaderboard/holy-priest"]) assert.equal((await get(path)).status, 404, path);
  });
});
