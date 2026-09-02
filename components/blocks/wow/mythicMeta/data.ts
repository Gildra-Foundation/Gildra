import type { RenderContext } from "@/lib/blocks/types";
import type { MythicMetaBlockData } from "./schema";

export async function load(ctx: RenderContext): Promise<MythicMetaBlockData> {
  const [meta, liveStats] = await Promise.all([ctx.source.mythicMeta(), ctx.source.liveStats()]);
  return { ...meta, liveStats };
}
