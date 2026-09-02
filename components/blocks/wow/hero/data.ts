import type { RenderContext } from "@/lib/blocks/types";
import type { HeroData } from "./schema";

export async function load(ctx: RenderContext): Promise<HeroData> {
  const [season, liveStats, patchHighlights] = await Promise.all([
    ctx.source.season(),
    ctx.source.liveStats(),
    ctx.source.patchHighlights(),
  ]);
  return { season, liveStats, patchHighlights };
}
