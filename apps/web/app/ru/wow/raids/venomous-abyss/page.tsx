import type { Metadata } from "next";
import { VenomousAbyssPage } from "@/components/wow/raid/VenomousAbyssPage";
import { gameContentEnabled, getPublishedRaids } from "@/lib/data/gamecontent/server";
import { ContentStatus, ContentUnavailable } from "@/components/gamecontent/ContentState";

export const revalidate = 60;
const legacyMetadata: Metadata = {
  title: "Отравленная бездна — рейдовый гайд Gildra",
  description: "Индекс рейда Midnight · Сезон 2 с восемью страницами встреч и проверенным календарём поиска рейда. Детальная проверка сущностей продолжается.",
  alternates: {
    canonical: "/ru/wow/raids/venomous-abyss",
    languages: { en: "/wow/raids/venomous-abyss", ru: "/ru/wow/raids/venomous-abyss", "x-default": "/wow/raids/venomous-abyss" },
  },
  robots: { index: false, follow: true },
};

export async function generateMetadata(): Promise<Metadata> {
  if (!gameContentEnabled()) return legacyMetadata;
  const data = await getPublishedRaids().catch(() => null);
  const entry = data?.payload.catalog.entries.find((entry) => entry.slug === "venomous-abyss");
  const names = entry?.names;
  return names ? { ...legacyMetadata, title: `${names.ru || names.en} — Gildra` } : { ...legacyMetadata, robots: { index: false, follow: true } };
}
export default async function Page() {
  if (gameContentEnabled()) {
    const data = await getPublishedRaids().catch(() => null);
    if (!data) return <ContentUnavailable locale="ru" />;
    return <div data-game-content-release={data.release.releaseId}><ContentStatus locale="ru" stale={data.stale} /><VenomousAbyssPage locale="ru" content={data.payload} /></div>;
  }
  return <VenomousAbyssPage locale="ru" />;
}
