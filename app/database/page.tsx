import type { Metadata } from "next";
import { DatabaseDirectory } from "@/components/DatabaseDirectory";
import { Footer } from "@/components/Footer";
import { Icons } from "@/components/Icons";
import { TopNav } from "@/components/TopNav";
import { getCatalogCategories, getCatalogEntityTypes, getCatalogPage, getCatalogProducts } from "@/lib/api/client";
import type { CatalogAcquisitionMethod } from "@/lib/api/client";

export const metadata: Metadata = {
  title: "World of Warcraft Database — Gildra",
  description:
    "Browse Gildra's structured World of Warcraft catalog: items, spells, quests, creatures, maps and game systems.",
  alternates: { languages: { en: "/database", ru: "/ru/database" } },
};

export default async function DatabasePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; product?: string; type?: string; category?: string; facet?: string | string[]; acquisition?: string | string[]; cursor?: string; minLevel?: string; maxLevel?: string; minRequiredLevel?: string; maxRequiredLevel?: string }>;
}) {
  const filters = await searchParams;
  const product = filters.product ?? "wow";
  const facets = Array.isArray(filters.facet) ? filters.facet : filters.facet ? [filters.facet] : [];
  const acquisition = acquisitionMethods(filters.acquisition);
  const [catalog, categories, entityTypes, products] = await Promise.all([
    getCatalogPage({ locale: "en_US", product, type: filters.type, query: filters.q, category: filters.category, facets, acquisition, cursor: filters.cursor, minItemLevel: optionalNumber(filters.minLevel), maxItemLevel: optionalNumber(filters.maxLevel), minRequiredLevel: optionalNumber(filters.minRequiredLevel), maxRequiredLevel: optionalNumber(filters.maxRequiredLevel) }),
    getCatalogCategories("en_US", filters.type ?? "", product),
    getCatalogEntityTypes("en_US", product),
    getCatalogProducts(),
  ]);
  return (
    <>
      <Icons />
      <TopNav />
      <div className="app">
        <main className="main">
          <div className="section route-section">
            <DatabaseDirectory
              catalog={catalog}
              categories={categories}
              entityTypes={entityTypes}
              products={products}
              query={filters.q ?? ""}
              selectedProduct={product}
              selectedType={filters.type ?? ""}
              selectedCategory={filters.category ?? ""}
              selectedFacets={facets}
              selectedAcquisition={acquisition}
              cursor={filters.cursor ?? ""}
              minItemLevel={filters.minLevel ?? ""}
              maxItemLevel={filters.maxLevel ?? ""}
              minRequiredLevel={filters.minRequiredLevel ?? ""}
              maxRequiredLevel={filters.maxRequiredLevel ?? ""}
            />
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}

function acquisitionMethods(value?: string | string[]): CatalogAcquisitionMethod[] {
  const allowed = new Set<CatalogAcquisitionMethod>(["drop", "quest", "vendor", "crafting"]);
  return (Array.isArray(value) ? value : value ? [value] : []).filter((method): method is CatalogAcquisitionMethod => allowed.has(method as CatalogAcquisitionMethod));
}

function optionalNumber(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
