import { getTalentSpecTheme } from "@/lib/talentSpecThemes";

/**
 * Cached views of query-driven pages. A page that reads searchParams renders on every
 * request, and a query string cannot select an ISR-cached page, so proxy.ts rewrites the
 * shared views to internal paths whose routes are cached (force-static + revalidate,
 * rendered on first request — never at build time, when the API is out of reach):
 *
 *   /wow/professions/<slug>?region=us        → /wow/professions/<slug>/region/us
 *   /wow/mythic-plus/<page> (no query)       → /wow/mythic-plus/cached/<page>
 *   /wow/mythic-plus/leaderboard/<spec>      → /wow/mythic-plus/cached/leaderboard/<spec>
 *
 * (and the /ru twins). Filtered views (?region=…, ?dungeon=…) stay rendered per request.
 * The internal paths opened directly answer 404, so every view has one public address;
 * their Open Graph card routes stay reachable (the page metadata links to them).
 */
export const CACHED_MYTHIC_PAGES = ["stats", "comps", "routes", "meta", "leaderboard"] as const;
export type CachedMythicPage = (typeof CACHED_MYTHIC_PAGES)[number];

const INTERNAL = /^(?:\/ru)?\/wow\/(?:professions\/[^/]+\/region|mythic-plus\/cached)(?:\/|$)/;
const OG_CARD = /\/opengraph-image(?:-[a-z0-9]+)?$/;
const PROFESSION = /^((?:\/ru)?\/wow\/professions\/[^/]+)\/?$/;
const MYTHIC = new RegExp(`^((?:/ru)?/wow/mythic-plus)/(${CACHED_MYTHIC_PAGES.join("|")})/?$`);
const LEADERBOARD_SPEC = /^((?:\/ru)?\/wow\/mythic-plus)\/leaderboard\/([a-z-]+)\/?$/;

/** Query keys that do not change the page (the router's RSC cache-buster). */
const IGNORED = new Set(["_rsc"]);
const hasQuery = (params: URLSearchParams) => [...params.keys()].some((key) => !IGNORED.has(key));

/** Internal path to serve `url` from, "direct" for an internal path opened directly (404), or null (no rewrite). */
export function cachedViewRewrite(url: { pathname: string; searchParams: URLSearchParams }): string | "direct" | null {
  const { pathname, searchParams } = url;
  if (INTERNAL.test(pathname)) return OG_CARD.test(pathname) ? null : "direct";
  const profession = PROFESSION.exec(pathname);
  if (profession) return searchParams.get("region") === "us" ? `${profession[1]}/region/us` : null;
  if (hasQuery(searchParams)) return null;
  const mythic = MYTHIC.exec(pathname);
  if (mythic) return `${mythic[1]}/cached/${mythic[2]}`;
  const spec = LEADERBOARD_SPEC.exec(pathname);
  if (spec && getTalentSpecTheme(spec[2])) return `${spec[1]}/cached/leaderboard/${spec[2]}`;
  return null;
}
