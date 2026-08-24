import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntityDetailPage } from "@/components/database/EntityDetailPage";
import { getCatalogEntity, getCatalogEntityComparison, getCatalogEntityQuality, getCatalogEntityTypes, getCatalogEntityVersions, getCatalogRelationships } from "@/lib/api/client";
import { formatQuestText } from "@/lib/gameText";

type Props = { params: Promise<{ type: string; id: string; slug: string }>; searchParams?: Promise<{ fromBuildId?: string; toBuildId?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, type } = await params;
  const entity = await getCatalogEntity(id, "ru_RU");
  if (!entity || entity.type !== type) return {};
  const rawDescription = entity.description || entity.tooltip?.plainText || `${entity.name} — запись базы данных World of Warcraft.`;
  const description = entity.type === "quest" ? formatQuestText(rawDescription, "ru") : rawDescription;
  const canonical = `/ru/database/${type}/${id}/${entity.slug}`;
  return { title: `${entity.name} — База Gildra`, description: description.slice(0, 160), alternates: { canonical, languages: { en: `/database/${type}/${id}/${entity.slug}`, ru: canonical } }, robots: entity.name && (entity.description || entity.tooltip) ? "index, follow" : "noindex, follow" };
}

export default async function Page({ params, searchParams }: Props) {
  const { id, type } = await params;
  const comparisonFilters = await searchParams;
  const fromBuildId = optionalBuildID(comparisonFilters?.fromBuildId);
  const toBuildId = optionalBuildID(comparisonFilters?.toBuildId);
  const [entity, entityTypes, relationships, quality, versions, comparison] = await Promise.all([
    getCatalogEntity(id, "ru_RU"), getCatalogEntityTypes("ru_RU"), getCatalogRelationships(id, "ru_RU", 100),
    getCatalogEntityQuality(id, "ru_RU"), getCatalogEntityVersions(id, "ru_RU"), getCatalogEntityComparison(id, "ru_RU", fromBuildId, toBuildId),
  ]);
  if (!entity || entity.type !== type) notFound();
  return <EntityDetailPage entity={entity} entityType={entityTypes.find((entry) => entry.type === entity.type)} relationships={relationships} quality={quality} versions={versions} comparison={comparison} selectedFromBuildId={fromBuildId} selectedToBuildId={toBuildId} lang="ru" />;
}

function optionalBuildID(value?: string) { const parsed = Number(value); return value && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined; }
