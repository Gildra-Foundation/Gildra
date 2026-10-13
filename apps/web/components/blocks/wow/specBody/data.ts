import { notFound } from "next/navigation";
import type { RenderContext } from "@/lib/blocks/types";
import { findSpecPage, specPages, type SpecPage } from "@/lib/specs";
import type { Build, GuideItem } from "@/data/site";
import type { SpecBodyData, SpecBodyProps } from "./schema";

export const num = (v: string) => parseFloat(v.replace(/[^\d.]/g, ""));

export function deriveSpecBody(
  page: SpecPage,
  builds: readonly Build[],
  guides: readonly GuideItem[],
  season: SpecBodyData["season"],
  liveStats: SpecBodyData["liveStats"],
): SpecBodyData {
  const name = page.row.spec.name;
  const max = (pick: (r: SpecPage["row"]) => string) =>
    Math.max(...specPages.map((s) => num(pick(s.row))));
  return {
    page,
    season,
    liveStats,
    builds: builds.filter((b) => b.spec.name === name),
    guides: guides.filter(
      (g) =>
        `${g.cat} ${g.title}`.includes(name.split(" ")[0]) &&
        `${g.cat} ${g.title}`.includes(page.className),
    ),
    total: specPages.length,
    maxima: { pop: max((r) => r.pop), key: max((r) => r.key), top1: max((r) => r.top1) },
  };
}

export async function load(ctx: RenderContext, props: SpecBodyProps): Promise<SpecBodyData> {
  const page = findSpecPage(props.slug);
  if (!page) notFound();
  const [builds, guides, season, liveStats] = await Promise.all([
    ctx.source.builds(),
    ctx.source.guides(),
    ctx.source.season(),
    ctx.source.liveStats(),
  ]);
  return deriveSpecBody(page, builds, guides.list, season, liveStats);
}
