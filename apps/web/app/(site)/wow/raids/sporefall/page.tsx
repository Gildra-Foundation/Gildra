import type { Metadata } from "next";
import { SporefallPage } from "@/components/wow/raid/SporefallPage";
import { gameContentEnabled, getPublishedRaids } from "@/lib/data/gamecontent/server";
import { ContentStatus, ContentUnavailable } from "@/components/gamecontent/ContentState";

const path = "/wow/raids/sporefall";
export const revalidate = 60;
const legacyMetadata: Metadata = {
  title: "Sporefall — Midnight Raid — Gildra",
  description: "Verified identity page for the one-encounter Sporefall raid and Rotmire. Strategy and entity details remain withheld.",
  alternates: { canonical: path, languages: { en: path, ru: `/ru${path}`, "x-default": path } },
  robots: { index: false, follow: true },
};
export async function generateMetadata(): Promise<Metadata> {
  if (!gameContentEnabled()) return legacyMetadata;
  const data = await getPublishedRaids().catch(() => null);
  const entry = data?.payload.catalog.entries.find((entry) => entry.slug === "sporefall");
  const names = entry?.names;
  return names ? { ...legacyMetadata, title: `${names.en || names.en} — Gildra` } : { ...legacyMetadata, robots: { index: false, follow: true } };
}
export default async function Page() {
  if (gameContentEnabled()) {
    const data = await getPublishedRaids().catch(() => null);
    if (!data) return <ContentUnavailable locale="en" />;
    return <div data-game-content-release={data.release.releaseId}><ContentStatus locale="en" stale={data.stale} /><SporefallPage locale="en" view="raid" content={data.payload} /></div>;
  }
  return <SporefallPage locale="en" view="raid" />;
}
