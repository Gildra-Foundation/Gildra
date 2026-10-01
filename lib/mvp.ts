/**
 * World of Warcraft-only MVP gate — the one place to undo when the product
 * grows beyond WoW.
 *
 * Two independent switches:
 *  - `MVP_VISIBLE_GAMES` (lib/games/registry.ts): which registered games the
 *    public site shows (switcher, nav, footer, search, sitemap). A route that
 *    belongs to a registry game passes its slug: `hiddenForMvp("league-of-legends")`
 *    (pages built with definePage get this automatically).
 *  - `MVP_DEFERRED_PAGES_PUBLIC` (below): pages that belong to no visible game —
 *    the cross-game pages still running on fixture data (/patches, /compare,
 *    /profile/*, the /diablo and /genshin hubs, which show invented patches,
 *    ratings and a made-up profile) and /genshin/** (Genshin has no registry
 *    entry). They answer 404 until real data replaces the fixtures. Call
 *    `hiddenForMvp()` without a slug at the top of such a page.
 *
 * Two layers, same list of pages:
 *  1. `hiddenForMvp()` inside each page → the framework 404 (the in-app guard);
 *  2. `isHiddenForMvpPath()` in proxy.ts → the real HTTP 404 status. The app has
 *     a root `loading.tsx`, so a `notFound()` thrown inside a page happens after
 *     streaming began and answers 200 with the 404 UI (a "soft 404"). The proxy
 *     rewrites hidden URLs to a path no route owns, which Next answers with a
 *     true 404 and the branded not-found page.
 *
 * The pages' code is intentionally kept; deleting the calls (or flipping the
 * flags) brings a page back. Nothing here changes robots or the sitemap index.
 */
import { notFound } from "next/navigation";
import { altPath } from "@/lib/i18n-paths";
import { GAMES, GAME_ORDER, isGameVisible, type GameSlug } from "@/lib/games/registry";

/** Flip to `true` only after the deferred pages are backed by real data. */
export const MVP_DEFERRED_PAGES_PUBLIC = false;

/** Language-less URL prefixes of the deferred pages (see above). */
const DEFERRED_PATH_PREFIXES = ["/patches", "/compare", "/profile", "/diablo", "/genshin"] as const;

/** True for a URL (EN or /ru) that is hidden for the MVP: a deferred page or any
 *  page under the URL prefix of a game that is not in MVP_VISIBLE_GAMES. Used by
 *  proxy.ts, so it must stay free of request-time APIs. */
export function isHiddenForMvpPath(pathname: string): boolean {
  const bare = altPath(pathname, "en");
  const under = (prefix: string) => bare === prefix || bare.startsWith(`${prefix}/`);
  if (!MVP_DEFERRED_PAGES_PUBLIC && DEFERRED_PATH_PREFIXES.some(under)) return true;
  return GAME_ORDER.some((slug) => {
    const { prefix } = GAMES[slug];
    return !isGameVisible(slug) && prefix !== "" && under(prefix);
  });
}

/** Throws the framework 404 when the page is hidden for the MVP. */
export function hiddenForMvp(game?: GameSlug): void {
  if (game ? isGameVisible(game) : MVP_DEFERRED_PAGES_PUBLIC) return;
  notFound();
}

/** Platform catalog game ids (lib/platform/**) → registry slug. Ids without a
 *  registry entry (Genshin) are never visible until they are registered. */
const PLATFORM_GAME_SLUG: Record<string, GameSlug | undefined> = {
  wow: "wow",
  diablo: "diablo-4",
  league: "league-of-legends",
};

export const isPlatformGameVisible = (id: string) => {
  const slug = PLATFORM_GAME_SLUG[id];
  return slug ? isGameVisible(slug) : false;
};
