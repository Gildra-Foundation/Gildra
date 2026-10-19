import { definePage } from "@/lib/pages/definePage";

export const tierListsPage = definePage({
  game: "wow",
  path: () => "/tier-lists",
  meta: ({ lang }) =>
    lang === "ru"
      ? {
          title: "Тир-листы: Эпохальный+ и рейды — Gildra",
          description:
            "Тир-листы специализаций для режима «Эпохальный+» и рейдов: роль, класс, подземелье, уровень ключа и карточка спека.",
          robots: { index: false, follow: true },
        }
      : {
          title: "Mythic+ & Raid Tier Lists — Gildra",
          description:
            "Specialization tier lists for Mythic+ and raids: role, class, dungeon, key range and a spec card.",
          robots: { index: false, follow: true },
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
