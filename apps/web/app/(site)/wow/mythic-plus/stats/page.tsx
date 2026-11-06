// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { StatsPage } from "@/components/wow/mythicCommunity/StatsPage";
import { parseRunsQuery } from "@/lib/games/wow/mythicPlusRunsTypes";
import { sectionMetadata } from "@/lib/routes/metadata";

export const metadata = sectionMetadata("mythicPlusStats", "en");
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <StatsPage locale="en" query={parseRunsQuery(await searchParams)} />;
}
