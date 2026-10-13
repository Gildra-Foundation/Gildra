/**
 * Shared-element names for the art "morph" between a card and the page it opens
 * (roadmap item 41): the card's picture and the opened page's scene carry the
 * same view-transition name, derived from the page path, so the browser moves one
 * into the other. Language prefixes are ignored.
 *
 * Only the picture that was actually tapped is named, at the moment of the click
 * (`nameMorphArt`): a <ViewTransition> around every card made React measure and
 * the browser capture dozens of pictures on each navigation, freezing phones for
 * 0.4–0.6 s inside the transition (2026-10-13).
 */
export function artMorphName(href: string) {
  const path = href.replace(/^https?:\/\/[^/]+/, "").split(/[?#]/)[0].replace(/^\/ru(?=\/|$)/, "") || "/";
  return `atlas-art${path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+$/, "")}`;
}

/** Class of the shared art group (app/styles/view-transitions.css). */
export const MORPH_CLASS = "atlas-art-morph";

/** Marks a picture that may morph into the page `href` opens; it is named only when tapped. */
export function morphArtProps(href: string) {
  return { "data-morph-art": artMorphName(href) } as const;
}

/** Style of the opened page's scene: the receiving end of the morph. */
export function morphSceneStyle(morphKey: string) {
  return { viewTransitionName: artMorphName(morphKey), viewTransitionClass: MORPH_CLASS } as Record<string, string>;
}

let named: HTMLElement | null = null;

/**
 * Gives the tapped link's picture its view-transition name just before the
 * navigation starts (call from a click handler). The picture is inside the link,
 * or in the same card when the link is its title.
 */
export function nameMorphArt(anchor: Element) {
  const art = anchor.querySelector<HTMLElement>("[data-morph-art]")
    ?? anchor.closest("article, li")?.querySelector<HTMLElement>("[data-morph-art]")
    ?? null;
  if (named && named !== art) { named.style.removeProperty("view-transition-name"); named.style.removeProperty("view-transition-class"); }
  named = art;
  if (!art?.dataset.morphArt) return;
  art.style.setProperty("view-transition-name", art.dataset.morphArt);
  art.style.setProperty("view-transition-class", MORPH_CLASS);
}
