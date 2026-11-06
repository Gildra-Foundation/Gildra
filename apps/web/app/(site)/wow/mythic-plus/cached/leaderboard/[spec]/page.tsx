// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SpecLeaderboardPage } from "@/components/wow/mplusLeaderboard/SpecLeaderboardPage";
import { leaderboardSpecMetadata } from "@/lib/games/wow/mplusLeaderboardMetadata";
import { leaderboardSpecBySlug } from "@/lib/games/wow/mplusLeaderboardView";

// The default view of /wow/mythic-plus/leaderboard/<spec>, cached and rendered again at most every
// 5 minutes; proxy.ts rewrites the public URL here (lib/routes/cachedViews.ts).
export const dynamic = "force-static";
export const revalidate = 300;

type Props = { params: Promise<{ spec: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { return leaderboardSpecMetadata((await params).spec, "en"); }
export default async function Page({ params }: Props) {
  const spec = leaderboardSpecBySlug((await params).spec);
  if (!spec) notFound();
  return <SpecLeaderboardPage locale="en" spec={spec} searchParams={Promise.resolve({})} />;
}
