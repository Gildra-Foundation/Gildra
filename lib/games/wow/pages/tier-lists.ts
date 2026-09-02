import { definePage } from "@/lib/pages/definePage";
import { ANCHORS } from "@/lib/anchors";

export const tierListsPage = definePage({
  game: "wow",
  path: () => "/tier-lists",
  meta: ({ lang }) =>
    lang === "ru"
      ? {
          title: "Тир-лист Mythic+ — Gildra",
          description:
            "Полный тир-лист Mythic+ с фильтрами, чипами классов, избранными билдами и деталями спеков.",
        }
      : {
          title: "Mythic+ Tier List — Gildra",
          description:
            "Full Mythic+ tier list with filters, class chips, featured builds and spec details.",
        },
  page: () => ({
    id: "wow/tier-lists",
    game: "wow",
    path: "/tier-lists",
    layout: "default",
    blocks: [
      {
        type: "sectionNav",
        props: { anchorsFrom: "wow/home", linkToHome: true, active: ANCHORS.tierPreview },
      },
      { type: "container", props: { variant: "route" }, children: [{ type: "wow.tierWorkspace" }] },
    ],
  }),
});
