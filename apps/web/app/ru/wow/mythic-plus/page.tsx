// Generated from app/(site)/wow/mythic-plus/page.tsx by npm run routes:mirror — edit the English page.
import { MythicAtlasPage } from "@/components/wow/mythic/MythicAtlasPage";
import { sectionMetadata } from "@/lib/routes/metadata";
import { gameContentEnabled, getPublishedMythic } from "@/lib/data/gamecontent/server";
import { PublishedMythicCatalog } from "@/components/gamecontent/PublishedCatalogs";
import { ContentUnavailable } from "@/components/gamecontent/ContentState";

export const metadata = sectionMetadata("mythicPlus", "ru");
export const revalidate = 60;
export default async function Page() {
  if (gameContentEnabled()) {
    const data = await getPublishedMythic().catch(() => null);
    return data ? <PublishedMythicCatalog data={data} locale="ru" /> : <ContentUnavailable locale="ru" />;
  }
  return <MythicAtlasPage locale="ru" />;
}
