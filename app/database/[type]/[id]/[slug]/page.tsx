import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntityDetailPage } from "@/components/database/EntityDetailPage";
import { getCatalogEntity, getCatalogEntityComparison, getCatalogEntityQuality, getCatalogEntityTypes, getCatalogEntityVersions, getCatalogRelationships } from "@/lib/api/client";
import { cleanWowText, formatQuestText } from "@/lib/gameText";

type Props = { params: Promise<{ type: string; id: string; slug: string }>; searchParams?: Promise<{ fromBuildId?: string; toBuildId?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, type } = await params;
  const entity = await getCatalogEntity(id, "en_US");
  if (!entity || entity.type !== type) return {};
  const rawDescription = entity.description || entity.tooltip?.plainText || `${entity.name} — World of Warcraft database entry.`;
  const description = entity.type === "quest" ? formatQuestText(rawDescription, "en") : cleanWowText(rawDescription, "en");
  const canonical = `/database/${type}/${id}/${entity.slug}`;
  return { title: `${entity.name} — Gildra Database`, description: description.slice(0, 160), alternates: { canonical, languages: { en: canonical, ru: `/ru/database/${type}/${id}/${entity.slug}` } }, robots: entity.name && (entity.description || entity.tooltip) ? "index, follow" : "noindex, follow" };
}

export default async function Page({ params, searchParams }: Props) {
  const { id, type } = await params;
  const comparisonFilters = await searchParams;
  const fromBuildId = optionalBuildID(comparisonFilters?.fromBuildId);
  const toBuildId = optionalBuildID(comparisonFilters?.toBuildId);
  const [entity, entityTypes, relationships, quality, versions, comparison] = await Promise.all([
    getCatalogEntity(id, "en_US"), getCatalogEntityTypes("en_US"), getCatalogRelationships(id, "en_US", 100),
    getCatalogEntityQuality(id, "en_US"), getCatalogEntityVersions(id, "en_US"), getCatalogEntityComparison(id, "en_US", fromBuildId, toBuildId),
  ]);
  if (!entity || entity.type !== type) notFound();
  return <EntityDetailPage entity={entity} entityType={entityTypes.find((entry) => entry.type === entity.type)} relationships={relationships} quality={quality} versions={versions} comparison={comparison} selectedFromBuildId={fromBuildId} selectedToBuildId={toBuildId} lang="en" />;
}

function optionalBuildID(value?: string) { const parsed = Number(value); return value && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined; }
