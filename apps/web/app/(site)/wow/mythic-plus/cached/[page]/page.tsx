// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { notFound } from "next/navigation";
import { CompsPage } from "@/components/wow/mythicCommunity/CompsPage";
import { RoutesPage } from "@/components/wow/mythicCommunity/RoutesPage";
import { StatsPage } from "@/components/wow/mythicCommunity/StatsPage";
import { MythicLeaderboardPage } from "@/components/wow/mplusLeaderboard/MythicLeaderboardPage";
import { MythicMetaPage } from "@/components/wow/mythicMeta/MythicMetaPage";
import { parseRunsQuery } from "@/lib/games/wow/mythicPlusRunsTypes";
import { CACHED_MYTHIC_PAGES, type CachedMythicPage } from "@/lib/routes/cachedViews";
import { sectionMetadata } from "@/lib/routes/metadata";

// The default (unfiltered) view of /wow/mythic-plus/<page>, cached for everyone and rendered again
// at most every 5 minutes; proxy.ts rewrites the public URL here (lib/routes/cachedViews.ts).
export const dynamic = "force-static";
export const revalidate = 300;

const sections = { stats: "mythicPlusStats", comps: "mythicPlusComps", routes: "mythicPlusRoutes", meta: "mythicPlusMeta", leaderboard: "mythicPlusLeaderboard" } as const;
const isPage = (page: string): page is CachedMythicPage => (CACHED_MYTHIC_PAGES as readonly string[]).includes(page);

type Props = { params: Promise<{ page: string }> };
export async function generateMetadata({ params }: Props) {
  const { page } = await params;
  return isPage(page) ? sectionMetadata(sections[page], "en") : {};
}
export default async function Page({ params }: Props) {
  const { page } = await params;
  if (!isPage(page)) notFound();
  const query = parseRunsQuery({});
  if (page === "stats") return <StatsPage locale="en" query={query} />;
  if (page === "comps") return <CompsPage locale="en" query={query} />;
  if (page === "routes") return <RoutesPage locale="en" query={query} />;
  if (page === "meta") return <MythicMetaPage locale="en" />;
  return <MythicLeaderboardPage locale="en" searchParams={Promise.resolve({})} />;
}
