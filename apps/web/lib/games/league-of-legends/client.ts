/** League of Legends adapter: search over real destinations only (no invented data). */
import type { GameAdapter, SearchItem } from "@/lib/games/adapter";

const INDEX: SearchItem[] = [
  { group: "Pages", label: "Champion Database", path: "/", sprite: "#ic-sword" },
  { group: "Pages", label: "Items", path: "/content/items", sprite: "#ic-bag" },
  { group: "Pages", label: "Runes", path: "/content/runes", sprite: "#ic-spark" },
  { group: "Pages", label: "Summoner Spells", path: "/content/summoner-spells", sprite: "#ic-scroll" },
];

export const leagueAdapter: GameAdapter = {
  slug: "league-of-legends",
  searchIndex: () => INDEX,
  searchGroups: ["Pages"],
  searchDefaultGroups: ["Pages"],
};
