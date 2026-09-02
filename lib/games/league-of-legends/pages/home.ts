import { definePage } from "@/lib/pages/definePage";

export const leagueHomePage = definePage({
  game: "league-of-legends",
  path: () => "/",
  legacyLocaleQuery: true,
  meta: () => ({
    title: "League of Legends Champion Database — Gildra",
    description:
      "Every League of Legends champion, ability, skin and official Data Dragon asset in one bilingual database.",
  }),
  page: () => ({
    id: "lol/home",
    game: "league-of-legends",
    path: "/",
    layout: "default",
    blocks: [
      {
        type: "lol.main",
        children: [
          {
            type: "lol.hero",
            props: {
              eyebrow: "GILDRA / GAME DATABASE",
              title: "Champion Database",
              description: "Explore every champion, ability, skin and official asset.",
            },
          },
          { type: "lol.championCatalog" },
        ],
      },
    ],
  }),
});
