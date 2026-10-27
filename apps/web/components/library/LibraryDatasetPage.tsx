import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { LibraryWorkspace } from "@/components/library/LibraryWorkspace";
import { CatalogTotal } from "@/components/database/CatalogTotal";
import { PageShell } from "@/components/layout/PageShell";
import { LibraryUnavailable } from "@/components/library/LibraryUnavailable";
import { libraryCopy, libraryDatasetLine, libraryGroupText } from "@/components/library/libraryCopy";
import { formatCount } from "@/components/database/databaseCopy";
import { libraryCardLayout, libraryRails } from "@/components/library/libraryRails";
import { getCatalogCategories, getCatalogEntityTypes, getCatalogPage, getCatalogProducts, getLibraryDatasets } from "@/lib/api/client";
import { requireCatalogSession } from "@/lib/library/server";

export type LibraryDatasetFilters = { q?: string; product?: string; facet?: string | string[]; cursor?: string; minLevel?: string; maxLevel?: string; minRequiredLevel?: string; maxRequiredLevel?: string };

function optionalNumber(value?: string) { const parsed = Number(value); return value && Number.isFinite(parsed) ? parsed : undefined; }

/**
 * /library/<dataset> and the RU mirror: the dataset's heading (trail back to the
 * library, the dataset's area as eyebrow, one counter) above its workspace.
 */
export async function LibraryDatasetPage({ lang, slug, filters }: { lang: "en" | "ru"; slug: string; filters: LibraryDatasetFilters }) {
  const copy = libraryCopy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  const locale = lang === "ru" ? "ru_RU" as const : "en_US" as const;
  const product = filters.product || "wow";
  await requireCatalogSession(`${prefix}/library/${encodeURIComponent(slug)}${product === "wow" ? "" : `?product=${encodeURIComponent(product)}`}`);
  const unavailable = <PageShell lang={lang}><AtlasFrame as="div" lang={lang}><LibraryUnavailable lang={lang} href={`${prefix}/library`} /></AtlasFrame></PageShell>;
  let datasets;
  try {
    datasets = await getLibraryDatasets(locale, product);
  } catch (error) {
    console.error("library dataset list unavailable", error);
    return unavailable;
  }
  const dataset = datasets.find((entry) => entry.slug === slug);
  if (!dataset) notFound();
  const facets = (Array.isArray(filters.facet) ? filters.facet : filters.facet ? [filters.facet] : []).filter(Boolean);
  const catalogParams = { locale, product, dataset: dataset.slug, facets, query: filters.q, cursor: filters.cursor, minItemLevel: optionalNumber(filters.minLevel), maxItemLevel: optionalNumber(filters.maxLevel), minRequiredLevel: optionalNumber(filters.minRequiredLevel), maxRequiredLevel: optionalNumber(filters.maxRequiredLevel) };
  let catalog, categories, entityTypes, products;
  try {
    [catalog, categories, entityTypes, products] = await Promise.all([
      getCatalogPage({ ...catalogParams, includeTotal: false }),
      getCatalogCategories(locale, dataset.entityType, product), getCatalogEntityTypes(locale, product), getCatalogProducts(),
    ]);
  } catch (error) {
    console.error("library dataset unavailable", error);
    return unavailable;
  }
  const levels = { minLevel: filters.minLevel ?? "", maxLevel: filters.maxLevel ?? "", minRequiredLevel: filters.minRequiredLevel ?? "", maxRequiredLevel: filters.maxRequiredLevel ?? "" };
  return (
    <PageShell lang={lang}>
      <AtlasFrame as="div" lang={lang} scene="archive" dataAttributes={{ "data-library-root": true }}>
        <AtlasHero
          eyebrow={libraryGroupText[dataset.group]?.[lang]}
          statsLabel={copy.statsLabel}
          stats={dataset.entityCount ? [{ value: formatCount(dataset.entityCount, lang), label: copy.statRecords }] : undefined}
          breadcrumbs={[{ label: copy.wow, href: `${prefix}/wow` }, { label: copy.library, href: `${prefix}/library${product === "wow" ? "" : `?product=${encodeURIComponent(product)}`}` }, { label: dataset.name }]}
          breadcrumbsLabel={copy.breadcrumbsLabel}
          title={dataset.name}
          lede={libraryDatasetLine(dataset, lang) || undefined}
        />
        <LibraryWorkspace
          lang={lang}
          dataset={dataset}
          totalCount={<Suspense fallback="…"><CatalogTotal params={{ ...catalogParams, cursor: undefined }} /></Suspense>}
          catalog={catalog}
          categories={categories}
          entityType={entityTypes.find((entry) => entry.type === dataset.entityType)}
          products={products}
          query={filters.q ?? ""}
          selectedProduct={product}
          selectedFacets={facets}
          cursor={filters.cursor ?? ""}
          levels={levels}
          layout={libraryCardLayout(dataset.slug)}
          rails={libraryRails(dataset.slug, categories, lang)}
        />
      </AtlasFrame>
    </PageShell>
  );
}
