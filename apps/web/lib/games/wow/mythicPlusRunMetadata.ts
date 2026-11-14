import "server-only";
import type { Metadata } from "next";
import { communityCopy } from "@/components/wow/mythicCommunity/communityCopy";
import { dungeonLabel } from "@/components/wow/mythicCommunity/CommunityParts";
import { pageOpenGraph, pairedAlternates } from "@/lib/seo/metadata";
import { loadMythicPlusRun } from "./mythicPlusRun";
import { clock } from "./mythicPlusRunsTypes";

/**
 * Title and description of a run page. Run pages stay out of the index: thousands of
 * pages of one external record each; the route finder and the stats are the indexed pages.
 */
export async function runMetadata(id: number, locale: "en" | "ru"): Promise<Metadata> {
  const copy = communityCopy[locale];
  const alternates = pairedAlternates(locale, `/wow/mythic-plus/routes/${id}`);
  const robots = { index: false, follow: true };
  const load = await loadMythicPlusRun(id);
  if (load.state !== "ready") return { title: `${copy.run.unavailableTitle} — WowArcana`, robots, alternates };
  const { run } = load;
  const dungeon = dungeonLabel(run.dungeon.slug, run.dungeon.name, locale).name;
  const title = copy.run.metaTitle(dungeon, run.level);
  const description = copy.run.metaDescription(dungeon, run.level, clock(run.clearMs));
  return { title, description, robots, alternates, openGraph: pageOpenGraph(locale, { title, description, path: String(alternates.canonical) }) };
}
