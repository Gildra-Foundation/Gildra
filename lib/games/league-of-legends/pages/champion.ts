import { definePage } from "@/lib/pages/definePage";
import { GAMES } from "@/lib/games/registry";
import { getLeagueChampion, type LeagueChampionDetail } from "@/lib/games/league-of-legends/api";
import { clean } from "@/components/blocks/league-of-legends/championDetail";

const game = GAMES["league-of-legends"];

/** /league-of-legends/champions/[slug] — dynamic, ISR via the API fetch cache. */
export const championPage = definePage<{ slug: string }, Record<never, never>, LeagueChampionDetail | null>({
  game: "league-of-legends",
  path: ({ slug }) => `/champions/${slug}`,
  legacyLocaleQuery: true,
  load: ({ params, lang }) => getLeagueChampion(params.slug, game.apiLocale[lang]),
  meta: ({ data: champion }) =>
    champion
      ? { title: `${champion.name} — League of Legends Database | Gildra`, description: clean(champion.blurb) }
      : { title: "Champion not found — Gildra" },
  page: ({ params }) => ({
    id: "lol/champion",
    game: "league-of-legends",
    path: `/champions/${params.slug}`,
    layout: "default",
    blocks: [
      {
        type: "lol.main",
        props: { variant: "detail" },
        children: [{ type: "lol.championDetail", props: { slug: params.slug } }],
      },
    ],
  }),
});
