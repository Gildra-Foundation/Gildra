import { PageShell } from "@/components/layout/PageShell";
import type { Metadata } from "next";
import { DatabaseDirectory } from "@/components/DatabaseDirectory";
import { getCatalogCategories, getCatalogEntityTypes, getCatalogPage, getCatalogProducts } from "@/lib/api/client";

export const metadata: Metadata = {
  title: "База данных World of Warcraft — Gildra",
  description:
    "Структурированный каталог World of Warcraft: предметы, заклинания, задания, существа, карты и игровые системы.",
  alternates: { languages: { en: "/database", ru: "/ru/database" } },
};

export default async function DatabasePageRu({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; product?: string; type?: string; category?: string; facet?: string | string[]; cursor?: string; minLevel?: string; maxLevel?: string; minRequiredLevel?: string; maxRequiredLevel?: string }>;
}) {
  const filters = await searchParams;
  const product = filters.product ?? "wow";
  const facets = Array.isArray(filters.facet) ? filters.facet : filters.facet ? [filters.facet] : [];
  const [catalog, categories, entityTypes, products] = await Promise.all([
    getCatalogPage({ locale: "ru_RU", product, type: filters.type, query: filters.q, category: filters.category, facets, cursor: filters.cursor, minItemLevel: optionalNumber(filters.minLevel), maxItemLevel: optionalNumber(filters.maxLevel), minRequiredLevel: optionalNumber(filters.minRequiredLevel), maxRequiredLevel: optionalNumber(filters.maxRequiredLevel) }),
    getCatalogCategories("ru_RU", filters.type ?? "", product),
    getCatalogEntityTypes("ru_RU", product),
    getCatalogProducts(),
  ]);
  return (
    <PageShell lang="ru" variant="route">
            <DatabaseDirectory
              lang="ru"
              catalog={catalog}
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
    </PageShell>
  );
}

function optionalNumber(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
