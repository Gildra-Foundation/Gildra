// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SpecLeaderboardPage } from "@/components/wow/mplusLeaderboard/SpecLeaderboardPage";
import { leaderboardSpecMetadata } from "@/lib/games/wow/mplusLeaderboardMetadata";
import { leaderboardSpecBySlug } from "@/lib/games/wow/mplusLeaderboardView";

type Props = { params: Promise<{ spec: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { return leaderboardSpecMetadata((await params).spec, "en"); }
export default async function Page({ params, searchParams }: Props) {
  const spec = leaderboardSpecBySlug((await params).spec);
  if (!spec) notFound();
  return <SpecLeaderboardPage locale="en" spec={spec} searchParams={searchParams} />;
}
