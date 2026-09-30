import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlatformHeader } from "@/components/platform/home/PlatformHeader";
import { PlatformMotion } from "@/components/platform/home/PlatformMotion";
import { RotationLabPage } from "@/components/platform/rotation/RotationLabPage";
import { getPlatformHomeData } from "@/lib/platform/home/repository";
import { getRotationPreset } from "@/lib/platform/rotation/repository";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import homeStyles from "@/components/platform/home/rotationPageShell.module.css";
import labStyles from "@/components/platform/rotation/rotationLab.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ spec: string }> }): Promise<Metadata> {
  const theme = getTalentSpecTheme((await params).spec);
  return theme ? { title: `Лаборатория ротации ${theme.specNameRu} — Gildra`, description: `Расчёт, настройка и тренировка ротации специализации «${theme.specNameRu}».` } : {};
}

export default async function Page({ params, searchParams }: { params: Promise<{ spec: string }>; searchParams: Promise<{ character?: string; mode?: string }> }) {
  const { spec } = await params;
  const query = await searchParams;
  const characterSlug = query.character?.slice(0, 240);
  const dataMode = query.mode === "fixture" ? "fixture" : "battle-net";
  const theme = getTalentSpecTheme(spec);
  if (!theme) notFound();
  const [home, preset] = await Promise.all([getPlatformHomeData("ru"), getRotationPreset(spec, "ru")]);
  const themeStyle = { "--rotation-accent": theme.accent, "--rotation-hot": theme.hot, "--rotation-deep": theme.deep, "--rotation-accent-rgb": theme.accentRgb, "--rotation-hot-rgb": theme.hotRgb, "--rotation-ambient-rgb": theme.ambientRgb } as CSSProperties;
  return (
    <div className={`${homeStyles.page} ${labStyles.shell}`} data-platform-home data-rotation-spec={theme.slug} data-rotation-motif={theme.motif} style={themeStyle}>
      <PlatformMotion />
      <PlatformHeader data={home} lang="ru" active="game" scopeLabel="World of Warcraft" />
      <RotationLabPage preset={preset} lang="ru" characterSlug={characterSlug} dataMode={dataMode} />
    </div>
  );
}
