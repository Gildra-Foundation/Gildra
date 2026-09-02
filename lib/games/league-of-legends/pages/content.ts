import { notFound } from "next/navigation";
import { definePage } from "@/lib/pages/definePage";
import { CONTENT_CATEGORIES } from "@/components/blocks/league-of-legends/contentCategory";

/** /league-of-legends/content/[category]?cursor= — items, runes, summoner spells, maps, profile icons. */
export const contentPage = definePage<{ category: string }, { cursor?: string }>({
  game: "league-of-legends",
  path: ({ category }) => `/content/${category}`,
  readsSearch: true,
  legacyLocaleQuery: true,
  meta: ({ params }) => {
    const config = CONTENT_CATEGORIES[params.category];
    return {
      title: config ? `${config.title} — League of Legends | Gildra` : "League of Legends Content Database — Gildra",
      description: config?.description,
    };
  },
  page: ({ params, search }) => {
    if (!CONTENT_CATEGORIES[params.category]) notFound();
    return {
      id: "lol/content",
      game: "league-of-legends",
      path: `/content/${params.category}`,
      layout: "default",
      blocks: [
        {
          type: "lol.main",
          children: [
            { type: "lol.contentCategory", props: { category: params.category, cursor: search.cursor } },
          ],
        },
      ],
    };
  },
});
