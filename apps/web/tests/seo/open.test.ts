import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Search-engine opening against a running server (npm run test:seo):
 *   SEO_BASE_URL=http://localhost:3420 npm run test:seo
 * Every sitemap URL (or SEO_SAMPLE of them, spread evenly) answers 200 without
 * noindex, with a canonical on itself and the sitemap's hreflang alternates;
 * private and service pages stay noindex. URLs in the sitemaps name the
 * canonical origin (https://gildra.net); they are fetched from SEO_BASE_URL.
 */
const base = (process.env.SEO_BASE_URL ?? "http://localhost:3420").replace(/\/$/, "");
const origin = (process.env.SEO_CANONICAL_ORIGIN ?? "https://gildra.net").replace(/\/$/, "");
const sample = Number(process.env.SEO_SAMPLE ?? 0);
/** The site root is the same URL with or without its slash. */
const same = (a: string | undefined, b: string) => a !== undefined && a.replace(/\/$/, "") === b.replace(/\/$/, "");
const local = (url: string) => `${base}${new URL(url).pathname}${new URL(url).search}`;

async function get(url: string) {
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(180_000) });
  return { status: response.status, body: await response.text() };
}

const robotsMeta = (html: string) => html.match(/<meta[^>]+name="robots"[^>]+content="([^"]*)"/i)?.[1] ?? "";
const canonical = (html: string) => html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1];
const hreflangs = (html: string) => new Map([...html.matchAll(/<link[^>]+rel="alternate"[^>]+hrefLang="([^"]+)"[^>]+href="([^"]+)"/gi)].map((match) => [match[1].toLowerCase(), match[2]]));

type Entry = { loc: string; alternates: Map<string, string> };
const entriesOf = (xml: string): Entry[] => [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => ({
  loc: match[1].match(/<loc>([^<]+)<\/loc>/)![1].replaceAll("&amp;", "&"),
  alternates: new Map([...match[1].matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((item) => [item[1], item[2].replaceAll("&amp;", "&")])),
}));

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (cursor < items.length) await run(items[cursor++]); }));
}

describe("seo: sitemap and robots", async () => {
  const index = await get(`${base}/sitemap.xml`);
  const children = [...index.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const entries: Entry[] = [];
  for (const child of children) entries.push(...entriesOf((await get(local(child))).body));

  it("the index lists only live sub-sitemaps on the canonical origin", async () => {
    assert.equal(index.status, 200);
    assert.ok(children.length > 0);
    assert.ok(!children.some((child) => child.includes("league-of-legends")), "LoL is hidden for the MVP");
    for (const child of children) {
      assert.ok(child.startsWith(`${origin}/`), child);
      const response = await get(local(child));
      assert.equal(response.status, 200, child);
      assert.ok(entriesOf(response.body).length > 0, `${child} is empty`);
    }
  });

  it("every sitemap URL is unique, on the canonical origin, and its alternates are listed too", () => {
    const locations = new Set(entries.map((entry) => entry.loc));
    assert.equal(locations.size, entries.length);
    for (const entry of entries) {
      assert.ok(entry.loc.startsWith(origin), entry.loc);
      for (const href of entry.alternates.values()) assert.ok(locations.has(href), `${entry.loc} → ${href}`);
    }
  });

  it(`sitemap URLs answer 200, indexable, canonical on themselves (${sample || "all"})`, async () => {
    const step = sample > 0 ? Math.max(1, Math.floor(entries.length / sample)) : 1;
    const picked = entries.filter((_, position) => position % step === 0);
    assert.ok(picked.length >= Math.min(40, entries.length), `checked ${picked.length}`);
    const problems: string[] = [];
    await pool(picked, 4, async (entry) => {
      const { status, body } = await get(local(entry.loc));
      if (status !== 200) return void problems.push(`${entry.loc}: status ${status}`);
      if (/noindex/i.test(robotsMeta(body))) problems.push(`${entry.loc}: ${robotsMeta(body)}`);
      if (!same(canonical(body), entry.loc)) problems.push(`${entry.loc}: canonical ${canonical(body)}`);
      const page = hreflangs(body);
      for (const [lang, href] of entry.alternates) if (!same(page.get(lang), href)) problems.push(`${entry.loc}: hreflang ${lang} ${page.get(lang)} ≠ ${href}`);
    });
    assert.deepEqual(problems, []);
    console.log(`# checked ${picked.length} of ${entries.length} sitemap URLs`);
  });

  it("robots.txt names the sitemap and keeps service paths closed", async () => {
    const { status, body } = await get(`${base}/robots.txt`);
    assert.equal(status, 200);
    assert.match(body, new RegExp(`Sitemap: ${origin}/sitemap.xml`));
    for (const path of ["/api/", "/api-console", "/analytics", "/dev/"]) assert.match(body, new RegExp(`Disallow: ${path}\\n`));
  });
});

describe("seo: closed pages stay noindex", () => {
  const closed = ["/search", "/ru/search", "/wow/characters", "/ru/wow/characters", "/wow/characters/eu--realm--name", "/wow/shared/token",
    "/talents/holy-priest", "/ru/talents/holy-priest", "/wow/rotation/holy-priest", "/ru/wow/rotation/holy-priest", "/api-console", "/dev/atlas", "/no-such-page", "/league-of-legends", "/analytics", "/blueprints"];
  for (const path of closed) {
    it(path, async () => {
      const { status, body } = await get(`${base}${path}`);
      if (status >= 300 && status < 400) return; // a redirect is never indexed itself
      assert.match(robotsMeta(body), /noindex/, `${path} (${status})`);
    });
  }
});
