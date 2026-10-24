// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { MythicAtlasPage } from "@/components/wow/mythic/MythicAtlasPage";
import { sectionMetadata } from "@/lib/routes/metadata";
import { gameContentEnabled, getPublishedMythic } from "@/lib/data/gamecontent/server";
import { PublishedMythicCatalog } from "@/components/gamecontent/PublishedCatalogs";
import { ContentUnavailable } from "@/components/gamecontent/ContentState";

export const metadata = sectionMetadata("mythicPlus", "en");
export const revalidate = 60;
export default async function Page() {
  if (gameContentEnabled()) {
    const data = await getPublishedMythic().catch(() => null);
    return data ? <PublishedMythicCatalog data={data} locale="en" /> : <ContentUnavailable locale="en" />;
  }
  return <MythicAtlasPage locale="en" />;
}
