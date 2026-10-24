import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SporefallPage } from "@/components/wow/raid/SporefallPage";
import { gameContentEnabled, getPublishedRaids } from "@/lib/data/gamecontent/server";
import { ContentStatus, ContentUnavailable } from "@/components/gamecontent/ContentState";

// Every valid slug is prerendered; anything else is a real 404, not a 200 page that says 404.
export const dynamicParams = false;

const path = "/ru/wow/raids/sporefall/rotmire";
export const revalidate = 60;
const legacyMetadata: Metadata = {
  title: "Rotmire — Sporefall — Gildra",
  description: "Страница подтверждённой идентичности Rotmire в Sporefall. Тактика, abilities, ID, иконки и loot ожидают проверки.",
  alternates: { canonical: path, languages: { en: "/wow/raids/sporefall/rotmire", ru: path, "x-default": "/wow/raids/sporefall/rotmire" } },
  robots: { index: false, follow: true },
};
export function generateStaticParams() { return [{ boss: "rotmire" }]; }
export async function generateMetadata(): Promise<Metadata> {
  if (!gameContentEnabled()) return legacyMetadata;
  const data = await getPublishedRaids().catch(() => null);
  const entry = data?.payload.catalog.entries.find((entry) => entry.slug === "sporefall");
  const names = entry?.bosses[0]?.names;
  return names ? { ...legacyMetadata, title: `${names.ru || names.en} — Gildra` } : { ...legacyMetadata, robots: { index: false, follow: true } };
}
export default async function Page({ params }: { params: Promise<{ boss: string }> }) {
  if ((await params).boss !== "rotmire") notFound();
  if (gameContentEnabled()) {
    const data = await getPublishedRaids().catch(() => null);
    if (!data) return <ContentUnavailable locale="ru" />;
    return <div data-game-content-release={data.release.releaseId}><ContentStatus locale="ru" stale={data.stale} /><SporefallPage locale="ru" view="boss" content={data.payload} /></div>;
  }
  return <SporefallPage locale="ru" view="boss" />;
}
