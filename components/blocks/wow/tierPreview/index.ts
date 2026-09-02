import { defineBlock, type RenderContext } from "@/lib/blocks/types";
import { ANCHORS } from "@/lib/anchors";
import { builds, liveStats, tierTable, type Build, type TierGroup } from "@/data/site";
import { TierPreview, type PreviewRow, type TierPreviewData, type TierPreviewProps } from "./TierPreview";

const DEFAULTS = { rows: 7, builds: 4 } satisfies TierPreviewProps;

export function derivePreview(
  table: readonly TierGroup[],
  allBuilds: readonly Build[],
  stats: TierPreviewData["liveStats"],
  props: TierPreviewProps,
): TierPreviewData {
  const rows: PreviewRow[] = table
    .flatMap((g) => g.rows.map((r) => ({ ...r, tier: g.tier })))
    .slice(0, props.rows ?? DEFAULTS.rows);
  return { rows, builds: allBuilds.slice(0, props.builds ?? DEFAULTS.builds), liveStats: stats };
}

export const tierPreviewBlock = defineBlock<TierPreviewProps, TierPreviewData>({
  type: "wow.tierPreview",
  Component: TierPreview,
  defaults: DEFAULTS,
  load: async (ctx: RenderContext, props) => {
    const [table, allBuilds, stats] = await Promise.all([
      ctx.source.tierTable(),
      ctx.source.builds(),
      ctx.source.liveStats(),
    ]);
    return derivePreview(table, allBuilds, stats, props);
  },
  anchor: { id: ANCHORS.tierPreview, label: "Tier List" },
  demo: { props: DEFAULTS, data: derivePreview(tierTable, builds, liveStats, DEFAULTS) },
});
