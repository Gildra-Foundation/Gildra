import { classColors } from "@/lib/atlas/dataPalette";
import { dungeonRoutes, dungeonSlugs } from "@/lib/data/wow/mythic/dungeonRoutes";
import { raidHubEntries } from "@/components/wow/raid/raidHubData";
import { midnightSpecializations, midnightClasses } from "@/lib/data/wow/specializations";
import { CLASS_ICONS, classIcon } from "@/lib/games/wow/assets";
import { professionIndex } from "@/lib/data/wow/professionIndex";
import { professionIconUrl } from "@/lib/wow/professions/leveling";
import { foreverClasses } from "@/lib/data/wow/foreverRoster";
import { instanceArt } from "@/components/wow/forever/instanceArt";
import { foreverRaids, newDungeons } from "@/components/wow/forever/instanceData";
import { instanceName } from "@/components/wow/forever/instanceLocalization";

/** Signs the bar draws for picks without a picture of their own (tier lists, library collections). */
export type NavigationPickGlyph =
  | "raid" | "arena" | "duel" | "shuffle" | "blitz"
  | "items" | "weapons" | "armor" | "gems" | "spells" | "mounts" | "pets" | "toys";

/** One quick link of a realm menu: a dungeon or raid painting, a class or profession icon, or a sign. */
export type NavigationPick = {
  href: string;
  label: { en: string; ru: string };
  image?: string;
  /** The picture is served as is (a game icon from the icon host). */
  remote?: boolean;
  glyph?: NavigationPickGlyph;
  tint?: string;
};
export type NavigationPickGroup = {
  /** art: paintings; class: class crests; icon: game icons; glyph: drawn signs. */
  kind: "art" | "class" | "icon" | "glyph";
  title: { en: string; ru: string };
  picks: NavigationPick[];
  /** Alphabetical order of the picks per language (indices into picks), sorted here on the
   *  server: a localeCompare in the bar started the browser's collation data on every page. */
  order?: { en: number[]; ru: number[] };
};
/** Quick links next to a realm's pages, by realm id (realms without any are absent). */
export type NavigationPicks = Partial<Record<string, NavigationPickGroup>>;

const iconKeyOf = (classKey: string) => Object.keys(CLASS_ICONS).find(key => CLASS_ICONS[key] === classKey);

/**
 * Built on the server (root document) and handed to the bar as props, so the
 * dungeon, raid, class and profession tables never enter the client bundle.
 */
export function navigationPicks(): NavigationPicks {
  const dungeons: NavigationPickGroup = {
    kind: "art",
    title: { en: "Dungeons", ru: "Подземелья" },
    picks: dungeonSlugs.map(slug => {
      const dungeon = dungeonRoutes[slug];
      return { href: `/wow/mythic-plus/midnight-season-2/${slug}`, label: { en: dungeon.name, ru: dungeon.nameRu }, image: dungeon.backdropImage };
    }),
  };
  const raids: NavigationPickGroup = {
    kind: "art",
    title: { en: "Midnight raids", ru: "Рейды Midnight" },
    picks: raidHubEntries.map(raid => ({
      href: `/wow/raids/${raid.slug}`,
      label: raid.names,
      image: raid.sceneArt ?? raid.artwork,
    })),
  };
  const classes: NavigationPickGroup = {
    kind: "class",
    title: { en: "Classes", ru: "Классы" },
    picks: midnightClasses.flatMap(entry => {
      const classKey = midnightSpecializations.find(spec => spec.classSlug === entry.slug)?.classKey;
      const iconKey = classKey ? iconKeyOf(classKey) : undefined;
      const image = iconKey ? classIcon(iconKey) : null;
      if (!image) return [];
      // The roster card on /wow/classes (the per-class pages are placeholders).
      return [{ href: `/wow/classes#${entry.slug}`, label: { en: entry.nameEn, ru: entry.nameRu }, image, tint: classColors[entry.slug as keyof typeof classColors] }];
    }),
  };
  const alphabetical = (lang: "en" | "ru") => classes.picks.map((_, index) => index).sort((a, b) => classes.picks[a].label[lang].localeCompare(classes.picks[b].label[lang], lang));
  classes.order = { en: alphabetical("en"), ru: alphabetical("ru") };
  // Crafting, gathering, then cooking and fishing: the order of the professions hub.
  const professions: NavigationPickGroup = {
    kind: "icon",
    title: { en: "Professions", ru: "Профессии" },
    picks: professionIndex.flatMap(profession => {
      const image = professionIconUrl(profession.icon);
      return image ? [{ href: `/wow/professions/${profession.slug}`, label: profession.name, image, remote: true }] : [];
    }),
  };
  const tierLists: NavigationPickGroup = {
    kind: "glyph",
    title: { en: "Modes", ru: "Режимы" },
    picks: [
      { href: "/tier-lists/raid", glyph: "raid", label: { en: "Raids", ru: "Рейды" } },
      { href: "/tier-lists/arena", glyph: "arena", label: { en: "Arena 3v3", ru: "Арена 3v3" } },
      { href: "/tier-lists/arena/2v2", glyph: "duel", label: { en: "Arena 2v2", ru: "Арена 2v2" } },
      { href: "/tier-lists/arena/solo-shuffle", glyph: "shuffle", label: { en: "Solo Shuffle", ru: "Solo Shuffle" } },
      { href: "/tier-lists/arena/blitz", glyph: "blitz", label: { en: "Blitz", ru: "Blitz" } },
    ],
  };
  // The library's own names for its largest collections (/library lists them all).
  const collections: NavigationPickGroup = {
    kind: "glyph",
    title: { en: "Collections", ru: "Коллекции" },
    picks: [
      { href: "/library/items", glyph: "items", label: { en: "Items", ru: "Предметы" } },
      { href: "/library/weapons", glyph: "weapons", label: { en: "Weapons", ru: "Оружие" } },
      { href: "/library/armor", glyph: "armor", label: { en: "Armor", ru: "Броня" } },
      { href: "/library/gems", glyph: "gems", label: { en: "Gems", ru: "Самоцветы" } },
      { href: "/library/spells", glyph: "spells", label: { en: "Spells", ru: "Заклинания" } },
      { href: "/library/mounts", glyph: "mounts", label: { en: "Mounts", ru: "Маунты" } },
      { href: "/library/battle-pets", glyph: "pets", label: { en: "Battle pets", ru: "Боевые питомцы" } },
      { href: "/library/toys", glyph: "toys", label: { en: "Toys", ru: "Игрушки" } },
    ],
  };
  // The nine classes of the Forever version, in the order of its roster.
  const foreverRoster: NavigationPickGroup = {
    kind: "class",
    title: { en: "Classes", ru: "Классы" },
    picks: foreverClasses.flatMap(entry => {
      const image = classIcon(entry.icon);
      return image ? [{ href: `/wow/forever/classes/${entry.slug}`, label: entry.name, image, tint: classColors[entry.slug as keyof typeof classColors] }] : [];
    }),
  };
  // The nine dungeons new in Forever and its three raids, with the game's own paintings.
  const foreverDungeons: NavigationPickGroup = {
    kind: "art",
    title: { en: "New dungeons", ru: "Новые подземелья" },
    picks: newDungeons.map(dungeon => ({ href: `/wow/forever/dungeons/${dungeon.slug}`, label: { en: dungeon.name, ru: instanceName(dungeon.name, "ru") }, image: instanceArt(dungeon.slug)?.src })),
  };
  const foreverRaidDoors: NavigationPickGroup = {
    kind: "art",
    title: { en: "Level 60 raids", ru: "Рейды 60-го уровня" },
    picks: foreverRaids.map(raid => ({ href: `/wow/forever/raids#${raid.id}`, label: { en: raid.name, ru: instanceName(raid.name, "ru") }, image: instanceArt(raid.id)?.src })),
  };
  return {
    classes, mythic: dungeons, raids, meta: tierLists, tools: professions, library: collections,
    "forever-classes": foreverRoster, "forever-dungeons": foreverDungeons, "forever-raids": foreverRaidDoors,
  };
}
