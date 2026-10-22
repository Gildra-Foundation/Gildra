import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RotationLabRoute } from "@/components/platform/rotation/RotationLabRoute";
import { getRotationPreset } from "@/lib/platform/rotation/repository";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { pairedAlternates } from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ spec: string }> }): Promise<Metadata> {
  const spec = (await params).spec;
  const theme = getTalentSpecTheme(spec);
  // WoW tools stay out of the index for the MVP (owner decision 2026-10-12), like the other WoW pages.
  return theme ? { alternates: pairedAlternates("ru", `/wow/rotation/${spec}`), robots: { index: false, follow: true }, title: `Лаборатория ротации ${theme.specNameRu} — Gildra`, description: `Расчёт, настройка и тренировка ротации специализации «${theme.specNameRu}».` } : {};
}

export default async function Page({ params, searchParams }: { params: Promise<{ spec: string }>; searchParams: Promise<{ character?: string; mode?: string }> }) {
  const { spec } = await params;
  const query = await searchParams;
  const theme = getTalentSpecTheme(spec);
  if (!theme) notFound();
  return <RotationLabRoute locale="ru" theme={theme} preset={getRotationPreset(spec, "ru")} characterSlug={query.character?.slice(0, 240)} dataMode={query.mode === "fixture" ? "fixture" : "battle-net"} />;
}
