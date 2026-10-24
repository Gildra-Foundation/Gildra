// Generated from app/(site)/wow/raids/page.tsx by npm run routes:mirror — edit the English page.
import { RaidAtlasPage } from "@/components/wow/raid/RaidAtlasPage";
import { sectionMetadata } from "@/lib/routes/metadata";
import { gameContentEnabled, getPublishedRaids } from "@/lib/data/gamecontent/server";
import { PublishedRaidCatalog } from "@/components/gamecontent/PublishedCatalogs";
import { ContentUnavailable } from "@/components/gamecontent/ContentState";

export const metadata = sectionMetadata("raids", "ru");
export const revalidate = 60;

export default async function RaidsPage() {
  if (gameContentEnabled()) {
    const data = await getPublishedRaids().catch(() => null);
    return data ? <PublishedRaidCatalog data={data} locale="ru" /> : <ContentUnavailable locale="ru" />;
  }
  return <RaidAtlasPage locale="ru" />;
}
