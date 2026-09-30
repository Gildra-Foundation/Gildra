import { siteOrigin, xmlEscape, xmlResponse } from "@/lib/sitemap";

export const revalidate = 3600;
export const dynamic = "force-dynamic";

export async function GET() {
  const locations = [`${siteOrigin}/sitemaps/static`, `${siteOrigin}/sitemaps/league-of-legends`];

  const entries = locations.map((location) => `<sitemap><loc>${xmlEscape(location)}</loc></sitemap>`).join("");
  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`);
}
