/**
 * The art "morph" between a card and the page it opens (roadmap item 41): the
 * tapped card's picture grows into the opened page's scene. The card's picture
 * carries `data-morph-art`, the opened page's atmosphere `data-morph-scene`,
 * both named from the page path (language prefixes ignored).
 *
 * The route runtime (RouteTransitionRuntime) owns every page hand-over, so the
 * morph is a single fixed copy of the picture moved by the Web Animations API:
 * no document View Transition, no snapshot of the page and no wait for images.
 * Only the picture that was actually tapped is measured, at the moment of the
 * click (a <ViewTransition> around every card froze phones for 0.4–0.6 s, 2026-10-13).
 */
export function artMorphName(href: string) {
  const path = href.replace(/^https?:\/\/[^/]+/, "").split(/[?#]/)[0].replace(/^\/ru(?=\/|$)/, "") || "/";
  return `atlas-art${path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+$/, "")}`;
}

/** Marks a picture that may grow into the page `href` opens; it is measured only when tapped. */
export function morphArtProps(href: string) {
  return { "data-morph-art": artMorphName(href) } as const;
}

/** Marks the opened page's scene: the receiving end of the morph. */
export function morphSceneProps(morphKey: string) {
  return { "data-morph-scene": artMorphName(morphKey) } as const;
}

export type MorphArtSource = {
  name: string;
  src: string;
  rect: { left: number; top: number; width: number; height: number };
  objectPosition: string;
};

/**
 * Measures the picture of the tapped link (call from the click handler, before
 * the route changes). The picture is inside the link, or in the same card when
 * the link is its title. Nothing is returned for pictures out of view.
 */
export function captureMorphArt(anchor: Element): MorphArtSource | null {
  const art = anchor.querySelector<HTMLImageElement>("img[data-morph-art]")
    ?? anchor.closest("article, li")?.querySelector<HTMLImageElement>("img[data-morph-art]")
    ?? null;
  const name = art?.dataset.morphArt;
  const src = art?.currentSrc || art?.src;
  if (!art || !name || !src || !art.complete || !art.naturalWidth) return null;
  const box = art.getBoundingClientRect();
  if (box.width < 24 || box.height < 24 || box.bottom <= 0 || box.top >= innerHeight) return null;
  return {
    name,
    src,
    rect: { left: box.left, top: box.top, width: box.width, height: box.height },
    objectPosition: getComputedStyle(art).objectPosition,
  };
}

const MORPH_MS = 520;
const MORPH_EASE = "cubic-bezier(.2, .7, .2, 1)";

/**
 * Grows the captured picture into the opened page's scene, then lets it dissolve
 * into the real painting. The copy lives inside the scene itself, under the
 * scene's veil and behind the hero text, so the title never disappears beneath
 * the flying picture. One element, removed when done; the visible part of the
 * scene is the target. Returns false when the page has no matching scene.
 */
export function playMorphArt(source: MorphArtSource, root: ParentNode = document): boolean {
  const scene = root.querySelector<HTMLElement>(`[data-morph-scene="${CSS.escape(source.name)}"]`);
  if (!scene) return false;
  const box = scene.getBoundingClientRect();
  const visibleTop = Math.max(0, box.top);
  const height = Math.min(box.bottom, innerHeight) - visibleTop;
  if (height < 48 || box.width < 48) return false;
  const ghost = document.createElement("img");
  ghost.src = source.src;
  ghost.alt = "";
  ghost.decoding = "sync";
  ghost.setAttribute("aria-hidden", "true");
  const painting = scene.querySelector<HTMLImageElement>(":scope > img");
  // The scene's own grading, so the copy dissolves into the painting without a jump.
  const filter = painting ? getComputedStyle(painting).filter : "none";
  ghost.style.cssText = `position:absolute;margin:0;pointer-events:none;contain:strict;object-fit:cover;object-position:${source.objectPosition};filter:${filter}`;
  // After the painting, before the scene's last layers (embers, veil).
  scene.insertBefore(ghost, painting?.nextSibling ?? scene.firstChild);
  const from = source.rect;
  const start = { left: `${from.left - box.left}px`, top: `${from.top - box.top}px`, width: `${from.width}px`, height: `${from.height}px` };
  const end = { left: "0px", top: `${visibleTop - box.top}px`, width: `${box.width}px`, height: `${height}px` };
  // The box itself moves (not a scale), so the picture keeps its crop all the way.
  const flight = ghost.animate([
    { ...start, opacity: 1 },
    { ...end, opacity: 1, offset: .7 },
    { ...end, opacity: 0 },
  ], { duration: MORPH_MS, easing: MORPH_EASE, fill: "forwards" });
  const remove = () => ghost.remove();
  flight.finished.then(remove, remove);
  return true;
}
