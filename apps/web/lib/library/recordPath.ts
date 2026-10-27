import type { Lang } from "@/lib/i18n-paths";

/**
 * Where a catalog record lives in the library. Every record type with its own
 * dataset opens there (items in the whole "items" dataset, not in a subset
 * such as weapons); a type without a dataset (item sets, talents, food…)
 * opens under the shared "records" path. /database answers 308 to these
 * addresses, and every in-app link to a record is built here.
 */
export const LIBRARY_TYPE_DATASET: Readonly<Record<string, string>> = {
  item: "items", spell: "spells", class: "classes", specialization: "specializations", pvp_talent: "pvp-talents",
  instance: "instances", encounter: "encounters", profession: "professions", recipe: "recipes",
  quest: "quests", quest_reward_package: "quest-reward-packages", creature: "npcs", map: "maps", ui_map: "ui-maps",
  area: "areas", faction: "factions", currency: "currencies", mount: "mounts", battle_pet: "battle-pets",
  toy: "toys", transmog_set: "transmog-sets", achievement: "achievements",
};

/** Dataset slug of record types that have no dataset of their own. */
export const LIBRARY_LOOSE_RECORDS = "records";

export function libraryDatasetForType(type: string) {
  return LIBRARY_TYPE_DATASET[type] ?? LIBRARY_LOOSE_RECORDS;
}

/** `/library/<dataset>/<type>/<id>/<slug>` (and its /ru twin); non-retail editions keep `?product=`. */
export function libraryRecordPath(lang: Lang, type: string, id: string, slug: string | number | undefined | null, product = "wow") {
  const query = product && product !== "wow" ? `?product=${encodeURIComponent(product)}` : "";
  return `${lang === "ru" ? "/ru" : ""}/library/${libraryDatasetForType(type)}/${encodeURIComponent(type)}/${encodeURIComponent(id)}/${encodeURIComponent(String(slug || "record"))}${query}`;
}
