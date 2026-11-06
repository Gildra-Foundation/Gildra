// Generated from app/(site)/wow/mythic-plus/stats/page.tsx by npm run routes:mirror — edit the English page.
import { StatsPage } from "@/components/wow/mythicCommunity/StatsPage";
import { parseRunsQuery } from "@/lib/games/wow/mythicPlusRunsTypes";
import { sectionMetadata } from "@/lib/routes/metadata";

export const metadata = sectionMetadata("mythicPlusStats", "ru");
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <StatsPage locale="ru" query={parseRunsQuery(await searchParams)} />;
}
