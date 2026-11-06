import { definePage } from "@/lib/pages/definePage";

export const tierListsPage = definePage({
  game: "wow",
  path: () => "/tier-lists",
  meta: ({ lang }) =>
    lang === "ru"
      ? {
          title: "Тир-листы: Эпохальный+, рейды и арена — Gildra",
          description:
            "Тир-листы специализаций для «Эпохального+», рейдов и арены (3v3, 2v2, Solo Shuffle, Blitz, RBG): сводный тир Gildra, ведущие источники и их сравнение.",
        }
      : {
          title: "Mythic+, Raid & Arena Tier Lists — Gildra",
          description:
            "Specialization tier lists for Mythic+, raids and arena (3v3, 2v2, Solo Shuffle, Blitz, RBG): Gildra's overall tier, leading sources and a side-by-side view.",
        },
  page: () => ({
    id: "wow/tier-lists",
    game: "wow",
    path: "/tier-lists",
    layout: "default",
    // Atlas page: the block renders its own AtlasFrame (frame, hero and legal footer).
    blocks: [{ type: "wow.tierWorkspace" }],
  }),
});
