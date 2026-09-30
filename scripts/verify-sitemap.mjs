import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const baseUrl = String(process.env.SITEMAP_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const canonicalOrigin = String(process.env.SITEMAP_CANONICAL_ORIGIN ?? "https://gildra.net").replace(/\/$/, "");
const outputPath = path.resolve(process.cwd(), process.env.SITEMAP_REPORT ?? "docs/reports/wow/sitemap-verification.json");
const maxSitemapBytes = 50 * 1024 * 1024;
const maxSitemapUrls = 50_000;
const concurrency = Math.max(1, Number(process.env.SITEMAP_CONCURRENCY ?? 8));
const baseOrigin = new URL(baseUrl).origin;
const allowedSitemapOrigins = new Set([canonicalOrigin, baseOrigin]);

const decodeXml = (value) => value
  .replaceAll("&amp;", "&")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&quot;", '"')
  .replaceAll("&apos;", "'");

const absoluteCanonical = (value) => {
  if (!value) return null;
  try {
    const url = new URL(value, canonicalOrigin);
    return `${url.origin}${url.pathname.replace(/\/$/, "") || "/"}`;
  } catch {
    return null;
  }
};

const localUrl = (value) => {
  const url = new URL(value);
  return `${baseUrl}${url.pathname}${url.search}`;
};

const parseUrlEntries = (xml, sourceSitemap) => [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => ({
  sourceSitemap,
  location: decodeXml(match[1].match(/<loc>([^<]+)<\/loc>/)?.[1] ?? ""),
  alternates: [...match[1].matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((item) => ({
    lang: decodeXml(item[1]),
    href: decodeXml(item[2]),
  })),
}));

const sitemapIssues = [];
const sitemapFiles = [];
const indexResponse = await fetch(`${baseUrl}/sitemap.xml`, {
  redirect: "manual",
  signal: AbortSignal.timeout(30_000),
});
const indexXml = await indexResponse.text();
if (indexResponse.status !== 200) sitemapIssues.push(`index-status:${indexResponse.status}`);
if (!/^(?:application|text)\/xml\b/i.test(indexResponse.headers.get("content-type") ?? "")) sitemapIssues.push("index-content-type");
if (Buffer.byteLength(indexXml) > maxSitemapBytes) sitemapIssues.push("index-size-limit");
if (!/<sitemapindex\b/i.test(indexXml)) sitemapIssues.push("index-root-missing");

const sitemapLocations = [...indexXml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/g)]
  .map((match) => decodeXml(match[1]));
if (new Set(sitemapLocations).size !== sitemapLocations.length) sitemapIssues.push("duplicate-child-sitemap");

const entries = [];
for (const location of sitemapLocations) {
  const issues = [];
  let response;
  let xml = "";
  try {
    const sitemapUrl = new URL(location);
    if (!allowedSitemapOrigins.has(sitemapUrl.origin)) issues.push("foreign-origin");
    response = await fetch(localUrl(location), { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    xml = await response.text();
    if (response.status !== 200) issues.push(`status:${response.status}`);
    if (!/^(?:application|text)\/xml\b/i.test(response.headers.get("content-type") ?? "")) issues.push("content-type");
    if (Buffer.byteLength(xml) > maxSitemapBytes) issues.push("size-limit");
    if (!/<urlset\b/i.test(xml)) issues.push("urlset-root-missing");
    const childEntries = parseUrlEntries(xml, location);
    if (childEntries.length > maxSitemapUrls) issues.push(`url-limit:${childEntries.length}`);
    entries.push(...childEntries);
    sitemapFiles.push({
      location,
      status: response.status,
      bytes: Buffer.byteLength(xml),
      urls: childEntries.length,
      degraded: response.headers.get("x-gildra-sitemap-degraded"),
      issues,
      valid: issues.length === 0,
    });
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
    sitemapFiles.push({ location, status: response?.status ?? null, bytes: Buffer.byteLength(xml), urls: 0, degraded: null, issues, valid: false });
  }
}

const locations = entries.map((entry) => entry.location);
const locationSet = new Set(locations);
if (locationSet.size !== locations.length) sitemapIssues.push(`duplicate-url:${locations.length - locationSet.size}`);
const results = new Array(entries.length);
const assetChecks = new Map();
let cursor = 0;

const checkAsset = (src) => {
  if (!assetChecks.has(src)) {
    assetChecks.set(src, (async () => {
      try {
        const response = await fetch(`${baseUrl}${src}`, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
        return response.ok ? null : response.status;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    })());
  }
  return assetChecks.get(src);
};

await Promise.all(Array.from({ length: concurrency }, async () => {
  while (cursor < entries.length) {
    const index = cursor++;
    const entry = entries[index];
    const issues = [];
    try {
      const entryUrl = new URL(entry.location);
      if (!allowedSitemapOrigins.has(entryUrl.origin)) issues.push("foreign-origin");
      for (const requiredLang of ["en", "ru", "x-default"]) {
        if (!entry.alternates.some((alternate) => alternate.lang.toLowerCase() === requiredLang)) issues.push(`sitemap-hreflang-missing:${requiredLang}`);
      }
      for (const alternate of entry.alternates) {
        if (!locationSet.has(alternate.href)) issues.push(`alternate-not-in-sitemap:${alternate.lang}`);
      }

      const response = await fetch(localUrl(entry.location), { redirect: "manual", signal: AbortSignal.timeout(30_000) });
      const html = await response.text();
      if (response.status !== 200) issues.push(`status:${response.status}`);
      if (!/^text\/html\b/i.test(response.headers.get("content-type") ?? "")) issues.push("content-type");
      if (!/<title[^>]*>[^<]+<\/title>/i.test(html)) issues.push("title-missing");
      if (!/<h1[^>]*>[\s\S]*?\S[\s\S]*?<\/h1>/i.test(html)) issues.push("h1-missing");
      if (/page not found|страница не найдена|дерево .{0,80} недоступно/i.test(html.replace(/<[^>]+>/g, " "))) issues.push("soft404");
      if (/<meta[^>]+content=["'][^"']*noindex/i.test(html)) issues.push("noindex");

      const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1]
        ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1];
      const expectedCanonical = `${canonicalOrigin}${entryUrl.pathname.replace(/\/$/, "") || "/"}`;
      if (absoluteCanonical(canonical) !== expectedCanonical) issues.push(`canonical:${canonical ?? "missing"}`);

      const pageAlternates = [...html.matchAll(/<link\b[^>]*>/gi)]
        .map((match) => match[0])
        .filter((tag) => /\brel=["']alternate["']/i.test(tag))
        .map((tag) => ({
          lang: tag.match(/\bhreflang=["']([^"']+)/i)?.[1]?.toLowerCase(),
          href: tag.match(/\bhref=["']([^"']+)/i)?.[1],
        }));
      for (const alternate of entry.alternates) {
        const expectedHref = `${canonicalOrigin}${new URL(alternate.href).pathname.replace(/\/$/, "") || "/"}`;
        const pageAlternate = pageAlternates.find((item) => item.lang === alternate.lang.toLowerCase());
        if (!pageAlternate || absoluteCanonical(pageAlternate.href) !== expectedHref) issues.push(`hreflang:${alternate.lang}`);
      }

      const expectedLang = entryUrl.pathname === "/ru" || entryUrl.pathname.startsWith("/ru/") ? "ru" : "en";
      const lang = html.match(/<html[^>]+lang=["']([^"']+)/i)?.[1];
      if (lang !== expectedLang) issues.push(`lang:${lang ?? "missing"}`);

      const imagePaths = [...html.matchAll(/<img[^>]+src=["']([^"']+)/gi)].map((match) => match[1]);
      const scriptPaths = [...html.matchAll(/<script[^>]+src=["']([^"']+)/gi)].map((match) => match[1]);
      const linkedAssetPaths = [...html.matchAll(/<link\b[^>]*>/gi)]
        .map((match) => match[0])
        .filter((tag) => /\brel=["']stylesheet["']/i.test(tag) || (/\brel=["']preload["']/i.test(tag) && /\bas=["']font["']/i.test(tag)))
        .map((tag) => tag.match(/\bhref=["']([^"']+)/i)?.[1] ?? "");
      const assetPaths = [...new Set([...imagePaths, ...scriptPaths, ...linkedAssetPaths]
        .map((src) => src.replaceAll("&amp;", "&"))
        .filter((src) => src.startsWith("/")))];
      await Promise.all(assetPaths.map(async (src) => {
        const failure = await checkAsset(src);
        if (failure !== null) issues.push(`broken-asset:${src}:${failure}`);
      }));

      for (const encodedFragment of [...html.matchAll(/<a[^>]+href=["']#([^"']+)/gi)].map((match) => match[1])) {
        const fragment = decodeURIComponent(encodedFragment);
        const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (!new RegExp(`(?:id|name)=["']${escaped}["']`).test(html)) issues.push(`missing-fragment:${fragment}`);
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
    results[index] = { ...entry, issues, valid: issues.length === 0 };
    const completed = results.filter(Boolean).length;
    if (completed % 50 === 0 || completed === entries.length) console.log(`Checked ${completed}/${entries.length} indexed URLs`);
  }
}));

const pageViolations = results.filter((result) => !result.valid).length;
const sitemapFileViolations = sitemapFiles.filter((result) => !result.valid).length;
const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  canonicalOrigin,
  sitemapFiles: sitemapFiles.length,
  degradedSitemapFiles: sitemapFiles.filter((result) => result.degraded).length,
  urls: results.length,
  pageViolations,
  sitemapFileViolations,
  sitemapIndexViolations: sitemapIssues.length,
  checkedAssets: assetChecks.size,
  violations: pageViolations + sitemapFileViolations + sitemapIssues.length,
  valid: pageViolations === 0 && sitemapFileViolations === 0 && sitemapIssues.length === 0,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify({ summary, sitemapIssues, sitemapFiles, results }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (!summary.valid) process.exitCode = 1;
