import "server-only";
import { connection } from "next/server";
import { internalApiFetch } from "@/lib/api/internal";
import { runsSearch, type CompsResponse, type RunsLoad, type RunsQuery, type RunsResponse, type StatsResponse } from "./mythicPlusRunsTypes";

/**
 * Mythic+ community data (compositions, season stats, route finder) as the
 * Gildra API computes it from the Raider.IO run sample (dataset
 * mplus-runs-raiderio, refreshed every twelve hours). Rendered per request:
 * the filters live in the URL. The API keeps the last good snapshot (marked
 * `stale` after missed refreshes); a missing snapshot is an honest empty state,
 * a filter the API rejects (unknown dungeon, impossible group) is `invalid`.
 */
const timeoutMs = 5_000;

async function load<T>(path: string, query: RunsQuery, label: string): Promise<RunsLoad<T>> {
  await connection();
  try {
    const response = await internalApiFetch(`${path}${runsSearch(query)}`, { timeoutMs, next: { revalidate: 900, tags: ["mythic-plus-runs"] } });
    if (response.status === 404) return { state: "empty" };
    if (response.status === 400) return { state: "invalid" };
    if (!response.ok) throw new Error(`${label} request failed (${response.status})`);
    const data = await response.json() as T & { sample?: { runs: number } };
    return { state: "ready", data };
  } catch (error) {
    console.error(`${label} unavailable`, error);
    return { state: "error" };
  }
}

export const loadMythicPlusComps = (query: RunsQuery) =>
  load<CompsResponse>("/v1/meta/wow/mythic-plus/comps", { dungeon: query.dungeon, region: query.region, minLevel: query.minLevel, specs: query.specs }, "Mythic+ compositions");

export const loadMythicPlusStats = (query: RunsQuery) =>
  load<StatsResponse>("/v1/meta/wow/mythic-plus/stats", { dungeon: query.dungeon, region: query.region, minLevel: query.minLevel }, "Mythic+ stats");

export const loadMythicPlusRuns = (query: RunsQuery) =>
  load<RunsResponse>("/v1/meta/wow/mythic-plus/runs", query, "Mythic+ runs");
