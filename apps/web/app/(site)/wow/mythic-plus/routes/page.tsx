// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { RoutesPage } from "@/components/wow/mythicCommunity/RoutesPage";
import { parseRunsQuery } from "@/lib/games/wow/mythicPlusRunsTypes";
import { sectionMetadata } from "@/lib/routes/metadata";

export const metadata = sectionMetadata("mythicPlusRoutes", "en");
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <RoutesPage locale="en" query={parseRunsQuery(await searchParams)} />;
}
