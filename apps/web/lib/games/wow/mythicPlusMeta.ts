import "server-only";
import { readFile } from "node:fs/promises";
import { connection } from "next/server";
import { internalApiJson } from "@/lib/api/internal";
import { runtimeFlags } from "@/lib/flags";
import type { MythicPlusMetaPayload } from "./mythicPlusMetaView";

/**
 * The weekly Mythic+ spec diversity summary of mythicstats.com, as the Gildra
 * API serves it (GET /v1/meta/wow/mythic-plus/meta, dataset
 * mplus-meta-mythicstats, refreshed every six hours). The API keeps the last
 * good snapshot, so a failed refresh shows older numbers marked `stale`; a
 * missing snapshot or an unreachable API is an honest empty or error state.
 * Rendered per request (the image build cannot reach the API, so a prerender
 * would freeze the error state); the API read itself is cached for 15 minutes.
 */
export type MythicPlusMetaResponse = {
  game: "wow";
  status: "live" | "stale";
  fetchedAt: string;
  checkedAt?: string;
  data: MythicPlusMetaPayload;
};

export type MythicPlusMetaResult =
  | { state: "ready"; meta: MythicPlusMetaResponse }
  | { state: "empty" }
  | { state: "error" };

const timeoutMs = 4_000;

export async function loadMythicPlusMeta(): Promise<MythicPlusMetaResult> {
  await connection();
  const fixture = process.env.MPLUS_META_FIXTURE;
  if (fixture && runtimeFlags().devGallery) {
    // Local review only (screenshots, prototypes): a saved snapshot of the collector.
    const data = JSON.parse(await readFile(fixture, "utf8")) as MythicPlusMetaPayload;
    return { state: "ready", meta: { game: "wow", status: "live", fetchedAt: data.fetched_at, checkedAt: data.fetched_at, data } };
  }
  try {
    const meta = await internalApiJson<MythicPlusMetaResponse>("/v1/meta/wow/mythic-plus/meta", {
      label: "Mythic+ meta",
      timeoutMs,
      next: { revalidate: 900, tags: ["mythic-plus-meta"] },
    });
    return meta.data?.seasons?.length ? { state: "ready", meta } : { state: "empty" };
  } catch (error) {
    if (error instanceof Error && error.message.includes("(404)")) return { state: "empty" };
    console.error("Mythic+ meta unavailable", error);
    return { state: "error" };
  }
}
