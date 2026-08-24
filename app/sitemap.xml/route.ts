import { getCatalogEntityTypes } from "@/lib/api/client";
import { siteOrigin, xmlEscape, xmlResponse } from "@/lib/sitemap";

export const revalidate = 3600;
export const dynamic = "force-dynamic";

function shardsFor(count: number) {
  if (count > 200_000) return Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, "0"));
  if (count > 20_000) return Array.from({ length: 16 }, (_, index) => index.toString(16));
  return ["all"];
}

export async function GET() {
  const types = await getCatalogEntityTypes("en_US");
  const locations = [`${siteOrigin}/sitemaps/static`];
  for (const entityType of types) {
    for (const shard of shardsFor(entityType.count)) {
      locations.push(`${siteOrigin}/sitemaps/database/${encodeURIComponent(entityType.type)}/${shard}`);
    }
  }
  const entries = locations.map((location) => `<sitemap><loc>${xmlEscape(location)}</loc></sitemap>`).join("");
  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`);
}
