import { libraryProduct, libraryProductPath, emptyProductDataset } from "@/lib/library/product";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { LibraryWorkspace } from "@/components/library/LibraryWorkspace";
import { CatalogTotal } from "@/components/database/CatalogTotal";
import { PageShell } from "@/components/layout/PageShell";
import { LibraryUnavailable } from "@/components/library/LibraryUnavailable";
import { LIBRARY_HIDDEN_DATASETS, libraryCopy, libraryDatasetLine, libraryGroupText } from "@/components/library/libraryCopy";
import { libraryCardLayout, libraryRails } from "@/components/library/libraryRails";
import { getCatalogCategories, getCatalogEntityTypes, getCatalogPage, getCatalogProducts, getLibraryDatasets, type CatalogPage } from "@/lib/api/client";
import { libraryDatasetHead, requireCatalogSession } from "@/lib/library/server";
import { pairedAlternates, withPageOpenGraph } from "@/lib/seo/metadata";
import type { Metadata } from "next";
import styles from "./library.module.css";

export type LibraryDatasetFilters = { q?: string; product?: string; facet?: string | string[]; cursor?: string; minLevel?: string; maxLevel?: string; minRequiredLevel?: string; maxRequiredLevel?: string };

/** Title, description (the dataset's line for players) and EN/RU alternates of /library/<dataset>. */
export async function libraryDatasetMetadata(lang: "en" | "ru", slug: string, selectedProduct?: string): Promise<Metadata> {
  const product = libraryProduct(selectedProduct);
  if (!product) notFound();
  const head = await libraryDatasetHead(slug, lang === "ru" ? "ru_RU" : "en_US", product);
  const line = libraryDatasetLine({ slug, description: head.description }, lang);
  const what = line ? `${line.charAt(0).toLowerCase()}${line.slice(1)}` : "";
  return withPageOpenGraph(lang, {
    ...(emptyProductDataset(head) || LIBRARY_HIDDEN_DATASETS.has(slug) ? { robots: { index: false, follow: true } } : {}),
    title: `${head.name} — ${libraryCopy[lang].site}`,
    ...(line ? { description: datasetDescription(lang, head.name, what) } : {}),
    alternates: pairedAlternates(lang, libraryProductPath(`/library/${slug}`, product)),
  });
}

/** "World of Warcraft Mounts: mounts and how to get them. In-game tooltips, …"; the second sentence only while it fits a snippet. */
function datasetDescription(lang: "en" | "ru", name: string, what: string) {
  const first = libraryCopy[lang].datasetDescription(name, what);
  const more = libraryCopy[lang].datasetDescriptionMore;
  return first.length + more.length <= 160 ? first + more : first;
}

function optionalNumber(value?: string) { const parsed = Number(value); return value && Number.isFinite(parsed) ? parsed : undefined; }

/**
 * /library/<dataset> and the RU mirror: the dataset's heading (trail back to the
 * library, the dataset's area as eyebrow, the counter under the copy as on the
 * reference hubs) above its workspace.
 */
export async function LibraryDatasetPage({ lang, slug, filters }: { lang: "en" | "ru"; slug: string; filters: LibraryDatasetFilters }) {
  const copy = libraryCopy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  const locale = lang === "ru" ? "ru_RU" as const : "en_US" as const;
  const product = libraryProduct(filters.product);
  if (!product) notFound();
  await requireCatalogSession(`${prefix}/library/${encodeURIComponent(slug)}${product === "wow" ? "" : `?product=${encodeURIComponent(product)}`}`);
  const unavailable = <PageShell lang={lang} frame><AtlasFrame lang={lang}><LibraryUnavailable lang={lang} href={`${prefix}/library`} /></AtlasFrame></PageShell>;
  // Settle speculative reads even when the dataset is missing or unavailable.
  const metadata = Promise.allSettled([getCatalogEntityTypes(locale, product), getCatalogProducts()]);
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
  // A filtered list the catalog cannot answer (a slow facet query) leaves the page and its filters in place;
  // only a failure of the plain list closes the page.
  const narrowed = facets.length > 0 || [filters.q, filters.cursor, filters.minLevel, filters.maxLevel, filters.minRequiredLevel, filters.maxRequiredLevel].some((value) => value?.trim());
  let listFailed = false;
  let catalog, categories, entityTypes, products;
  try {
    [catalog, categories, entityTypes, products] = await Promise.all([
      getCatalogPage({ ...catalogParams, includeTotal: false }).catch((error): CatalogPage => {
        if (!narrowed) throw error;
        console.error("library filtered list unavailable", error);
        listFailed = true;
        return { data: [], pagination: { hasMore: false } };
      }),
      getCatalogCategories(locale, dataset.entityType, product),
      metadata.then(([types]) => { if (types.status === "rejected") throw types.reason; return types.value; }),
      metadata.then(([, products]) => { if (products.status === "rejected") throw products.reason; return products.value; }),
    ]);
  } catch (error) {
    console.error("library dataset unavailable", error);
    return unavailable;
  }
  const levels = { minLevel: filters.minLevel ?? "", maxLevel: filters.maxLevel ?? "", minRequiredLevel: filters.minRequiredLevel ?? "", maxRequiredLevel: filters.maxRequiredLevel ?? "" };
  return (
    <PageShell lang={lang} frame>
      <AtlasFrame lang={lang} scene="archive" dataAttributes={{ "data-library-root": true }}>
        <AtlasHero
          eyebrow={libraryGroupText[dataset.group]?.[lang]}
          className={styles.hero}
          breadcrumbs={[{ label: copy.wow, href: prefix || "/" }, { label: copy.library, href: `${prefix}/library${product === "wow" ? "" : `?product=${encodeURIComponent(product)}`}` }, { label: dataset.name }]}
          breadcrumbsLabel={copy.breadcrumbsLabel}
          title={dataset.name}
          lede={libraryDatasetLine(dataset, lang) || undefined}
        />
        <LibraryWorkspace
          lang={lang}
          dataset={dataset}
          totalCount={listFailed ? undefined : <Suspense fallback="…"><CatalogTotal params={{ ...catalogParams, cursor: undefined }} /></Suspense>}
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
          failed={listFailed}
        />
      </AtlasFrame>
    </PageShell>
  );
}
