// Generated from app/(site)/wow/mythic-plus/cached/leaderboard/[spec]/page.tsx by npm run routes:mirror — edit the English page.
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
export async function generateMetadata({ params }: Props): Promise<Metadata> { return leaderboardSpecMetadata((await params).spec, "ru"); }
export default async function Page({ params }: Props) {
  const spec = leaderboardSpecBySlug((await params).spec);
  if (!spec) notFound();
  return <SpecLeaderboardPage locale="ru" spec={spec} searchParams={Promise.resolve({})} />;
}
