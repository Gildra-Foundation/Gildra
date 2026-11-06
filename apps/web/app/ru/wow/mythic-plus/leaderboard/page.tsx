// Generated from app/(site)/wow/mythic-plus/leaderboard/page.tsx by npm run routes:mirror — edit the English page.
import { MythicLeaderboardPage } from "@/components/wow/mplusLeaderboard/MythicLeaderboardPage";
import { sectionMetadata } from "@/lib/routes/metadata";

export const metadata = sectionMetadata("mythicPlusLeaderboard", "ru");
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <MythicLeaderboardPage locale="ru" searchParams={searchParams} />; }
