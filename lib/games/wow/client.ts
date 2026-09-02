/** WoW adapter: client-safe search index over real pages and demo entities. */
import type { GameAdapter, SearchItem } from "@/lib/games/adapter";
import { SPEC_ICONS, classIcon, specIcon } from "./assets";
import { specHref } from "@/lib/specs";
import { builds, classChips, featuredGuide, guidesList, raid } from "@/data/site";
import { ANCHORS, anchorHref } from "@/lib/anchors";

/** Локальный индекс только по реально существующим данным и destinations. */
const INDEX: SearchItem[] = [
  { group: "Pages", label: "World of Warcraft Database", path: "/database", sprite: "#ic-database" },
  { group: "Pages", label: "Mythic+ Tier List", path: "/tier-lists", sprite: "#ic-sword" },
  { group: "Pages", label: "Meta overview", path: anchorHref(ANCHORS.meta), sprite: "#ic-sword" },
  { group: "Pages", label: "Latest Guides", path: anchorHref(ANCHORS.guides), sprite: "#ic-book" },
  { group: "Raid", label: `${raid.name} — Current Raid`, path: anchorHref(ANCHORS.raid), sprite: "#ic-shield" },
  ...Object.keys(SPEC_ICONS).map((name) => ({
    group: "Specs",
    label: name,
    path: specHref(name),
    img: specIcon(name),
  })),
  ...classChips
    .filter((c) => c.key !== "all")
    .map((c) => ({
      group: "Classes",
      label: c.label,
      path: "/tier-lists",
      img: classIcon(c.key),
    })),
  ...builds.map((b) => ({
    group: "Builds",
    label: b.title,
    path: anchorHref(ANCHORS.builds, "/tier-lists"),
    img: specIcon(b.spec.name),
  })),
  ...[featuredGuide, ...guidesList].map((g) => ({
    group: "Guides",
    label: g.title,
    path: anchorHref(ANCHORS.guides),
    sprite: "#ic-book",
  })),
];

export const wowAdapter: GameAdapter = {
  slug: "wow",
  searchIndex: () => INDEX,
  searchGroups: ["Specs", "Classes", "Builds", "Raid", "Guides", "Pages"],
  searchDefaultGroups: ["Pages", "Raid"],
};
