import type { CatalogCategory } from "@/lib/api/client";
import type { Lang } from "@/lib/i18n-paths";
import type { LibraryCardLayout } from "@/components/library/LibraryRecordCard";

/** One row of one-click filters on a dataset page: categories of the dataset's record type picked by a rule. */
export type LibraryRail = { id: string; label: string; categories: CatalogCategory[] };

type RailRule = { id: string; label: Record<Lang, string>; pick: (category: CatalogCategory) => boolean; limit?: number };

const slot = (category: CatalogCategory) => category.facet === "equipment_slot";
// Item classes the client still marks obsolete or that duplicate another class are not offered as filters.
const usefulItemClass = (category: CatalogCategory) => category.facet === "item_class" && category.count >= 50
  && !/obsolete|^item-types\/(armor|weapon|tradeskill|jewelry)/.test(category.path);

const RULES: Record<string, RailRule[]> = {
  items: [
    { id: "slot", label: { ru: "Слот", en: "Slot" }, pick: slot },
    { id: "class", label: { ru: "Класс предмета", en: "Item class" }, pick: usefulItemClass },
  ],
  armor: [
    { id: "armor", label: { ru: "Тип брони", en: "Armor type" }, pick: (category) => category.facet === "armor_type" },
    { id: "slot", label: { ru: "Слот", en: "Slot" }, pick: (category) => slot(category) && category.parentPath === "equipment/slots" },
  ],
  weapons: [{ id: "weapon", label: { ru: "Тип оружия", en: "Weapon type" }, pick: (category) => category.facet === "weapon_type" }],
  gems: [{ id: "gem", label: { ru: "Цвет и характеристика", en: "Colour and stat" }, pick: (category) => category.parentPath === "item-types/gem" }],
  consumables: [{ id: "consumable", label: { ru: "Вид", en: "Kind" }, pick: (category) => category.parentPath === "item-types/consumable" }],
  "trade-goods": [{ id: "trade", label: { ru: "Вид", en: "Kind" }, pick: (category) => category.parentPath === "item-types/trade-goods" }],
};

/** Datasets whose records are mostly looked at by their icon (gems, collections): square tray tiles. */
const TRAY = new Set(["gems", "mounts", "battle-pets", "toys", "currencies", "achievements"]);

export function libraryCardLayout(slug: string): LibraryCardLayout {
  return TRAY.has(slug) ? "tray" : "cards";
}

/** Filter rows of a dataset page, largest categories first; empty rows are left out. */
export function libraryRails(slug: string, categories: CatalogCategory[], lang: Lang): LibraryRail[] {
  return (RULES[slug] ?? []).map((rule) => ({
    id: rule.id,
    label: rule.label[lang],
    categories: categories.filter((category) => category.count > 0 && rule.pick(category))
      .sort((a, b) => b.count - a.count || a.sortOrder - b.sortOrder).slice(0, rule.limit ?? 16),
  })).filter((rail) => rail.categories.length > 1);
}
