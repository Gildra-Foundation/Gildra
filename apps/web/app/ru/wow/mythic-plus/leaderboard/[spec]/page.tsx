// Generated from app/(site)/wow/mythic-plus/leaderboard/[spec]/page.tsx by npm run routes:mirror — edit the English page.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SpecLeaderboardPage } from "@/components/wow/mplusLeaderboard/SpecLeaderboardPage";
import { leaderboardSpecMetadata } from "@/lib/games/wow/mplusLeaderboardMetadata";
import { leaderboardSpecBySlug } from "@/lib/games/wow/mplusLeaderboardView";

type Props = { params: Promise<{ spec: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { return leaderboardSpecMetadata((await params).spec, "ru"); }
export default async function Page({ params, searchParams }: Props) {
  const spec = leaderboardSpecBySlug((await params).spec);
  if (!spec) notFound();
  return <SpecLeaderboardPage locale="ru" spec={spec} searchParams={searchParams} />;
}
