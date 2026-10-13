import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { EntityDetailPage } from "@/components/database/EntityDetailPage";
import { getCatalogEntity, getCatalogEntityComparison, getCatalogEntityQuality, getCatalogEntityTypes, getCatalogEntityVersions, getCatalogRelationships } from "@/lib/api/client";
import { formatQuestText } from "@/lib/gameText";

/**
 * One catalog record page in either language (`/database/:type/:id/:slug` and
 * its /ru twin). Unknown ids and types answer a real 404 before anything else
 * is fetched; a wrong slug moves permanently to the record's own slug; hreflang
 * names each language's canonical address (the slugs differ per language).
 */
type Lang = "en" | "ru";
export type EntityRouteParams = Promise<{ type: string; id: string; slug: string }>;
export type EntityRouteSearch = Promise<{ fromBuildId?: string; toBuildId?: string }> | undefined;

const catalogLocale = (lang: Lang) => (lang === "ru" ? "ru_RU" : "en_US");
const recordPath = (lang: Lang, type: string, id: string, slug: string) => `${lang === "ru" ? "/ru" : ""}/database/${type}/${id}/${slug}`;
const words = {
  en: { fallback: (name: string) => `${name} — World of Warcraft database entry.`, suffix: "World of Warcraft database on Gildra", title: (name: string) => `${name} — Gildra Database` },
  ru: { fallback: (name: string) => `${name} — запись базы данных World of Warcraft.`, suffix: "база данных World of Warcraft на Gildra", title: (name: string) => `${name} — База Gildra` },
} as const;

// Record ids are UUIDs; anything else is an unknown address (the API answers 400 for it).
const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decoded(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** A description worth a search snippet: short or name-only texts get the record's kind and the site. */
function snippet(lang: Lang, name: string, text: string, kind: string | undefined) {
  const own = text.trim();
  if (own.length >= 70 && own !== name) return own.slice(0, 160);
  const head = `${name}${kind ? ` · ${kind}` : ""} — ${words[lang].suffix}.`;
  return (own && own !== name && !own.startsWith(name) ? `${head} ${own}` : head).slice(0, 160);
}

export async function entityMetadata(params: EntityRouteParams, lang: Lang): Promise<Metadata> {
  const { id, type } = await params;
  if (!RECORD_ID.test(id)) return {};
  const other: Lang = lang === "ru" ? "en" : "ru";
  const [entity, twin, types] = await Promise.all([
    getCatalogEntity(id, catalogLocale(lang)),
    getCatalogEntity(id, catalogLocale(other)).catch(() => null),
    getCatalogEntityTypes(catalogLocale(lang)).catch(() => []),
  ]);
  if (!entity || entity.type !== type) return {};
  const raw = entity.description || entity.tooltip?.plainText || words[lang].fallback(entity.name);
  const text = entity.type === "quest" ? formatQuestText(raw, lang) : raw;
  const canonical = recordPath(lang, type, id, entity.slug);
  const twinPath = recordPath(other, type, id, twin?.type === type && twin.slug ? twin.slug : entity.slug);
  const en = lang === "en" ? canonical : twinPath;
  const ru = lang === "ru" ? canonical : twinPath;
  return {
    title: words[lang].title(entity.name),
    description: snippet(lang, entity.name, text, types.find((entry) => entry.type === entity.type)?.label),
    alternates: { canonical, languages: { en, ru, "x-default": en } },
    robots: entity.name && (entity.description || entity.tooltip) ? "index, follow" : "noindex, follow",
  };
}

export async function EntityRoute({ params, searchParams, lang }: { params: EntityRouteParams; searchParams: EntityRouteSearch; lang: Lang }) {
  const { id, type, slug } = await params;
  if (!RECORD_ID.test(id)) notFound();
  const filters = await searchParams;
  const fromBuildId = optionalBuildID(filters?.fromBuildId);
  const toBuildId = optionalBuildID(filters?.toBuildId);
  const locale = catalogLocale(lang);
  // The rest of the record loads in parallel, but a missing record must answer
  // 404 first: those requests fail for an unknown id and would turn it into a 500.
  const rest = Promise.all([
    getCatalogEntityTypes(locale), getCatalogRelationships(id, locale, 100), getCatalogEntityQuality(id, locale),
    getCatalogEntityVersions(id, locale), getCatalogEntityComparison(id, locale, fromBuildId, toBuildId),
  ]);
  rest.catch(() => undefined);
  const entity = await getCatalogEntity(id, locale);
  if (!entity || entity.type !== type) notFound();
  if (entity.slug && decoded(slug) !== entity.slug) {
    const query = new URLSearchParams();
    if (fromBuildId) query.set("fromBuildId", String(fromBuildId));
    if (toBuildId) query.set("toBuildId", String(toBuildId));
    permanentRedirect(`${recordPath(lang, type, id, encodeURIComponent(entity.slug))}${query.size ? `?${query}` : ""}`);
  }
  const [entityTypes, relationships, quality, versions, comparison] = await rest;
  return <EntityDetailPage entity={entity} entityType={entityTypes.find((entry) => entry.type === entity.type)} relationships={relationships} quality={quality} versions={versions} comparison={comparison} selectedFromBuildId={fromBuildId} selectedToBuildId={toBuildId} lang={lang} />;
}

function optionalBuildID(value?: string) { const parsed = Number(value); return value && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined; }
