/**
 * WoW homepage. The block order lives in home.blocks.ts and IS the page
 * rhythm described in design.md §G — change both together.
 */
import { definePage } from "@/lib/pages/definePage";
import { homeBlocks } from "./home.blocks";

export const homePage = definePage({
  game: "wow",
  path: () => "/",
  meta: ({ lang }) =>
    lang === "ru"
      ? {
          title: "Gildra — Владей метой",
          description:
            "Живые тир-листы World of Warcraft, статистика меты Mythic+ и рейдов, билды и гайды.",
        }
      : {
          title: "Gildra — Master the Meta",
          description:
            "Live World of Warcraft tier lists, Mythic+ and raid meta statistics, builds and guides.",
        },
  page: () => ({
    id: "wow/home",
    game: "wow",
    path: "/",
    layout: "default",
    shell: { reveal: true },
    blocks: homeBlocks,
  }),
});
