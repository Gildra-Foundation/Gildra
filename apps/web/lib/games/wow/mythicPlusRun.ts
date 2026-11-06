import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { internalApiFetch } from "@/lib/api/internal";
import { toRunDetail, type RunDetail, type RunLoad } from "./mythicPlusRunTypes";

/**
 * One Mythic+ run for /wow/mythic-plus/routes/<id>, read from Raider.IO's public
 * run-details endpoint. Only the trimmed facts are cached (six hours, served stale
 * while a fresh copy is fetched); a failed answer is never cached, the page falls
 * back to a short "unavailable" state. Upstream calls are capped per minute, so
 * crawlers walking run ids cannot push the server past Raider.IO's rate limit.
 */
const upstream = "https://raider.io/api/v1/mythic-plus/run-details";
const revalidate = 6 * 60 * 60;
const timeoutMs = 6_000;
const perMinute = 40;
const fallbackSeason = "season-mn-2";

let windowStart = 0;
let windowCalls = 0;
let blockedUntil = 0;

function takeSlot() {
  const now = Date.now();
  if (now < blockedUntil) return false;
  if (now - windowStart > 60_000) { windowStart = now; windowCalls = 0; }
  windowCalls += 1;
  return windowCalls <= perMinute;
}

class Busy extends Error {}

const fetchRun = unstable_cache(async (season: string, id: number): Promise<RunDetail | null> => {
  if (!takeSlot()) throw new Busy("Raider.IO run budget spent");
  const response = await fetch(`${upstream}?season=${encodeURIComponent(season)}&id=${id}`, {
    cache: "no-store",
    headers: { accept: "application/json", "user-agent": "Gildra (+https://gildra.net)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status === 429) {
    const wait = Number(response.headers.get("retry-after"));
    blockedUntil = Date.now() + (Number.isFinite(wait) && wait > 0 ? Math.min(wait, 600) : 60) * 1000;
    throw new Busy("Raider.IO rate limit");
  }
  if (response.status === 400 || response.status === 404) return null;
  if (!response.ok) throw new Error(`Raider.IO run ${id} failed (${response.status})`);
  return toRunDetail(await response.json());
}, ["mythic-plus-run", "v2"], { revalidate, tags: ["mythic-plus-run"] });

/** Slug of the season our run sample belongs to (the run endpoint needs it). */
async function currentSeason() {
  try {
    const response = await internalApiFetch("/v1/meta/wow/mythic-plus/runs", { timeoutMs: 3_000, next: { revalidate: 900, tags: ["mythic-plus-runs"] } });
    if (!response.ok) return fallbackSeason;
    const data = await response.json() as { season?: { slug?: string } };
    return /^season-[a-z0-9-]{1,40}$/.test(data.season?.slug ?? "") ? data.season!.slug! : fallbackSeason;
  } catch {
    return fallbackSeason;
  }
}

/** The run, "missing" (no such finished run) or "unavailable" (Raider.IO slow, down or busy). Shared by metadata and page. */
export const loadMythicPlusRun = cache(async (id: number): Promise<RunLoad> => {
  try {
    const run = await fetchRun(await currentSeason(), id);
    return run ? { state: "ready", run } : { state: "missing" };
  } catch (error) {
    if (!(error instanceof Busy)) console.error("Mythic+ run unavailable", error);
    return { state: "unavailable" };
  }
});
