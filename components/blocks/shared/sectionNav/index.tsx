import { defineBlock, type RenderContext } from "@/lib/blocks/types";
import { p, t, tNav } from "@/lib/i18n";
import { ANCHORS, anchorHref, type AnchorId } from "@/lib/anchors";
import { SectionNav, type SectionNavView } from "./SectionNav";

export type SectionNavProps = {
  /** Show another page's anchors (e.g. "wow/home" on /tier-lists) — see lib/blocks/pages.ts. */
  anchorsFrom?: string;
  /** Fixed active anchor (disables scrollspy); its link points at the current page. */
  active?: AnchorId;
  /** Link to the homepage anchors instead of same-page `#id` (routes other than "/"). */
  linkToHome?: boolean;
};

export type SectionNavData = SectionNavView;

export async function load(ctx: RenderContext, props: SectionNavProps): Promise<SectionNavData> {
  const season = await ctx.source.season();
  const tt = t(ctx.lang);
  const tn = tNav(ctx.lang);
  const home = props.linkToHome === true;
  const anchors = props.anchorsFrom ? ctx.anchorsOf(props.anchorsFrom) : ctx.anchors;
  return {
    items: anchors.map((a) => ({
      id: a.id,
      label: tn(a.label),
      href:
        props.active === a.id && home
          ? p(ctx.lang, ctx.path)
          : home
            ? p(ctx.lang, anchorHref(a.id as AnchorId))
            : `#${a.id}`,
    })),
    seasonLabel: `${season.expansion} · ${tt(season.season)}`,
    seasonShort: "S1",
    seasonHref: home ? p(ctx.lang, "/") : `#${ANCHORS.overview}`,
    active: props.active,
  };
}

function SectionNavBlock({ data }: { data: SectionNavData }) {
  return <SectionNav {...data} />;
}

export const sectionNavBlock = defineBlock<SectionNavProps, SectionNavData>({
  type: "sectionNav",
  Component: SectionNavBlock,
  load,
  demo: {
    props: {},
    data: {
      items: [
        { id: ANCHORS.meta, label: "Meta", href: "#meta" },
        { id: ANCHORS.raid, label: "Raid", href: "#raid" },
        { id: ANCHORS.guides, label: "Guides", href: "#guides" },
        { id: ANCHORS.tierPreview, label: "Tier List", href: "#tier-list-preview" },
      ],
      seasonLabel: "Midnight · Season 1",
      seasonShort: "S1",
      seasonHref: "#overview",
    },
    layout: "full",
  },
});
