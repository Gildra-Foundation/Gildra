/**
 * Shared-element names for the art "morph" between a card and the page it opens
 * (roadmap item 41): the card's picture and the opened page's scene carry the
 * same view-transition name, derived from the page path, so React's
 * <ViewTransition> moves one into the other. Language prefixes are ignored.
 */
export function artMorphName(href: string) {
  const path = href.replace(/^https?:\/\/[^/]+/, "").split(/[?#]/)[0].replace(/^\/ru(?=\/|$)/, "") || "/";
  return `atlas-art${path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+$/, "")}`;
}
