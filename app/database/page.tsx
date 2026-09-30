import { PageShell } from "@/components/layout/PageShell";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DatabaseDirectory } from "@/components/DatabaseDirectory";
import { CatalogTotal } from "@/components/database/CatalogTotal";
import { DatabaseLoadingContent } from "@/components/database/DatabaseLoading";
import { getCatalogCategories, getCatalogEntityTypes, getCatalogPage, getCatalogProducts } from "@/lib/api/client";
import { preloadSharedWowBackground } from "@/lib/wow/sharedWowBackgroundPreload";

export const metadata: Metadata = {
  title: "World of Warcraft Database — Gildra",
  description:
    "Browse Gildra's structured World of Warcraft catalog: items, spells, quests, creatures, maps and game systems.",
  alternates: { canonical: "/database", languages: { en: "/database", ru: "/ru/database", "x-default": "/database" } },
};

type DatabasePageProps = {
  searchParams: Promise<{ q?: string; product?: string; type?: string; category?: string; facet?: string | string[]; cursor?: string; minLevel?: string; maxLevel?: string; minRequiredLevel?: string; maxRequiredLevel?: string }>;
};

export default function DatabasePage({ searchParams }: DatabasePageProps) {
  preloadSharedWowBackground();
  return (
    <PageShell lang="en" variant="route">
      <Suspense fallback={<DatabaseLoadingContent lang="en" />}>
        <DatabaseCatalog searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function DatabaseCatalog({
  searchParams,
}: DatabasePageProps) {
  const filters = await searchParams;
  const product = filters.product ?? "wow";
  const facets = Array.isArray(filters.facet) ? filters.facet : filters.facet ? [filters.facet] : [];
  const catalogParams = { locale: "en_US" as const, product, type: filters.type, query: filters.q, category: filters.category, facets, cursor: filters.cursor, minItemLevel: optionalNumber(filters.minLevel), maxItemLevel: optionalNumber(filters.maxLevel), minRequiredLevel: optionalNumber(filters.minRequiredLevel), maxRequiredLevel: optionalNumber(filters.maxRequiredLevel) };
  const catalogTotalParams = { ...catalogParams, cursor: undefined };
  const [catalog, categories, entityTypes, products] = await Promise.all([
    getCatalogPage({ ...catalogParams, includeTotal: false }),
    getCatalogCategories("en_US", filters.type ?? "", product),
    getCatalogEntityTypes("en_US", product),
    getCatalogProducts(),
  ]);
  const hasNarrowingFilters = Boolean(filters.q?.trim() || filters.category || facets.length
    || optionalNumber(filters.minLevel) !== undefined || optionalNumber(filters.maxLevel) !== undefined
    || optionalNumber(filters.minRequiredLevel) !== undefined || optionalNumber(filters.maxRequiredLevel) !== undefined);
  const knownTotal = !hasNarrowingFilters
    ? filters.type ? entityTypes.find((entry) => entry.type === filters.type)?.count : entityTypes.reduce((sum, entry) => sum + entry.count, 0)
    : undefined;
  const totalCount = knownTotal === undefined
    ? <Suspense fallback="…"><CatalogTotal params={catalogTotalParams} /></Suspense>
    : knownTotal.toLocaleString("en-US");
  return (
    <DatabaseDirectory
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
  );
}

function optionalNumber(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
