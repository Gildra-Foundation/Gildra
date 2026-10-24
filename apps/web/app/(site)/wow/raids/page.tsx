// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { RaidAtlasPage } from "@/components/wow/raid/RaidAtlasPage";
import { sectionMetadata } from "@/lib/routes/metadata";
import { gameContentEnabled, getPublishedRaids } from "@/lib/data/gamecontent/server";
import { PublishedRaidCatalog } from "@/components/gamecontent/PublishedCatalogs";
import { ContentUnavailable } from "@/components/gamecontent/ContentState";

export const metadata = sectionMetadata("raids", "en");
export const revalidate = 60;

export default async function RaidsPage() {
  if (gameContentEnabled()) {
    const data = await getPublishedRaids().catch(() => null);
    return data ? <PublishedRaidCatalog data={data} locale="en" /> : <ContentUnavailable locale="en" />;
  }
  return <RaidAtlasPage locale="en" />;
}
