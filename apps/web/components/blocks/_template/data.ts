import type { RenderContext } from "@/lib/blocks/types";
import { liveSeason } from "@/lib/data/season";
import type { ExampleData, ExampleProps } from "./schema";

/** Load block data on the server through lib/ data modules (here: the live season). */
export function load(ctx: RenderContext, _props: ExampleProps): ExampleData {
  const season = liveSeason();
  return { title: season?.names[ctx.lang] ?? season?.names.en ?? "", items: [] };
}
