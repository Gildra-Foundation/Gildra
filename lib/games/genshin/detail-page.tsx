import { notFound } from "next/navigation";
import { GenshinEntityPage } from "@/components/platform/games/GenshinEntityPage";
import type { Lang } from "@/lib/i18n";
import { getPlatformHomeData } from "@/lib/platform/home/repository";
import { getGenshinEntityDetail, type GenshinEntityKind } from "./detail";

export async function renderGenshinEntityPage(kind: GenshinEntityKind, lang: Lang, slug: string) {
  const locale = lang === "ru" ? "ru_RU" : "en_US";
  const [home, entity] = await Promise.all([
    getPlatformHomeData(lang),
    getGenshinEntityDetail(kind, slug, locale),
  ]);
  if (!entity) notFound();
  return <GenshinEntityPage home={home} entity={entity} kind={kind} lang={lang} />;
}
