import { siteOrigin, xmlEscape, xmlResponse } from "@/lib/sitemap";
import { GAMES, gameHref } from "@/lib/games/registry";
import { getLeagueChampions } from "@/lib/games/league-of-legends/api";

export const revalidate = 3600;
export const dynamic = "force-dynamic";

const game = GAMES["league-of-legends"];

/** Champion detail pages in both locales, with hreflang alternates. */
export async function GET() {
  let champions: Awaited<ReturnType<typeof getLeagueChampions>>;
  try {
    champions = await getLeagueChampions("en_US");
  } catch (error) {
    console.error("League of Legends sitemap unavailable", error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"></urlset>',
      {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=0, s-maxage=60, stale-if-error=86400",
          "Retry-After": "60",
          "X-Gildra-Sitemap-Degraded": "league-catalog-unavailable",
        },
      },
    );
  }
  const urls = champions
    .flatMap((champion) => {
      const path = `/champions/${champion.slug}`;
      const alternates = game.locales
        .map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${xmlEscape(`${siteOrigin}${gameHref(game, l, path)}`)}"/>`)
        .join("");
      const defaultAlternate = `<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(`${siteOrigin}${gameHref(game, "en", path)}`)}"/>`;
      return game.locales.map(
        (lang) => `<url><loc>${xmlEscape(`${siteOrigin}${gameHref(game, lang, path)}`)}</loc>${alternates}${defaultAlternate}</url>`,
      );
    })
    .join("");
  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`,
  );
}
