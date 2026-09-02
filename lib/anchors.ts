/**
 * Single source of on-page anchor ids.
 *
 * Every `#id` that SectionNav, Footer, TopNav, SearchCommand or a block links
 * to lives here, so a renamed section becomes a compile error instead of a
 * dead link. `app/globals.css` keys `scroll-margin-top` on the same ids.
 */
export const ANCHORS = {
  overview: "overview",
  meta: "meta",
  raid: "raid",
  guides: "guides",
  tierPreview: "tier-list-preview",
  tierList: "tierlist",
  builds: "builds",
  premium: "premium",
} as const;

export type AnchorId = (typeof ANCHORS)[keyof typeof ANCHORS];

/** `anchorHref("raid")` → "/#raid"; `anchorHref("builds", "/tier-lists")` → "/tier-lists#builds".
 *  Pass the result through `p(lang, …)` for the RU mirror. */
export const anchorHref = (id: AnchorId, path = "/") => `${path}#${id}`;
