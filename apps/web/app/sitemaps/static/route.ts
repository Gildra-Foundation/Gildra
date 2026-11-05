import { siteOrigin, xmlEscape, xmlResponse } from "@/lib/sitemap";
import { gameHref, gamePath, liveGames } from "@/lib/games/registry";
import { runtimeFlags } from "@/lib/flags";
import { singleLanguagePaths } from "@/lib/routes/registry";
import { staticPaths as wowPaths } from "@/lib/games/wow/sitemap";
import { staticPaths as leaguePaths } from "@/lib/games/league-of-legends/sitemap";

// Read per request: whether the library is listed depends on the deployment (CATALOG_ACCESS_MODE).
export const dynamic = "force-dynamic";

const PATHS_BY_GAME: Record<string, (options: { catalogPublic: boolean }) => string[]> = {
  wow: wowPaths,
  "league-of-legends": leaguePaths,
};

/** Static pages of every live game in every supported locale, with hreflang alternates. */
export function GET() {
  const { catalogPublic } = runtimeFlags();
  const urls: string[] = [];
  for (const game of liveGames()) {
    for (const path of PATHS_BY_GAME[game.slug]?.({ catalogPublic }) ?? []) {
      // A single-language section is listed once, in its language, without alternates.
      const only = singleLanguagePaths.get(gamePath(game, path));
      if (only) {
        urls.push(`<url><loc>${xmlEscape(`${siteOrigin}${gameHref(game, only, path)}`)}</loc></url>`);
        continue;
      }
      const localizedAlternates = game.locales
        .map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${xmlEscape(`${siteOrigin}${gameHref(game, l, path)}`)}"/>`)
        .join("");
      const defaultHref = `${siteOrigin}${gameHref(game, game.locales.includes("en") ? "en" : game.locales[0], path)}`;
      const alternates = `${localizedAlternates}<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(defaultHref)}"/>`;
      for (const lang of game.locales) {
        urls.push(`<url><loc>${xmlEscape(`${siteOrigin}${gameHref(game, lang, path)}`)}</loc>${alternates}</url>`);
      }
    }
  }
  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join("")}</urlset>`,
  );
}
