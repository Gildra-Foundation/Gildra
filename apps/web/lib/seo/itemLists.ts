import { midnightSpecializations } from "@/lib/data/wow/specializations";
import type { GameIntelligence, TierRole } from "@/lib/platform/games/intelligence";
import { itemListLd, type JsonLdThing } from "./structuredData";
import type { Lang as Locale } from "@/lib/i18n-paths";

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

/**
 * ItemList per role of the Mythic+ tier list the page renders first, in its rank
 * order ("Holy Priest — S"). Nothing for the labelled sample shown while the
 * meta API is off.
 */
export function tierListLd(locale: Locale, data: Pick<GameIntelligence, "roles" | "tierLists">): JsonLdThing[] {
  const roles = data.tierLists?.mythic_plus?.roles ?? data.roles;
  if (!roles) return [];
  return (["tank", "healer", "dps"] as const).flatMap((role) => {
    const entries = [...(roles[role] ?? [])].sort((a, b) => a.rank - b.rank);
    if (!entries.length) return [];
    const name = locale === "ru" ? `Тир-лист Mythic+: ${roleNames.ru[role]}` : `Mythic+ tier list: ${roleNames.en[role]}`;
    return [itemListLd(name, entries.map((entry) => ({ name: `${entry.specName} ${entry.className} — ${entry.tier}`, href: specPagePath(locale, entry.classSlug, entry.specSlug) })))];
  });
}

/** Ranked players of a leaderboard page as shown (name and realm, no profile links: those are nofollow). */
export function leaderboardLd(name: string, entries: ReadonlyArray<{ name: string; realm: { name: string; nameRu?: string } }>, locale: Locale): JsonLdThing {
  return itemListLd(name, entries.slice(0, 100).map((entry) => ({ name: `${entry.name} — ${(locale === "ru" && entry.realm.nameRu) || entry.realm.name}` })));
}
