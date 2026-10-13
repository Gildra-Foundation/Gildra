import type { RenderContext } from "@/lib/blocks/types";
import type { ExampleData, ExampleProps } from "./schema";

/** Resolve block data through ctx.source only. */
export async function load(ctx: RenderContext, _props: ExampleProps): Promise<ExampleData> {
  const season = await ctx.source.season();
  return { title: `${season.expansion} · ${season.season}`, items: [] };
}
