import { siteOrigin, xmlEscape, xmlResponse } from "@/lib/sitemap";
import { isGameVisible } from "@/lib/games/registry";
import { runtimeFlags } from "@/lib/flags";

export const dynamic = "force-dynamic";

export async function GET() {
  // Only sub-sitemaps with URLs: a hidden game's sitemap and a private library's are empty urlsets,
  // so the index lists them only while they are public. Library records have no sitemap yet
  // (app/sitemaps/library/route.ts says why); /sitemaps/database/* stays an empty urlset.
  const locations = [
    `${siteOrigin}/sitemaps/static`,
    ...(runtimeFlags().catalogPublic ? [`${siteOrigin}/sitemaps/library`] : []),
    ...(isGameVisible("league-of-legends") ? [`${siteOrigin}/sitemaps/league-of-legends`] : []),
  ];
  const entries = locations.map((location) => `<sitemap><loc>${xmlEscape(location)}</loc></sitemap>`).join("");
  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`);
}
