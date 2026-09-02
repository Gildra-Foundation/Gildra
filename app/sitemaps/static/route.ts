import { siteOrigin, xmlEscape, xmlResponse } from "@/lib/sitemap";
import { gameHref, liveGames } from "@/lib/games/registry";
import { staticPaths as wowPaths } from "@/lib/games/wow/sitemap";
import { staticPaths as leaguePaths } from "@/lib/games/league-of-legends/sitemap";

export const revalidate = 86400;

const PATHS_BY_GAME: Record<string, () => string[]> = {
  wow: wowPaths,
  "league-of-legends": leaguePaths,
};

/** Static pages of every live game in every supported locale, with hreflang alternates. */
export function GET() {
  const urls: string[] = [];
  for (const game of liveGames()) {
    for (const path of PATHS_BY_GAME[game.slug]?.() ?? []) {
      const alternates = game.locales
        .map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${xmlEscape(`${siteOrigin}${gameHref(game, l, path)}`)}"/>`)
        .join("");
      for (const lang of game.locales) {
        urls.push(`<url><loc>${xmlEscape(`${siteOrigin}${gameHref(game, lang, path)}`)}</loc>${alternates}</url>`);
      }
    }
  }
  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join("")}</urlset>`,
  );
}
