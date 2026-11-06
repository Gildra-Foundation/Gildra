// Generated from app/(site)/wow/mythic-plus/routes/page.tsx by npm run routes:mirror — edit the English page.
import { RoutesPage } from "@/components/wow/mythicCommunity/RoutesPage";
import { parseRunsQuery } from "@/lib/games/wow/mythicPlusRunsTypes";
import { sectionMetadata } from "@/lib/routes/metadata";

export const metadata = sectionMetadata("mythicPlusRoutes", "ru");
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <RoutesPage locale="ru" query={parseRunsQuery(await searchParams)} />;
}
