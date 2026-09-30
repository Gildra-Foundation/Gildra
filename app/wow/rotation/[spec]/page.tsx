import type { CSSProperties } from "react";
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlatformHeader } from "@/components/platform/home/PlatformHeader";
import { PlatformMotion } from "@/components/platform/home/PlatformMotion";
import { RotationLabPage } from "@/components/platform/rotation/RotationLabPage";
import { RotationLabSkeleton } from "@/components/platform/rotation/RotationLabSkeleton";
import { getPlatformHomeData } from "@/lib/platform/home/repository";
import { getRotationPreset } from "@/lib/platform/rotation/repository";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import homeStyles from "@/components/platform/home/rotationPageShell.module.css";
import labStyles from "@/components/platform/rotation/rotationLab.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ spec: string }> }): Promise<Metadata> {
  const theme = getTalentSpecTheme((await params).spec);
  return theme ? { title: `${theme.specName} ${theme.className} Rotation Lab — Gildra`, description: `Calculate, configure, and practice the ${theme.specName} rotation.` } : {};
}

export default async function Page({ params, searchParams }: { params: Promise<{ spec: string }>; searchParams: Promise<{ character?: string; mode?: string }> }) {
  const { spec } = await params;
  const query = await searchParams;
  const characterSlug = query.character?.slice(0, 240);
  const dataMode = query.mode === "fixture" ? "fixture" : "battle-net";
  const theme = getTalentSpecTheme(spec);
  if (!theme) notFound();
  const home = getPlatformHomeData("en");
  const preset = getRotationPreset(spec, "en");
  return (
    <Suspense fallback={<RotationLabSkeleton lang="en" showHeader={false} />}>
      <RotationPageContent home={home} preset={preset} spec={spec} characterSlug={characterSlug} dataMode={dataMode} />
    </Suspense>
  );
}

async function RotationPageContent({
  home: homePromise,
  preset: presetPromise,
  spec,
  characterSlug,
  dataMode,
}: {
  home: ReturnType<typeof getPlatformHomeData>;
  preset: ReturnType<typeof getRotationPreset>;
  spec: string;
  characterSlug?: string;
  dataMode: "fixture" | "battle-net";
}) {
  const [home, preset] = await Promise.all([homePromise, presetPromise]);
  const theme = getTalentSpecTheme(spec)!;
  const themeStyle = { "--rotation-accent": theme.accent, "--rotation-hot": theme.hot, "--rotation-deep": theme.deep, "--rotation-accent-rgb": theme.accentRgb, "--rotation-hot-rgb": theme.hotRgb, "--rotation-ambient-rgb": theme.ambientRgb } as CSSProperties;
  return (
    <div className={`${homeStyles.page} ${labStyles.shell}`} data-platform-home data-rotation-spec={theme.slug} data-rotation-motif={theme.motif} style={themeStyle}>
      <PlatformMotion />
      <PlatformHeader data={home} lang="en" active="game" scopeLabel="World of Warcraft" />
      <RotationLabPage preset={preset} lang="en" characterSlug={characterSlug} dataMode={dataMode} />
    </div>
  );
}
