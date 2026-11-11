import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { catalogLocaleView } from "@/lib/catalogLocale";
import { EntityDetailPage } from "@/components/database/EntityDetailPage";
import { LibraryModelSlot } from "@/components/library/model/LibraryModelSlot";
import { getCatalogEntity, getCatalogEntityTypes, getCatalogRelationships, getLibraryDatasets } from "@/lib/api/client";
import { catalogReadable, requireCatalogSession } from "@/lib/library/server";
import { LIBRARY_LOOSE_RECORDS, LIBRARY_TYPE_DATASET, libraryRecordPath } from "@/lib/library/recordPath";
import type { Lang } from "@/lib/i18n-paths";

export type LibraryRecordParams = Promise<{ dataset: string; id: string; slug: string }>;
export type LibraryRecordSearch = Promise<{ product?: string }> | undefined;

const words = {
  en: { site: "Gildra Library", fallback: (name: string, set?: string) => `${name}${set ? ` (${set})` : ""} — World of Warcraft library entry with its tooltip, details and related records.` },
  ru: { site: "Библиотека Gildra", fallback: (name: string, set?: string) => `${name}${set ? ` (${set})` : ""} — запись библиотеки World of Warcraft: подсказка, свойства и связанные записи.` },
} as const;

const locale = (lang: Lang) => (lang === "ru" ? "ru_RU" as const : "en_US" as const);
// Record ids are UUIDs; anything else is an unknown address (the API answers 400 for it).
const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decoded(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

/** The record of the address, or null: unknown id, another edition. */
async function routeRecord(lang: Lang, dataset: string, id: string, product: string) {
  if (!RECORD_ID.test(id)) return null;
  const loose = dataset === LIBRARY_LOOSE_RECORDS;
  const entity = await getCatalogEntity(id, locale(lang), loose ? "" : dataset).then((record) => record ? catalogLocaleView(record, lang) : null);
  if (!entity || entity.product !== product) return null;
  return entity;
}

export async function libraryRecordMetadata(lang: Lang, params: LibraryRecordParams, searchParams: LibraryRecordSearch): Promise<Metadata> {
  if (!(await catalogReadable())) return { title: words[lang].site };
  const [{ id, dataset }, filters] = await Promise.all([params, searchParams]);
  const product = filters?.product ?? "wow";
  const [entity, twin, datasets] = await Promise.all([
    routeRecord(lang, dataset, id, product),
    getCatalogEntity(id, locale(lang === "ru" ? "en" : "ru")).then((record) => record ? catalogLocaleView(record, lang === "ru" ? "en" : "ru") : null).catch(() => null),
    getLibraryDatasets(locale(lang), product).catch(() => []),
  ]);
  const setName = datasets.find((item) => item.slug === dataset)?.name;
  if (!entity) return {};
  const type = entity.type;
  const name = entity.name || `${type.replaceAll("_", " ")} #${entity.externalId}`;
  const canonical = libraryRecordPath(lang, type, id, entity.slug || entity.externalId, product);
  const other = libraryRecordPath(lang === "ru" ? "en" : "ru", type, id, twin?.slug || entity.slug || entity.externalId, product);
  const en = lang === "en" ? canonical : other;
  const ru = lang === "ru" ? canonical : other;
  // A Russian page whose record has no Russian name of its own (the game left it untranslated) is not
  // a page of its own: it stays out of the index and the English page names no Russian twin. The
  // record sitemap lists the same Russian pages (API sitemap-entries `slugRu`).
  const russian = lang === "ru" ? entity : twin;
  const ruOwn = Boolean(russian?.name) && !russian?.localeFallback;
  // A long record name keeps the title within a search result: the site name alone closes it.
  const title = `${name} — ${words[lang].site}`.length > 65 ? `${name} — WowArcana` : `${name} — ${words[lang].site}`;
  const text = entity.description || entity.tooltip?.plainText || "";
  // A one-line game text ("Season 14 Elite") says too little on its own: the record's name and kind follow it.
  const description = (text.length >= 70 ? text : text ? `${text} ${words[lang].fallback(name, setName)}` : words[lang].fallback(name, setName)).slice(0, 160);
  return {
    title,
    description,
    ...(lang === "ru" && !ruOwn ? { robots: { index: false, follow: true } } : {}),
    // No openGraph object here: it would replace the inherited library card image (app/**/library/opengraph-image.tsx).
    alternates: { canonical, languages: ruOwn ? { en, ru, "x-default": en } : { en, "x-default": en } },
  };
}

/**
 * One library record (`/library/<dataset>/<id>/<slug>` and the /ru twin). A
 * type with its own dataset lives only there, so another dataset of the same
 * type (weapons for an item) or the shared "records" path moves permanently to
 * it, as does a stale slug. The old `/library/<dataset>/<type>/<id>/<slug>`
 * answers 308 from its own route handler; a truncated old address
 * (`/library/<dataset>/<type>/<id>`) lands here and moves too.
 */
export async function LibraryRecordRoute({ lang, params, searchParams }: { lang: Lang; params: LibraryRecordParams; searchParams: LibraryRecordSearch }) {
  const [routeParams, filters] = await Promise.all([params, searchParams]);
  const { dataset: datasetSlug, id, slug } = routeParams;
  const product = filters?.product ?? "wow";
  const productQuery = product === "wow" ? "" : `?product=${encodeURIComponent(product)}`;
  if (!RECORD_ID.test(id) && RECORD_ID.test(slug) && id in LIBRARY_TYPE_DATASET) {
    permanentRedirect(`${lang === "ru" ? "/ru" : ""}/library/${LIBRARY_TYPE_DATASET[id]}/${encodeURIComponent(slug)}/record${productQuery}`);
  }
  const here = `${lang === "ru" ? "/ru" : ""}/library/${encodeURIComponent(datasetSlug)}/${encodeURIComponent(id)}/${encodeURIComponent(slug)}${productQuery}`;
  await requireCatalogSession(here);
  const loose = datasetSlug === LIBRARY_LOOSE_RECORDS;
  const [entity, datasets, entityTypes, relationships] = await Promise.all([
    routeRecord(lang, datasetSlug, id, product),
    getLibraryDatasets(locale(lang), product),
    getCatalogEntityTypes(locale(lang), product),
    getCatalogRelationships(id, locale(lang), 100).catch(() => []),
  ]);
  const dataset = loose ? undefined : datasets.find((entry) => entry.slug === datasetSlug);
  if (!entity || (!loose && (!dataset || dataset.entityType !== entity.type))) notFound();
  const type = entity.type;
  const home = LIBRARY_TYPE_DATASET[type];
  const ownSlug = entity.slug || String(entity.externalId);
  if ((home && home !== datasetSlug) || (loose && home) || decoded(slug) !== ownSlug) {
    permanentRedirect(libraryRecordPath(lang, type, id, ownSlug, product));
  }
  const model = dataset
    ? await LibraryModelSlot({ dataset: dataset.slug, type: entity.type, id: entity.id, externalId: entity.externalId, name: entity.name || String(entity.externalId), lang })
    : null;
  return (
    <EntityDetailPage entity={entity} entityType={entityTypes.find((entry) => entry.type === entity.type)} relationships={relationships} lang={lang}
      libraryDataset={dataset ? { slug: dataset.slug, name: dataset.name } : undefined} model={model}
      canonicalPath={libraryRecordPath(lang, type, id, ownSlug, product)} />
  );
}
