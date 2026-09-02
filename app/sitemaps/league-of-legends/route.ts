import { siteOrigin, xmlEscape, xmlResponse } from "@/lib/sitemap";
import { GAMES, gameHref } from "@/lib/games/registry";
import { getLeagueChampions } from "@/lib/games/league-of-legends/api";

export const revalidate = 3600;
export const dynamic = "force-dynamic";

const game = GAMES["league-of-legends"];

/** Champion detail pages in both locales, with hreflang alternates. */
export async function GET() {
  const champions = await getLeagueChampions("en_US");
  const urls = champions
    .flatMap((champion) => {
      const path = `/champions/${champion.slug}`;
      const alternates = game.locales
        .map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${xmlEscape(`${siteOrigin}${gameHref(game, l, path)}`)}"/>`)
        .join("");
      return game.locales.map(
        (lang) => `<url><loc>${xmlEscape(`${siteOrigin}${gameHref(game, lang, path)}`)}</loc>${alternates}</url>`,
      );
    })
    .join("");
  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`,
  );
}
