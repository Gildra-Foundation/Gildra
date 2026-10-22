import type { Lang } from "@/lib/i18n-paths";

/**
 * EN ↔ RU is a full document load: the two languages are two root layouts, so
 * the App Router cannot swap them in place. The switch hands the reading
 * position to the next document (sessionStorage) and the head script of that
 * document (localeArrivalScript.ts) restores it before the first paint.
 */
export const LOCALE_SWITCH_KEY = "gildra-locale-switch";
/** id of the switch: the arriving document holds its first paint until it is parsed. */
export const LOCALE_SWITCH_ID = "gildra-locale-switch";
/** A stored position older than this belongs to an abandoned switch. */
export const LOCALE_SWITCH_TTL_MS = 15000;

/** One step from #atlas-content down to the element under the toolbar: child index and tag. */
export type LocalePathStep = [index: number, tag: string];

export type LocaleSwitchRecord = {
  /** Pathname + search of the destination: only that document restores the position. */
  to: string;
  at: number;
  /** Plain scroll offset, the fallback when the structural path does not resolve. */
  y: number;
  /** Element at the top of the reading area and its offset from the viewport top. */
  path: LocalePathStep[];
  top: number;
  hash: string;
};

const MAX_DEPTH = 14;

/** Pathname without the /ru prefix and trailing slash — one page identity across languages. */
export const localeBarePath = (pathname: string) => pathname.replace(/^\/ru(?=\/|$)/, "").replace(/\/+$/, "") || "/";

export const pathLang = (pathname: string): Lang => /^\/ru(?:\/|$)/.test(pathname) ? "ru" : "en";

/** The language a navigation switches to, or null when it is not a pure language switch. */
export function localeSwitchTarget(from: URL, to: URL): Lang | null {
  if (from.origin !== to.origin || localeBarePath(from.pathname) !== localeBarePath(to.pathname)) return null;
  const lang = pathLang(to.pathname);
  return lang === pathLang(from.pathname) ? null : lang;
}

/** Artwork and atmosphere layers span the whole scene; only the page's own flow is a reading anchor. */
function inFlow(element: Element) {
  if (element.getAttribute("aria-hidden") === "true") return false;
  const position = getComputedStyle(element).position;
  return position !== "absolute" && position !== "fixed";
}

/**
 * The deepest element of the page that crosses the reading line (the toolbar's
 * bottom edge), as a child-index path. Both languages render the same blocks,
 * so the path finds the same paragraph or card in the other document even when
 * translated text changes its height.
 */
export function readingAnchor(root: Element, line: number): { path: LocalePathStep[]; top: number } {
  const path: LocalePathStep[] = [];
  let element = root;
  let top = root.getBoundingClientRect().top - line;
  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    let next: { index: number; child: Element; rect: DOMRect } | null = null;
    for (let index = 0; index < element.children.length; index += 1) {
      const child = element.children[index];
      const rect = child.getBoundingClientRect();
      if (rect.height === 0 || rect.bottom <= line || !inFlow(child)) continue;
      // The first child below the line wins only when no child crosses it.
      if (rect.top <= line || !next) next = { index, child, rect };
      if (rect.top <= line) break;
    }
    if (!next) break;
    path.push([next.index, next.child.tagName]);
    element = next.child;
    top = next.rect.top - line;
    if (next.rect.top > line) break;
  }
  return { path, top };
}

export function saveLocaleSwitch(destination: string, toolbar: Element | null) {
  const root = document.getElementById("atlas-content");
  const line = Math.max(0, toolbar?.getBoundingClientRect().bottom ?? 0);
  const anchor = root && window.scrollY > 0 ? readingAnchor(root, line) : { path: [], top: 0 };
  const record: LocaleSwitchRecord = {
    to: destination,
    at: Date.now(),
    y: window.scrollY,
    path: anchor.path,
    top: anchor.top + line,
    hash: window.location.hash,
  };
  try {
    sessionStorage.setItem(LOCALE_SWITCH_KEY, JSON.stringify(record));
  } catch {
    // Blocked storage: the other language opens at its top, as before.
  }
}
