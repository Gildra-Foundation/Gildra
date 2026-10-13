import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RotationLabRoute } from "@/components/platform/rotation/RotationLabRoute";
import { getRotationPreset } from "@/lib/platform/rotation/repository";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ spec: string }> }): Promise<Metadata> {
  const theme = getTalentSpecTheme((await params).spec);
  return theme ? { title: `${theme.specName} ${theme.className} Rotation Lab — Gildra`, description: `Calculate, configure, and practice the ${theme.specName} rotation.` } : {};
}

export default async function Page({ params, searchParams }: { params: Promise<{ spec: string }>; searchParams: Promise<{ character?: string; mode?: string }> }) {
  const { spec } = await params;
  const query = await searchParams;
  const theme = getTalentSpecTheme(spec);
  if (!theme) notFound();
  return <RotationLabRoute locale="en" theme={theme} preset={getRotationPreset(spec, "en")} characterSlug={query.character?.slice(0, 240)} dataMode={query.mode === "fixture" ? "fixture" : "battle-net"} />;
}
