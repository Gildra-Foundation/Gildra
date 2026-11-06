// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { MythicLeaderboardPage } from "@/components/wow/mplusLeaderboard/MythicLeaderboardPage";
import { sectionMetadata } from "@/lib/routes/metadata";

export const metadata = sectionMetadata("mythicPlusLeaderboard", "en");
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <MythicLeaderboardPage locale="en" searchParams={searchParams} />; }
