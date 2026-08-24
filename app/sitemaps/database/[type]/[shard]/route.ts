import { getCatalogSitemapEntries } from "@/lib/api/client";
import { siteOrigin, xmlEscape, xmlResponse } from "@/lib/sitemap";

export const revalidate = 3600;
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ type: string; shard: string }> },
) {
  const { type, shard } = await context.params;
  const prefix = shard === "all" ? "" : shard;
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(type) || !/^[0-9a-f]{0,2}$/.test(prefix)) {
    return new Response("Not found", { status: 404 });
  }
  const entries = await getCatalogSitemapEntries(type, prefix);
  const urls = entries.flatMap((entry) => {
    const en = `${siteOrigin}/database/${entry.type}/${entry.id}/${entry.slug}`;
    const ru = `${siteOrigin}/ru/database/${entry.type}/${entry.id}/${entry.slug}`;
    const alternates = `<xhtml:link rel="alternate" hreflang="en" href="${xmlEscape(en)}"/><xhtml:link rel="alternate" hreflang="ru" href="${xmlEscape(ru)}"/>`;
    const lastModified = xmlEscape(new Date(entry.updatedAt).toISOString());
    return [en, ru].map((location) => `<url><loc>${xmlEscape(location)}</loc><lastmod>${lastModified}</lastmod>${alternates}</url>`);
  }).join("");
  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`);
}
