// Generated from app/(site)/wow/mythic-plus/comps/page.tsx by npm run routes:mirror — edit the English page.
import { CompsPage } from "@/components/wow/mythicCommunity/CompsPage";
import { parseRunsQuery } from "@/lib/games/wow/mythicPlusRunsTypes";
import { sectionMetadata } from "@/lib/routes/metadata";

export const metadata = sectionMetadata("mythicPlusComps", "ru");
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <CompsPage locale="ru" query={parseRunsQuery(await searchParams)} />;
}
