import { definePage } from "@/lib/pages/definePage";
import { isPublicationReady } from "@/lib/wow/publication";

export const tierListsPage = definePage({
  game: "wow",
  path: () => "/tier-lists",
  meta: ({ lang }) =>
    lang === "ru"
      ? {
          title: "Тир-листы: Эпохальный+ и рейды — Gildra",
          description:
            "Рейтинги специализаций для «Эпохального+» и рейдов: бойцы, танки и лекари, источники оценок и время обновления.",
          robots: { index: isPublicationReady("/tier-lists"), follow: true },
        }
      : {
          title: "Mythic+ & Raid Tier Lists — Gildra",
          description:
            "Mythic+ and raid specialization rankings for damage dealers, tanks and healers, with sources and update times.",
          robots: { index: isPublicationReady("/tier-lists"), follow: true },
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
