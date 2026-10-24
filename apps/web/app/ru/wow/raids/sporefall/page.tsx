import type { Metadata } from "next";
import { SporefallPage } from "@/components/wow/raid/SporefallPage";
import { gameContentEnabled, getPublishedRaids } from "@/lib/data/gamecontent/server";
import { ContentStatus, ContentUnavailable } from "@/components/gamecontent/ContentState";

const path = "/ru/wow/raids/sporefall";
export const revalidate = 60;
const legacyMetadata: Metadata = {
  title: "Sporefall — рейд Midnight — Gildra",
  description: "Страница подтверждённой идентичности рейда Sporefall и встречи Rotmire. Тактика и сущности скрыты до проверки.",
  alternates: { canonical: path, languages: { en: "/wow/raids/sporefall", ru: path, "x-default": "/wow/raids/sporefall" } },
  robots: { index: false, follow: true },
};
export async function generateMetadata(): Promise<Metadata> {
  if (!gameContentEnabled()) return legacyMetadata;
  const data = await getPublishedRaids().catch(() => null);
  const entry = data?.payload.catalog.entries.find((entry) => entry.slug === "sporefall");
  const names = entry?.names;
  return names ? { ...legacyMetadata, title: `${names.ru || names.en} — Gildra` } : { ...legacyMetadata, robots: { index: false, follow: true } };
}
export default async function Page() {
  if (gameContentEnabled()) {
    const data = await getPublishedRaids().catch(() => null);
    if (!data) return <ContentUnavailable locale="ru" />;
    return <div data-game-content-release={data.release.releaseId}><ContentStatus locale="ru" stale={data.stale} /><SporefallPage locale="ru" view="raid" content={data.payload} /></div>;
  }
  return <SporefallPage locale="ru" view="raid" />;
}
