/**
 * Auction categories a player expects, mapped to the game's item classes. Commodities (reagents, consumables, gems)
 * trade on one region-wide market; gear and recipes stay on each realm's own auction house, so their categories
 * need a realm. Icons are official game icons by file name (render.worldofwarcraft.com).
 */
export type AuctionCategoryKey =
  | "ore" | "herbs" | "cloth" | "leather" | "enchanting" | "gems" | "elemental" | "cooking" | "inscription" | "parts" | "reagents"
  | "potions" | "flasks" | "food" | "enhancements"
  | "weapons" | "armor" | "recipes";
export type AuctionCategoryGroup = "materials" | "consumables" | "gear";
export type AuctionCategory = {
  key: AuctionCategoryKey; group: AuctionCategoryGroup; market: "commodities" | "realm";
  /** [item class, item subclass]; no subclass means the whole class. */
  classes: readonly (readonly [number, number?])[];
  icon: string;
};

export const auctionCategories: readonly AuctionCategory[] = [
  { key: "ore", group: "materials", market: "commodities", classes: [[7, 7]], icon: "inv_ore_brilliantsilver" },
  { key: "herbs", group: "materials", market: "commodities", classes: [[7, 9]], icon: "inv_misc_herb_mycobloom" },
  { key: "cloth", group: "materials", market: "commodities", classes: [[7, 5]], icon: "inv_10_tailoring_silkrare_color3" },
  { key: "leather", group: "materials", market: "commodities", classes: [[7, 6]], icon: "inv_12_skinning_stormchargedleather2" },
  { key: "enchanting", group: "materials", market: "commodities", classes: [[7, 12]], icon: "inv_enchanting_dust_color3" },
  { key: "gems", group: "materials", market: "commodities", classes: [[3], [7, 4]], icon: "inv_jewelcrafting_icediamond_02" },
  { key: "elemental", group: "materials", market: "commodities", classes: [[7, 10]], icon: "inv_eng_bottledelements" },
  { key: "cooking", group: "materials", market: "commodities", classes: [[7, 8]], icon: "inv_misc_food_meat_rawtigersteak" },
  { key: "inscription", group: "materials", market: "commodities", classes: [[7, 16]], icon: "inv_crystalline_powder_orange" },
  { key: "parts", group: "materials", market: "commodities", classes: [[7, 1]], icon: "inv_blacksmithingalloys_green" },
  { key: "reagents", group: "materials", market: "commodities", classes: [[7, 18], [7, 19]], icon: "inv_10_gearcraft_artisansmettle_color3" },
  { key: "potions", group: "consumables", market: "commodities", classes: [[0, 1]], icon: "inv_flask_blue" },
  { key: "flasks", group: "consumables", market: "commodities", classes: [[0, 2], [0, 3]], icon: "inv_potion_orange" },
  { key: "food", group: "consumables", market: "commodities", classes: [[0, 5]], icon: "inv_misc_food_vendor_roastedbarlytea" },
  { key: "enhancements", group: "consumables", market: "commodities", classes: [[8], [0, 6]], icon: "inv_10_enchanting_crystal_color5" },
  { key: "weapons", group: "gear", market: "realm", classes: [[2]], icon: "inv_sword_04" },
  { key: "armor", group: "gear", market: "realm", classes: [[4]], icon: "inv_chest_plate16" },
  { key: "recipes", group: "gear", market: "realm", classes: [[9]], icon: "inv_scroll_03" },
];

export const auctionCategoryGroups: readonly AuctionCategoryGroup[] = ["materials", "consumables", "gear"];

export function auctionCategory(key: string | null | undefined): AuctionCategory | undefined {
  return auctionCategories.find(category => category.key === key);
}

export const auctionIconUrl = (name: string) => `https://render.worldofwarcraft.com/eu/icons/56/${name}.jpg`;

/** Does an item of this class/subclass belong to the category? */
export function inAuctionCategory(category: AuctionCategory, classId: number | null | undefined, subclassId: number | null | undefined) {
  return category.classes.some(([cls, sub]) => cls === classId && (sub === undefined || sub === subclassId));
}
