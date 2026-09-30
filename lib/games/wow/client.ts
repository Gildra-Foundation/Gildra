/** WoW adapter: client-safe search index over published, source-tracked entities. */
import type { GameAdapter, SearchItem } from "@/lib/games/adapter";
import { specIcon } from "./assets";
import { midnightClasses, midnightSpecializations } from "@/data/wow/midnight-specializations";

const index = (lang: "en" | "ru"): SearchItem[] => [
  { group: "Pages", label: lang === "ru" ? "Рейды" : "Raids", path: "/wow/raids", sprite: "#ic-shield" },
  { group: "Pages", label: lang === "ru" ? "Подземелья" : "Dungeons", path: "/wow/dungeons", sprite: "#ic-map" },
  { group: "Pages", label: lang === "ru" ? "Таланты" : "Talents", path: "/talents/fury-warrior", sprite: "#ic-spark" },
  ...midnightSpecializations.map((spec) => ({
    group: "Specs",
    label: lang === "ru" ? spec.specNameRu : spec.specName,
    path: `/wow/classes/${spec.classSlug}/${spec.slug}`,
    img: specIcon(spec.specName),
  })),
  ...midnightClasses.map((entry) => ({
    group: "Classes",
    label: lang === "ru" ? entry.nameRu : entry.nameEn,
    path: `/wow/classes/${entry.slug}`,
    sprite: "#ic-sword",
  })),
];

export const wowAdapter: GameAdapter = {
  slug: "wow",
  searchIndex: (lang) => index(lang),
  searchGroups: ["Specs", "Classes", "Pages"],
  searchDefaultGroups: ["Pages"],
};
