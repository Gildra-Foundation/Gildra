import "server-only";
import { connection } from "next/server";
import { internalApiJson } from "@/lib/api/internal";
import { leaderboardSearch, type LeaderboardPage, type LeaderboardQuery } from "./mplusLeaderboardView";

/**
 * One page of the regional Mythic+ leaderboard from the Gildra API (crawled from
 * the Blizzard APIs every twelve hours; the API keeps the last good snapshot).
 * A missing region snapshot is an honest empty state, an unreachable API an
 * error state. Rendered per request; the API read is cached for 15 minutes.
 */
export type LeaderboardResult =
  | { state: "ready"; page: LeaderboardPage }
  | { state: "empty" }
  | { state: "error" };

const timeoutMs = 4_000;
export const leaderboardPageSize = 50;

export async function loadMythicPlusLeaderboard(query: LeaderboardQuery): Promise<LeaderboardResult> {
  await connection();
  const search = leaderboardSearch({ ...query, region: undefined });
  const path = `/v1/meta/wow/mythic-plus/leaderboard${search}${search ? "&" : "?"}region=${query.region}&limit=${leaderboardPageSize}`;
  try {
    const page = await internalApiJson<LeaderboardPage>(path, {
      label: "Mythic+ leaderboard",
      timeoutMs,
      next: { revalidate: 900, tags: ["mythic-plus-leaderboard"] },
    });
    return Array.isArray(page.entries) ? { state: "ready", page } : { state: "empty" };
  } catch (error) {
    if (error instanceof Error && error.message.includes("(404)")) return { state: "empty" };
    console.error("Mythic+ leaderboard unavailable", error);
    return { state: "error" };
  }
}
