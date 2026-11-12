import type { Lang } from "@/lib/i18n-paths";
import { LIBRARY_HIDDEN_DATASETS, LIBRARY_TYPE_DATASET, libraryRecordPath } from "@/lib/library/recordPath";
import { LIBRARY_INTERNAL_NAME } from "@/lib/library/internalName";
import { siteOrigin, xmlEscape } from "@/lib/sitemap";

/**
 * Sitemaps of library records: one file per dataset, language and UUID shard
 * (/sitemaps/library/<dataset>/<en|ru>/<all|0-f|00-ff>). Record ids are random
 * UUIDs, so a one-character prefix holds a sixteenth of a dataset: a file stays
 * well under the 50 000-URL limit (spells, the largest dataset, ~26 000 a file).
 */
export const RECORD_SITEMAP_LIMIT = 40_000;

/** UUID prefixes splitting `count` records into files of at most RECORD_SITEMAP_LIMIT (expected). */
export function recordSitemapShards(count: number): string[] {
  if (count <= RECORD_SITEMAP_LIMIT) return ["all"];
  const width = count <= RECORD_SITEMAP_LIMIT * 16 ? 1 : 2;
  return Array.from({ length: 16 ** width }, (_, index) => index.toString(16).padStart(width, "0"));
}

/** Records per API request: a cold read of a larger shard can outlast the API's 20 s request deadline. */
export const RECORD_REQUEST_LIMIT = 2_500;

/**
 * The API shards one file is read from: the file's prefix, lengthened (up to two characters)
 * until a request holds at most RECORD_REQUEST_LIMIT of the dataset's `count` records (expected).
 */
export function requestShards(shard: string, count: number): string[] {
  const own = shard === "all" ? "" : shard;
  let width = own.length;
  while (width < 2 && count / 16 ** width > RECORD_REQUEST_LIMIT) width += 1;
  const extra = width - own.length;
  return Array.from({ length: 16 ** extra }, (_, index) => own + (extra ? index.toString(16).padStart(extra, "0") : ""));
}
export const isRecordShard = (shard: string) => /^(?:all|[0-9a-f]{1,2})$/.test(shard);

/** Datasets that are the home of their record type: records are listed there (lib/library/recordPath.ts). */
export const homeDatasetType = (dataset: string) =>
  Object.entries(LIBRARY_TYPE_DATASET).find(([, slug]) => slug === dataset)?.[0];

/** Datasets with record files: a home dataset that the library shows to players. */
export const datasetHasRecordSitemap = (dataset: string) => Boolean(homeDatasetType(dataset)) && !LIBRARY_HIDDEN_DATASETS.has(dataset);

/**
 * A record the lists leave out, told by its slug (a sitemap entry has no name): the developers' tags
 * and a leading patch number ("10-2-7-timewalking-season-…"). Its page is `noindex`.
 */
export function internalRecordSlug(slug: string, type?: string) {
  const words = slug.replaceAll("-", " ");
  return LIBRARY_INTERNAL_NAME.test(words) || /^\d{1,2} (?:\d{1,2}|x) /.test(words) || Boolean(type && NOT_PLAYABLE_SLUGS[type]?.has(slug));
}

/**
 * The classes and specializations that are not a player's choice (isInternalRecord tells them by
 * game id, which a sitemap entry does not carry): the follower-dungeon classes, the levelling
 * "Initial" specializations, the Adventurer's and the hunter pets'. No playable one shares a slug.
 */
const NOT_PLAYABLE_SLUGS: Record<string, ReadonlySet<string>> = {
  class: new Set(["adventurer", "traveler"]),
  specialization: new Set(["initial", "adventurer", "ferocity", "tenacity", "cunning"]),
};

export type RecordSitemapEntry = { id: string; type: string; slug: string; slugRu?: string | null; updatedAt?: string };

/** Does the API list only served records with Russian slugs (sitemap-entries with `slugRu`)? */
export const entriesHaveLocales = (entries: readonly object[]) => entries.length === 0 || entries.some((entry) => "slugRu" in entry);

const urlOf = (path: string) => `${siteOrigin}${path}`;

/**
 * The <url> elements of one language file: every record in English, in Russian only the records
 * with a Russian name of their own (`slugRu`); each names its language twins (hreflang).
 */
export function recordSitemapUrls(entries: readonly RecordSitemapEntry[], lang: Lang): string[] {
  return entries.flatMap((entry) => {
    if (internalRecordSlug(entry.slug, entry.type) || (lang === "ru" && !entry.slugRu)) return [];
    const en = urlOf(libraryRecordPath("en", entry.type, entry.id, entry.slug));
    const ru = entry.slugRu ? urlOf(libraryRecordPath("ru", entry.type, entry.id, entry.slugRu)) : null;
    const alternates = [
      `<xhtml:link rel="alternate" hreflang="en" href="${xmlEscape(en)}"/>`,
      ...(ru ? [`<xhtml:link rel="alternate" hreflang="ru" href="${xmlEscape(ru)}"/>`] : []),
      `<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(en)}"/>`,
    ].join("");
    const lastmod = entry.updatedAt && !Number.isNaN(Date.parse(entry.updatedAt)) ? `<lastmod>${entry.updatedAt.slice(0, 10)}</lastmod>` : "";
    return [`<url><loc>${xmlEscape(lang === "ru" ? ru! : en)}</loc>${lastmod}${alternates}</url>`];
  });
}

export const URLSET_OPEN = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">';
export const URLSET_CLOSE = "</urlset>";
