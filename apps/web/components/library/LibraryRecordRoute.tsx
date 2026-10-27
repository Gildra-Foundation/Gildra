import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { catalogLocaleView } from "@/lib/catalogLocale";
import { EntityDetailPage } from "@/components/database/EntityDetailPage";
import { LibraryModelSlot } from "@/components/library/model/LibraryModelSlot";
import { getCatalogEntity, getCatalogEntityTypes, getCatalogRelationships, getLibraryDatasets } from "@/lib/api/client";
import { catalogReadable, requireCatalogSession } from "@/lib/library/server";
import { LIBRARY_LOOSE_RECORDS, LIBRARY_TYPE_DATASET, libraryRecordPath } from "@/lib/library/recordPath";
import type { Lang } from "@/lib/i18n-paths";

export type LibraryRecordParams = Promise<{ dataset: string; type: string; id: string; slug: string }>;
export type LibraryRecordSearch = Promise<{ product?: string }> | undefined;

const words = {
  en: { site: "Gildra Library", fallback: (name: string) => `${name} — World of Warcraft library entry.` },
  ru: { site: "Библиотека Gildra", fallback: (name: string) => `${name} — запись библиотеки World of Warcraft.` },
} as const;

const locale = (lang: Lang) => (lang === "ru" ? "ru_RU" as const : "en_US" as const);
// Record ids are UUIDs; anything else is an unknown address (the API answers 400 for it).
const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decoded(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

/** The record of the address, or null: unknown id, another type, another edition. */
async function routeRecord(lang: Lang, dataset: string, type: string, id: string, product: string) {
  if (!RECORD_ID.test(id)) return null;
  const loose = dataset === LIBRARY_LOOSE_RECORDS;
  const entity = await getCatalogEntity(id, locale(lang), loose ? "" : dataset).then((record) => record ? catalogLocaleView(record, lang) : null);
  if (!entity || entity.type !== type || entity.product !== product) return null;
  return entity;
}

export async function libraryRecordMetadata(lang: Lang, params: LibraryRecordParams, searchParams: LibraryRecordSearch): Promise<Metadata> {
  if (!(await catalogReadable())) return { title: words[lang].site };
  const [{ id, type, dataset }, filters] = await Promise.all([params, searchParams]);
  const product = filters?.product ?? "wow";
  const [entity, twin] = await Promise.all([
    routeRecord(lang, dataset, type, id, product),
    getCatalogEntity(id, locale(lang === "ru" ? "en" : "ru")).then((record) => record ? catalogLocaleView(record, lang === "ru" ? "en" : "ru") : null).catch(() => null),
  ]);
  if (!entity) return {};
  const name = entity.name || `${type.replaceAll("_", " ")} #${entity.externalId}`;
  const canonical = libraryRecordPath(lang, type, id, entity.slug || entity.externalId, product);
  const other = libraryRecordPath(lang === "ru" ? "en" : "ru", type, id, twin?.slug || entity.slug || entity.externalId, product);
  const en = lang === "en" ? canonical : other;
  const ru = lang === "ru" ? canonical : other;
  return {
    title: `${name} — ${words[lang].site}`,
    description: (entity.description || entity.tooltip?.plainText || words[lang].fallback(name)).slice(0, 160),
    alternates: { canonical, languages: { en, ru, "x-default": en } },
  };
}

/**
 * One library record (`/library/<dataset>/<type>/<id>/<slug>` and the /ru
 * twin). A type with its own dataset lives only there, so another dataset of
 * the same type (weapons for an item) or the shared "records" path moves
 * permanently to it, as does a stale slug.
 */
export async function LibraryRecordRoute({ lang, params, searchParams }: { lang: Lang; params: LibraryRecordParams; searchParams: LibraryRecordSearch }) {
  const [routeParams, filters] = await Promise.all([params, searchParams]);
  const { dataset: datasetSlug, id, type, slug } = routeParams;
  const product = filters?.product ?? "wow";
  const here = `${lang === "ru" ? "/ru" : ""}/library/${encodeURIComponent(datasetSlug)}/${encodeURIComponent(type)}/${encodeURIComponent(id)}/${encodeURIComponent(slug)}${product === "wow" ? "" : `?product=${encodeURIComponent(product)}`}`;
  await requireCatalogSession(here);
  const loose = datasetSlug === LIBRARY_LOOSE_RECORDS;
  const [entity, datasets, entityTypes, relationships] = await Promise.all([
    routeRecord(lang, datasetSlug, type, id, product),
    getLibraryDatasets(locale(lang), product),
    getCatalogEntityTypes(locale(lang), product),
    getCatalogRelationships(id, locale(lang), 100).catch(() => []),
  ]);
  const dataset = loose ? undefined : datasets.find((entry) => entry.slug === datasetSlug);
  if (!entity || (!loose && (!dataset || dataset.entityType !== type))) notFound();
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
      libraryDataset={dataset ? { slug: dataset.slug, name: dataset.name } : undefined} model={model} />
  );
}
