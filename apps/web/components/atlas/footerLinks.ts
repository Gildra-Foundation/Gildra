/** Existing flat contract is retained for callers/tests that only need the essentials. */
export const ATLAS_FOOTER_LINKS = [
  { href: "/wow/mythic-plus", en: "Mythic+", ru: "Mythic+" },
  { href: "/wow/raids", en: "Raids", ru: "Рейды" },
  { href: "/tier-lists", en: "Tier lists", ru: "Тир-листы" },
  { href: "/library", en: "Library", ru: "Библиотека" },
  { href: "/wow/whats-new", en: "What's new", ru: "Что нового" },
  { href: "/privacy", en: "Privacy", ru: "Конфиденциальность" },
] as const;

import { foreverRealms, navigationRealms, linksFor, type NavigationLink } from "@/components/platform/navigation/navigationMap";
import { wowPortals } from "@/lib/games/wowPortals";
import type { Lang } from "@/lib/i18n-paths";

export const footerCopy = {
  ru: { description: "Маршруты, тактики и инструменты World of Warcraft.", navigation: "Навигация в подвале", language: "Язык в подвале", raids: "Рейды", hero: "Ваш герой", economy: "Экономика", world: "Мир и знания", versions: "Версии игры", adventures: "Подземелья и рейды", crafts: "Ремёсла и знания" },
  en: { description: "World of Warcraft routes, tactics and tools.", navigation: "Footer navigation", language: "Footer language", raids: "Raids", hero: "Your hero", economy: "Economy", world: "World and knowledge", versions: "Game versions", adventures: "Dungeons and raids", crafts: "Crafts and knowledge" },
} as const;

/** Each language named in itself (the footer language links). */
export const footerLanguageNames = { en: "English", ru: "Русский" } as const;

/** Intent groups consume the shared map; newly added destinations stay visible. */
export function footerGroups(locale: Lang) {
  const all = navigationRealms.flatMap(realm => linksFor(realm, locale));
  const select = (icons: string[]) => all.filter(link => icons.includes(link.icon));
  const groups: { id: string; title: string; links: Pick<NavigationLink, "href" | "label">[] }[] = [
    { id: "mythic", title: "Mythic+", links: select(["atlas", "guide", "meta", "comps", "stats", "leaderboard", "routes"]).filter(link => link.href !== "/tier-lists" && link.href !== "/wow/whats-new" && link.href !== "/wow/map") },
    { id: "raids", title: footerCopy[locale].raids, links: select(["journal", "lairs", "raidComp"]) },
    { id: "hero", title: footerCopy[locale].hero, links: select(["characters", "classes", "transmog"]).concat(all.filter(link => link.href === "/tier-lists")) },
    { id: "economy", title: footerCopy[locale].economy, links: select(["auction", "professions"]) },
    { id: "world", title: footerCopy[locale].world, links: select(["library", "stories"]).concat(all.filter(link => link.href === "/wow/map")) },
    { id: "versions", title: footerCopy[locale].versions, links: wowPortals.map(portal => ({ href: portal.path, label: portal.label })) },
    { id: "site", title: "WowArcana", links: [...all.filter(link => link.href === "/wow/whats-new"), { href: "/privacy", label: { en: "Privacy", ru: "Конфиденциальность" } }] },
  ];
  const used = new Set(groups.flatMap(group => group.links.map(link => link.href)));
  groups.find(group => group.id === "world")!.links.push(...all.filter(link => !used.has(link.href)));
  // The map is not in older menu maps; retain the existing public destination.
  if (!used.has("/wow/map")) groups.find(group => group.id === "world")!.links.push({ href: "/wow/map", label: { en: "World map", ru: "Карта мира" } });
  return groups;
}

/**
 * The footer of the Forever version: its pages in the same intent groups as the main footer
 * (four columns; the hero column is the tall one, the site's own links close the second row).
 */
export function foreverFooterGroups(locale: Lang) {
  const all = foreverRealms.flatMap(realm => linksFor(realm, locale));
  const select = (...paths: string[]) => paths.flatMap(path => all.filter(link => link.href === path));
  const main = footerGroups(locale);
  const groups: { id: string; title: string; links: Pick<NavigationLink, "href" | "label">[] }[] = [
    { id: "forever-hero", title: footerCopy[locale].hero, links: select("/wow/forever/classes", "/wow/forever/changes", "/wow/forever/talent-calc", "/wow/forever/tier-lists") },
    { id: "forever-adventures", title: footerCopy[locale].adventures, links: select("/wow/forever/dungeons", "/wow/forever/raids") },
    { id: "forever-crafts", title: footerCopy[locale].crafts, links: select("/wow/forever/professions", "/wow/forever/library") },
    ...main.filter(group => group.id === "versions" || group.id === "site"),
  ];
  // A page added to the Forever bar stays reachable from its footer.
  const used = new Set(groups.flatMap(group => group.links.map(link => link.href)));
  groups[2].links.push(...all.filter(link => !used.has(link.href)));
  return groups;
}
