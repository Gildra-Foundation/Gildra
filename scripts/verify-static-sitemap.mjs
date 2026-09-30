import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const baseUrl = String(process.env.SITEMAP_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const canonicalOrigin = String(process.env.SITEMAP_CANONICAL_ORIGIN ?? "https://gildra.net").replace(/\/$/, "");
const outputPath = path.resolve(process.cwd(), process.env.SITEMAP_REPORT ?? "docs/reports/wow/static-sitemap-verification.json");
const xmlResponse = await fetch(`${baseUrl}/sitemaps/static`, { signal: AbortSignal.timeout(30_000) });
if (!xmlResponse.ok) throw new Error(`Static sitemap returned ${xmlResponse.status}`);
const xml = await xmlResponse.text();
const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => ({
  location: match[1].match(/<loc>([^<]+)<\/loc>/)?.[1] ?? "",
  alternates: [...match[1].matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((item) => ({ lang: item[1], href: item[2] })),
}));
if (entries.length > 50_000) throw new Error(`Static sitemap contains ${entries.length} URLs; limit is 50000`);
if (Buffer.byteLength(xml) > 50 * 1024 * 1024) throw new Error(`Static sitemap exceeds 50 MB`);
const locationSet = new Set(entries.map((entry) => entry.location));
const baseOrigin = new URL(baseUrl).origin;
const results = new Array(entries.length);
let cursor = 0;

const absoluteCanonical = (value) => {
  if (!value) return null;
  try { const url = new URL(value, canonicalOrigin); return `${url.origin}${url.pathname.replace(/\/$/, "") || "/"}`; } catch { return null; }
};
const localUrl = (value) => { const url = new URL(value); return `${baseUrl}${url.pathname}${url.search}`; };

await Promise.all(Array.from({ length: 8 }, async () => {
  while (cursor < entries.length) {
    const index = cursor++; const entry = entries[index]; const issues = [];
    try {
      const entryUrl = new URL(entry.location);
      if (![canonicalOrigin, baseOrigin].includes(entryUrl.origin)) issues.push("foreign-origin");
      for (const alternate of entry.alternates) if (!locationSet.has(alternate.href)) issues.push(`alternate-not-in-sitemap:${alternate.lang}`);
      const response = await fetch(localUrl(entry.location), { redirect: "manual", signal: AbortSignal.timeout(30_000) });
      const html = await response.text();
      if (response.status !== 200) issues.push(`status:${response.status}`);
      if (!/<title[^>]*>[^<]+<\/title>/i.test(html)) issues.push("title-missing");
      if (!/<h1[^>]*>[\s\S]*?\S[\s\S]*?<\/h1>/i.test(html)) issues.push("h1-missing");
      if (/page not found|страница не найдена|дерево .{0,80} недоступно/i.test(html.replace(/<[^>]+>/g, " "))) issues.push("soft404");
      if (/<meta[^>]+content=["'][^"']*noindex/i.test(html)) issues.push("noindex");
      const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1] ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1];
      const expectedCanonical = `${canonicalOrigin}${entryUrl.pathname.replace(/\/$/, "") || "/"}`;
      if (absoluteCanonical(canonical) !== expectedCanonical) issues.push(`canonical:${canonical ?? "missing"}`);
      const pageAlternates = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]).filter((tag) => /\brel=["']alternate["']/i.test(tag)).map((tag) => ({
        lang: tag.match(/\bhreflang=["']([^"']+)/i)?.[1]?.toLowerCase(),
        href: tag.match(/\bhref=["']([^"']+)/i)?.[1],
      }));
      for (const alternate of entry.alternates) {
        const expectedHref = `${canonicalOrigin}${new URL(alternate.href).pathname.replace(/\/$/, "") || "/"}`;
        const pageAlternate = pageAlternates.find((item) => item.lang === alternate.lang.toLowerCase());
        if (!pageAlternate || absoluteCanonical(pageAlternate.href) !== expectedHref) issues.push(`hreflang:${alternate.lang}`);
      }
      const expectedLang = new URL(entry.location).pathname === "/ru" || new URL(entry.location).pathname.startsWith("/ru/") ? "ru" : "en";
      const lang = html.match(/<html[^>]+lang=["']([^"']+)/i)?.[1];
      if (lang !== expectedLang) issues.push(`lang:${lang ?? "missing"}`);
      const imagePaths = [...new Set([...html.matchAll(/<img[^>]+src=["']([^"']+)/gi)].map((match) => match[1].replaceAll("&amp;", "&")).filter((src) => src.startsWith("/")))];
      await Promise.all(imagePaths.map(async (src) => { const image = await fetch(`${baseUrl}${src}`, { signal: AbortSignal.timeout(30_000) }); if (!image.ok) issues.push(`broken-image:${src}:${image.status}`); }));
      for (const fragment of [...html.matchAll(/<a[^>]+href=["']#([^"']+)/gi)].map((match) => decodeURIComponent(match[1]))) {
        if (!new RegExp(`(?:id|name)=["']${fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(html)) issues.push(`missing-fragment:${fragment}`);
      }
    } catch (error) { issues.push(error instanceof Error ? error.message : String(error)); }
    results[index] = { ...entry, issues, valid: issues.length === 0 };
  }
}));

const summary = { generatedAt: new Date().toISOString(), baseUrl, canonicalOrigin, urls: results.length, violations: results.filter((result) => !result.valid).length, valid: results.every((result) => result.valid) };
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify({ summary, results }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (!summary.valid) process.exitCode = 1;
