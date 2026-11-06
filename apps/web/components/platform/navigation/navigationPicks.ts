import { classColors } from "@/lib/atlas/dataPalette";
import { dungeonRoutes, dungeonSlugs } from "@/lib/data/wow/mythic/dungeonRoutes";
import { raidHubEntries } from "@/components/wow/raid/raidHubData";
import { midnightSpecializations, midnightClasses } from "@/lib/data/wow/specializations";
import { CLASS_ICONS, classIcon } from "@/lib/games/wow/assets";

/** One quick link of a realm menu: a dungeon or raid painting, or a class of the roster. */
export type NavigationPick = { href: string; label: { en: string; ru: string }; image: string; tint?: string };
export type NavigationPickGroup = { kind: "art" | "class"; title: { en: string; ru: string }; picks: NavigationPick[] };
/** Quick links next to a realm's pages, by realm id (realms without any are absent). */
export type NavigationPicks = Partial<Record<string, NavigationPickGroup>>;

const iconKeyOf = (classKey: string) => Object.keys(CLASS_ICONS).find(key => CLASS_ICONS[key] === classKey);

/**
 * Built on the server (root document) and handed to the bar as props, so the
 * dungeon, raid and class tables never enter the client bundle.
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
  return { heroes: classes, mythic: dungeons, raids };
}
