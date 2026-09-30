import { definePage } from "@/lib/pages/definePage";

export const tierListsPage = definePage({
  game: "wow",
  path: () => "/tier-lists",
  meta: ({ lang }) =>
    lang === "ru"
      ? {
          title: "Тир-листы Mythic+ и рейдов — Gildra",
          description:
            "Тир-листы специализаций для Mythic+, отдельных подземелий, рейдов и боссов с живыми метриками.",
          robots: { index: false, follow: true },
        }
      : {
          title: "Mythic+ & Raid Tier Lists — Gildra",
          description:
            "Specialization tier lists for Mythic+, individual dungeons, raids and bosses with live metrics.",
          robots: { index: false, follow: true },
        },
  page: () => ({
    id: "wow/tier-lists",
    game: "wow",
    path: "/tier-lists",
    layout: "default",
    blocks: [
      { type: "container", props: { variant: "route" }, children: [{ type: "wow.tierWorkspace" }] },
    ],
  }),
});
