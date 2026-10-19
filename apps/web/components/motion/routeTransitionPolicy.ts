/** Locale prefixes, trailing slashes and hub aliases share one page identity. */
export function bookPageIdentity(pathname: string) {
  const path = pathname.replace(/^\/ru(?=\/|$)/, "").replace(/\/+$/, "") || "/";
  return path === "/lairs" ? "/wow/lairs" : path;
}

/** Only a new page turns a leaf; language, filters and anchors stay still. */
export function shouldTurnBook(fromPathname: string, toPathname: string) {
  return bookPageIdentity(fromPathname) !== bookPageIdentity(toPathname);
}

/**
 * How a navigation hands one page to the next. One owner per navigation:
 * - "still": the same page (language, filters, anchors) does not move;
 * - "scene": the homepage scene is entered or left, and the selected character's
 *   full effect plays (CanvasPageTransition);
 * - "page": between atlas pages, a quick hand-over (dim while loading, the new
 *   page rises, its hero arrives in a cascade, a tapped picture grows into the scene).
 */
export type RouteTransitionKind = "still" | "page" | "scene";

export function routeTransitionKind(fromPathname: string, toPathname: string): RouteTransitionKind {
  if (!shouldTurnBook(fromPathname, toPathname)) return "still";
  return bookPageIdentity(fromPathname) === "/" || bookPageIdentity(toPathname) === "/" ? "scene" : "page";
}

/** "deeper" into a section, "up" towards its hub (or back in history), "across" between siblings. */
export function navigationDirection(fromPathname: string, toPathname: string, popped: boolean): "deeper" | "up" | "across" {
  if (popped) return "up";
  const depth = (path: string) => path.replace(/^\/ru(?=\/|$)/, "").split("/").filter(Boolean).length;
  const [from, to] = [depth(fromPathname), depth(toPathname)];
  return to > from ? "deeper" : to < from ? "up" : "across";
}

/** A protected character route can resolve through an auth redirect after its
 *  pathname briefly commits. Treat that server redirect as the same turn. */
export function isCharacterAuthRedirect(fromPathname: string, toPathname: string) {
  const source = fromPathname.replace(/^\/ru(?=\/|$)/, "");
  const destination = toPathname.replace(/^\/ru(?=\/|$)/, "");
  return /^\/wow\/characters\/[^/]+\/?$/.test(source)
    && /^\/login\/?$/.test(destination);
}

export function isBookPagePath(pathname: string) {
  return !/^\/(?:api|v1|_next|assets)(?:\/|$)/.test(pathname)
    && !/\.(?:pdf|zip|csv|json|xml|png|jpe?g|webp|svg|mp4|mp3)$/i.test(pathname);
}

export function bookLocale(pathname: string): "ru" | "en" {
  return /^\/ru(?:\/|$)/.test(pathname) ? "ru" : "en";
}
