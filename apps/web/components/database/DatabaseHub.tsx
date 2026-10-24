import { Suspense } from "react";
import { AtlasFrame } from "@/components/atlas";
import { DatabaseDirectory } from "@/components/DatabaseDirectory";
import { CatalogTotal } from "@/components/database/CatalogTotal";
import { DatabaseHero, DatabaseSources } from "@/components/database/DatabaseHero";
import { DatabaseLoadingContent } from "@/components/database/DatabaseLoading";
import { formatCount } from "@/components/database/databaseCopy";
import { getCatalogCategories, getCatalogEntityTypes, getCatalogPage, getCatalogProducts } from "@/lib/api/client";
import type { Lang } from "@/lib/i18n";

export type DatabaseSearchParams = {
  q?: string; product?: string; type?: string; category?: string; facet?: string | string[]; cursor?: string;
  minLevel?: string; maxLevel?: string; minRequiredLevel?: string; maxRequiredLevel?: string;
};

/**
 * /database and /ru/database: atlas frame, hero with real catalog counters,
 * the server-rendered catalog workspace and the data-source line. The frame renders at once; the catalog
 * streams in behind a full-height skeleton so nothing below it (the footer)
 * jumps when the data arrives.
 */
export function DatabaseHub({ lang, searchParams }: { lang: Lang; searchParams: Promise<DatabaseSearchParams> }) {
  return (
    <AtlasFrame as="div" lang={lang} scene="archive" dataAttributes={{ "data-database-root": true }}>
      <Suspense fallback={<DatabaseLoadingContent lang={lang} />}>
        <DatabaseCatalog lang={lang} searchParams={searchParams} />
      </Suspense>
    </AtlasFrame>
  );
}

async function DatabaseCatalog({ lang, searchParams }: { lang: Lang; searchParams: Promise<DatabaseSearchParams> }) {
  const filters = await searchParams;
  const locale = lang === "ru" ? "ru_RU" as const : "en_US" as const;
  const product = filters.product || "wow";
  const facets = (Array.isArray(filters.facet) ? filters.facet : filters.facet ? [filters.facet] : []).filter(Boolean);
  const catalogParams = { locale, product, type: filters.type, query: filters.q, category: filters.category, facets, cursor: filters.cursor, minItemLevel: optionalNumber(filters.minLevel), maxItemLevel: optionalNumber(filters.maxLevel), minRequiredLevel: optionalNumber(filters.minRequiredLevel), maxRequiredLevel: optionalNumber(filters.maxRequiredLevel) };
  const catalogTotalParams = { ...catalogParams, cursor: undefined };
  const browseRecords = Boolean(filters.q?.trim() || filters.type || filters.category || facets.length || filters.cursor || filters.minLevel || filters.maxLevel || filters.minRequiredLevel || filters.maxRequiredLevel);
  const [catalog, categories, entityTypes, products] = await Promise.all([
    browseRecords ? getCatalogPage({ ...catalogParams, includeTotal: false }) : Promise.resolve({ data: [], pagination: { hasMore: false } }),
    getCatalogCategories(locale, filters.type ?? "", product),
    getCatalogEntityTypes(locale, product),
    getCatalogProducts(),
  ]);
  const hasNarrowingFilters = Boolean(filters.q?.trim() || filters.category || facets.length
    || optionalNumber(filters.minLevel) !== undefined || optionalNumber(filters.maxLevel) !== undefined
    || optionalNumber(filters.minRequiredLevel) !== undefined || optionalNumber(filters.maxRequiredLevel) !== undefined);
  const allRecords = entityTypes.reduce((sum, entry) => sum + entry.count, 0);
  const knownTotal = !hasNarrowingFilters
    ? filters.type ? entityTypes.find((entry) => entry.type === filters.type)?.count : allRecords
    : undefined;
  const totalCount = knownTotal === undefined
    ? <Suspense fallback="…"><CatalogTotal params={catalogTotalParams} /></Suspense>
    : formatCount(knownTotal, lang);
  return (
    <>
      <DatabaseHero lang={lang} stats={{ records: allRecords, types: entityTypes.filter((entry) => entry.count > 0).length }} />
      <DatabaseDirectory
        lang={lang}
        catalog={catalog}
        totalCount={totalCount}
        categories={categories}
        entityTypes={entityTypes}
        products={products}
        query={filters.q ?? ""}
        selectedProduct={product}
        selectedType={filters.type ?? ""}
        selectedCategory={filters.category ?? ""}
        selectedFacets={facets}
        cursor={filters.cursor ?? ""}
        minItemLevel={filters.minLevel ?? ""}
        maxItemLevel={filters.maxLevel ?? ""}
        minRequiredLevel={filters.minRequiredLevel ?? ""}
        maxRequiredLevel={filters.maxRequiredLevel ?? ""}
      />
      <DatabaseSources lang={lang} />
    </>
  );
}

function optionalNumber(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
