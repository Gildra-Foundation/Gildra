import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DatabaseDirectory } from "@/components/DatabaseDirectory";
import { Footer } from "@/components/Footer";
import { Icons } from "@/components/Icons";
import { TopNav } from "@/components/TopNav";
import { getCatalogCategories, getCatalogEntityTypes, getCatalogPage, getCatalogProducts, getLibraryDatasets } from "@/lib/api/client";

type Filters = { q?: string; product?: string; facet?: string | string[]; cursor?: string; minLevel?: string; maxLevel?: string; minRequiredLevel?: string; maxRequiredLevel?: string };

export async function generateMetadata({ params }: { params: Promise<{ dataset: string }> }): Promise<Metadata> {
  const { dataset } = await params;
  return { title: `${dataset.replaceAll("-", " ")} — Библиотека Gildra`, alternates: { languages: { en: `/library/${dataset}`, ru: `/ru/library/${dataset}` } } };
}

export default async function LibraryDatasetPageRu({ params, searchParams }: { params: Promise<{ dataset: string }>; searchParams: Promise<Filters> }) {
  const [{ dataset: slug }, filters] = await Promise.all([params, searchParams]);
  const product = filters.product ?? "wow";
  const datasets = await getLibraryDatasets("ru_RU", product);
  const dataset = datasets.find((entry) => entry.slug === slug);
  if (!dataset) notFound();
  const facets = Array.isArray(filters.facet) ? filters.facet : filters.facet ? [filters.facet] : [];
  const [catalog, categories, entityTypes, products] = await Promise.all([
    getCatalogPage({ locale: "ru_RU", product, dataset: dataset.slug, facets, query: filters.q, cursor: filters.cursor, minItemLevel: optionalNumber(filters.minLevel), maxItemLevel: optionalNumber(filters.maxLevel), minRequiredLevel: optionalNumber(filters.minRequiredLevel), maxRequiredLevel: optionalNumber(filters.maxRequiredLevel) }),
    getCatalogCategories("ru_RU", dataset.entityType, product), getCatalogEntityTypes("ru_RU", product), getCatalogProducts(),
  ]);
  return <><Icons /><TopNav /><div className="app"><main className="main"><div className="section route-section"><DatabaseDirectory lang="ru" catalog={catalog} categories={categories} entityTypes={entityTypes} products={products} query={filters.q ?? ""} selectedProduct={product} selectedType={dataset.entityType} selectedCategory="" selectedFacets={facets} cursor={filters.cursor ?? ""} minItemLevel={filters.minLevel ?? ""} maxItemLevel={filters.maxLevel ?? ""} minRequiredLevel={filters.minRequiredLevel ?? ""} maxRequiredLevel={filters.maxRequiredLevel ?? ""} libraryDataset={{ slug: dataset.slug, name: dataset.name, description: dataset.description, itemClassId: dataset.itemClassId }} /></div></main><Footer lang="ru" /></div></>;
}

function optionalNumber(value?: string) { const parsed = Number(value); return value && Number.isFinite(parsed) ? parsed : undefined; }
