import { midnightSpecializations } from "@/lib/data/wow/specializations";
import type { GameIntelligence, TierRole } from "@/lib/platform/games/intelligence";
import { itemListLd, type JsonLdThing } from "./structuredData";
import type { Lang as Locale } from "@/lib/i18n-paths";
import { sourceKey, type PvpBracket, type TierMode, type TierSourceSlices } from "@/components/blocks/wow/tierWorkspace/tierSourceKeys";

const prefix = (locale: Locale) => (locale === "ru" ? "/ru" : "");

/** The specialization page of a tier entry (/wow/classes/<class>/<spec>-<class>), when the spec is known. */
export function specPagePath(locale: Locale, classSlug: string, specSlug: string) {
  const spec = midnightSpecializations.find((entry) => entry.classSlug === classSlug && (entry.slug === specSlug || entry.slug === `${specSlug}-${classSlug}`));
  return spec ? `${prefix(locale)}/wow/classes/${spec.classSlug}/${spec.slug}` : undefined;
}

const roleNames: Record<Locale, Record<TierRole, string>> = {
  en: { tank: "Tanks", healer: "Healers", dps: "Damage" },
  ru: { tank: "Танки", healer: "Лекари", dps: "Бойцы" },
};

const bracketNames: Record<PvpBracket, string> = { "3v3": "3v3", "2v2": "2v2", shuffle: "Solo Shuffle", blitz: "Blitz", rbg: "RBG" };

/** "Mythic+ tier list", "Raid tier list", "3v3 arena tier list" (and RU). */
function listName(locale: Locale, mode: TierMode, bracket: PvpBracket) {
  if (locale === "ru") return mode === "raid" ? "Тир-лист рейдов" : mode === "pvp" ? `Тир-лист PvP ${bracketNames[bracket]}` : "Тир-лист Mythic+";
  return mode === "raid" ? "Raid tier list" : mode === "pvp" ? `${bracketNames[bracket]} PvP tier list` : "Mythic+ tier list";
}

/**
 * ItemList per role of the tier list the page renders first (its mode: Mythic+,
 * raids or the arena bracket's ladder), in rank order ("Holy Priest — S").
 * Nothing for the labelled sample shown while the meta API is off.
 */
export function tierListLd(
  locale: Locale,
  data: Pick<GameIntelligence, "roles" | "tierLists"> & { slices?: TierSourceSlices },
  mode: TierMode = "mythic_plus",
  bracket: PvpBracket = "3v3",
): JsonLdThing[] {
  const roles = mode === "pvp"
    ? data.slices?.[sourceKey({ source: "gildra", mode: "pvp", bracket, region: "all" })]?.roles
    : data.tierLists?.[mode]?.roles ?? (mode === "mythic_plus" ? data.roles : undefined);
  if (!roles) return [];
  return (["tank", "healer", "dps"] as const).flatMap((role) => {
    const entries = [...(roles[role] ?? [])].sort((a, b) => a.rank - b.rank);
    if (!entries.length) return [];
    const name = `${listName(locale, mode, bracket)}: ${roleNames[locale][role]}`;
    return [itemListLd(name, entries.map((entry) => ({ name: `${entry.specName} ${entry.className} — ${entry.tier}`, href: specPagePath(locale, entry.classSlug, entry.specSlug) })))];
  });
}

/** Ranked players of a leaderboard page as shown (name and realm, no profile links: those are nofollow). */
export function leaderboardLd(name: string, entries: ReadonlyArray<{ name: string; realm: { name: string; nameRu?: string } }>, locale: Locale): JsonLdThing {
  return itemListLd(name, entries.slice(0, 100).map((entry) => ({ name: `${entry.name} — ${(locale === "ru" && entry.realm.nameRu) || entry.realm.name}` })));
}
