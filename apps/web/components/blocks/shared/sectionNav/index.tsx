import { defineBlock, type RenderContext } from "@/lib/blocks/types";
import { p, tNav } from "@/lib/i18n";
import { ANCHORS, anchorHref, type AnchorId } from "@/lib/anchors";
import { liveSeason } from "@/lib/data/season";
import { SectionNav, type SectionNavView } from "./SectionNav";

export type SectionNavProps = {
  /** Show another page's anchors (a page id registered in lib/blocks/pages.ts) — see lib/blocks/pages.ts. */
  anchorsFrom?: string;
  /** Fixed active anchor (disables scrollspy); its link points at the current page. */
  active?: AnchorId;
  /** Link to the homepage anchors instead of same-page `#id` (routes other than "/"). */
  linkToHome?: boolean;
};

export type SectionNavData = SectionNavView;

export function load(ctx: RenderContext, props: SectionNavProps): SectionNavData {
  const season = liveSeason();
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
    // The live season from the verified content manifest; no pill without one.
    seasonLabel: season ? season.names[ctx.lang] ?? season.names.en ?? undefined : undefined,
    seasonShort: season ? `S${season.slug.match(/(\d+)$/)?.[1] ?? ""}` : undefined,
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
