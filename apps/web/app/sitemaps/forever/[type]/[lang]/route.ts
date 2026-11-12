import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { FOREVER_BUILD, foreverRecordPath, isForeverType, type ForeverSummary } from "@/lib/forever/database/contract";
import { foreverHasRussian } from "@/lib/forever/database/russian";
import { siteOrigin, xmlEscape, xmlResponse } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

/** Separate types/locales keep every sitemap below the 50,000 URL limit. */
export async function GET(_request: Request, context: { params: Promise<{ type: string; lang: string }> }) {
  const { type, lang } = await context.params;
  if (!isForeverType(type) || (lang !== "en" && lang !== "ru")) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(path.join(process.cwd(), "data/wow/forever/database", type, "index.json.gz"));
    const records = JSON.parse(gunzipSync(bytes).toString("utf8")) as ForeverSummary[];
    if (records.length > 50000 || records.some(record => record.edition !== "forever" || record.build !== FOREVER_BUILD || record.type !== type)) throw new Error("Invalid sitemap snapshot");
    // A record without a Russian name has no Russian page of its own (its /ru page is `noindex`,
    // lib/forever/database/metadata.ts): the Russian file leaves it out and the English entry names no twin.
    const urls = records.flatMap(record => {
      const own = foreverHasRussian(record);
      if (lang === "ru" && !own) return [];
      const en = siteOrigin + foreverRecordPath(type, record.id, "en");
      const ru = siteOrigin + foreverRecordPath(type, record.id, "ru");
      const twin = own ? `<xhtml:link rel="alternate" hreflang="ru" href="${xmlEscape(ru)}"/>` : "";
      return [`<url><loc>${xmlEscape(lang === "en" ? en : ru)}</loc><xhtml:link rel="alternate" hreflang="en" href="${xmlEscape(en)}"/>${twin}<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(en)}"/></url>`];
    });
    return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join("")}</urlset>`);
  } catch (error) {
    console.error("Forever sitemap unavailable", error);
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "Retry-After": "3600" } });
  }
}
