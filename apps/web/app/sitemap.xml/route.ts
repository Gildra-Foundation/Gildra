import { siteOrigin, xmlEscape, xmlResponse } from "@/lib/sitemap";
import { isGameVisible } from "@/lib/games/registry";
import { runtimeFlags } from "@/lib/flags";
import { getCatalogSitemapEntries, getLibraryDatasets } from "@/lib/api/client";
import { LIBRARY_TYPE_DATASET } from "@/lib/library/recordPath";
import { entriesHaveLocales, recordSitemapShards } from "@/lib/library/recordSitemap";

export const dynamic = "force-dynamic";

/** The record files of the library: per home dataset, language and UUID shard (lib/library/recordSitemap.ts). */
async function recordSitemaps(): Promise<string[]> {
  try {
    // The API lists only served records with Russian slugs since the sitemap-entries fix; before it, none.
    const [datasets, probe] = await Promise.all([getLibraryDatasets("en_US"), getCatalogSitemapEntries("class")]);
    if (!probe.length || !entriesHaveLocales(probe)) return [];
    return datasets
      .filter((dataset) => dataset.entityCount > 0 && LIBRARY_TYPE_DATASET[dataset.entityType] === dataset.slug)
      .flatMap((dataset) => recordSitemapShards(dataset.entityCount).flatMap((shard) =>
        ["en", "ru"].map((lang) => `${siteOrigin}/sitemaps/library/${encodeURIComponent(dataset.slug)}/${lang}/${shard}`)));
  } catch (error) {
    console.error("library record sitemaps unavailable", error);
    return [];
  }
}

export async function GET() {
  // Only sub-sitemaps with URLs: a hidden game's sitemap and a private library's are empty urlsets,
  // so the index lists them only while they are public. /sitemaps/database/* stays an empty urlset.
  const catalogPublic = runtimeFlags().catalogPublic;
  const locations = [
    `${siteOrigin}/sitemaps/static`,
    ...(catalogPublic ? [`${siteOrigin}/sitemaps/library`, ...await recordSitemaps()] : []),
    ...(isGameVisible("league-of-legends") ? [`${siteOrigin}/sitemaps/league-of-legends`] : []),
  ];
  const entries = locations.map((location) => `<sitemap><loc>${xmlEscape(location)}</loc></sitemap>`).join("");
  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`);
}
