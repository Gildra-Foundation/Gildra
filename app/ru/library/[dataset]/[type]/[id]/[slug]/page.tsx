import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntityDetailPage } from "@/components/database/EntityDetailPage";
import { getCatalogEntity, getCatalogEntityComparison, getCatalogEntityQuality, getCatalogEntityTypes, getCatalogEntityVersions, getCatalogRelationships, getLibraryDatasets } from "@/lib/api/client";
import { catalogSessionPresent, requireCatalogSession } from "@/lib/library/server";

type Props = { params: Promise<{ dataset: string; type: string; id: string; slug: string }>; searchParams?: Promise<{ fromBuildId?: string; toBuildId?: string; product?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  if (!(await catalogSessionPresent())) return { title: "Библиотека Gildra" };
  const [{ id, type, dataset }, filters] = await Promise.all([params, searchParams]);
  const entity = await getCatalogEntity(id, "ru_RU", dataset);
  if (!entity || entity.type !== type) return {};
  const name = entity.name || `${type.replaceAll("_", " ")} #${entity.externalId}`;
  const product = filters?.product ?? "wow";
  const productQuery = product === "wow" ? "" : `?product=${encodeURIComponent(product)}`;
  const canonical = `/ru/library/${dataset}/${type}/${id}/${entity.slug}${productQuery}`;
  return { title: `${name} — Библиотека Gildra`, description: (entity.description || entity.tooltip?.plainText || `${name} — запись библиотеки World of Warcraft.`).slice(0, 160), alternates: { canonical, languages: { en: canonical.slice(3), ru: canonical } } };
}

export default async function Page({ params, searchParams }: Props) {
  const [routeParams, filters] = await Promise.all([params, searchParams]);
  const { dataset: datasetSlug, id, type } = routeParams;
  const product = filters?.product ?? "wow";
  await requireCatalogSession(`/ru/library/${encodeURIComponent(datasetSlug)}/${encodeURIComponent(type)}/${encodeURIComponent(id)}/${encodeURIComponent(routeParams.slug)}${product === "wow" ? "" : `?product=${encodeURIComponent(product)}`}`);
  const fromBuildId = optionalBuildID(filters?.fromBuildId);
  const toBuildId = optionalBuildID(filters?.toBuildId);
  const [entity, datasets, entityTypes, relationships, quality, versions, comparison] = await Promise.all([
    getCatalogEntity(id, "ru_RU", datasetSlug), getLibraryDatasets("ru_RU", product), getCatalogEntityTypes("ru_RU", product),
    getCatalogRelationships(id, "ru_RU", 100), getCatalogEntityQuality(id, "ru_RU"), getCatalogEntityVersions(id, "ru_RU"),
    getCatalogEntityComparison(id, "ru_RU", fromBuildId, toBuildId),
  ]);
  const dataset = datasets.find((entry) => entry.slug === datasetSlug);
  if (!entity || !dataset || entity.type !== type || entity.type !== dataset.entityType || entity.product !== product) notFound();
  return <EntityDetailPage entity={entity} entityType={entityTypes.find((entry) => entry.type === entity.type)} relationships={relationships} quality={quality} versions={versions} comparison={comparison} selectedFromBuildId={fromBuildId} selectedToBuildId={toBuildId} lang="ru" libraryDataset={{ slug: dataset.slug, name: dataset.name }} />;
}

function optionalBuildID(value?: string) { const parsed = Number(value); return value && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined; }
