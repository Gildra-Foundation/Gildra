// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { CompsPage } from "@/components/wow/mythicCommunity/CompsPage";
import { parseRunsQuery } from "@/lib/games/wow/mythicPlusRunsTypes";
import { sectionMetadata } from "@/lib/routes/metadata";

export const metadata = sectionMetadata("mythicPlusComps", "en");
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <CompsPage locale="en" query={parseRunsQuery(await searchParams)} />;
}
