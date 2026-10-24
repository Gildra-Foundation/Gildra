import type { AuctionListing } from "./auctionBrowser";

/** Localized Blizzard preview. Variant identity stays separate from display facts. */
export type AuctionItemDetails = {
  itemClassId?: number; itemSubclassId?: number; inventoryType?: string; qualityId?: number;
  name: string | null; iconUrl: string | null; quality: string | null;
  itemLevel: string | null; slot: string | null; binding: string | null;
  requiredLevel: string | null; armor: string | null; stats: string[];
  weapon: string[]; effects: string[]; description: string | null;
  bonusIds: number[]; context: number; modifiers: { type: number; value: number }[];
};
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim().slice(0, 2000) : null;
const display = (value: unknown) => text(object(value).display_string);
export function auctionItemIcon(raw: unknown): string | null {
  const assets = object(raw).assets;
  if (!Array.isArray(assets)) return null;
  for (const asset of assets) {
    if (object(asset).key !== "icon" || typeof object(asset).value !== "string") continue;
    try {
      const url = new URL(String(object(asset).value));
      if (url.protocol === "https:" && !url.username && !url.password && !url.port && url.hostname === "render.worldofwarcraft.com") return url.href;
    } catch { /* An invalid media entry must not hide the listing. */ }
  }
  return null;
}
export function parseAuctionItemDetails(raw: unknown, itemId: number, iconUrl: string | null): AuctionItemDetails {
  const item = object(raw), preview = object(item.preview_item);
  if (item.id !== itemId) throw new Error("invalid_item_metadata");
  const lines = (value: unknown, pick: (v: unknown) => string | null) => Array.isArray(value) ? value.slice(0, 32).map(pick).filter((v): v is string => v !== null) : [];
  const bonuses = Array.isArray(preview.bonus_list) ? preview.bonus_list : [];
  const modifiers = Array.isArray(preview.modifiers) ? preview.modifiers : [];
  const weapon = object(preview.weapon);
  return {
    itemClassId: Number(object(item.item_class).id), itemSubclassId: Number(object(item.item_subclass).id),
    inventoryType: String(object(item.inventory_type).type ?? ""), qualityId: Number(object(item.quality).type === "POOR" ? 0 : ({ COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, ARTIFACT: 6, HEIRLOOM: 7 } as Record<string, number>)[String(object(item.quality).type)]),
    name: text(item.name), iconUrl, quality: text(object(preview.quality ?? item.quality).name),
    itemLevel: display(preview.level), slot: text(object(preview.inventory_type ?? item.inventory_type).name),
    binding: text(object(preview.binding).name), requiredLevel: display(object(preview.requirements).level),
    armor: display(preview.armor), stats: lines(preview.stats, v => display(object(v).display)),
    weapon: [display(weapon.damage), display(weapon.attack_speed), display(weapon.dps)].filter((v): v is string => Boolean(v)),
    effects: lines(preview.spells, v => text(object(v).description)), description: text(item.description),
    bonusIds: bonuses.filter((v): v is number => Number.isSafeInteger(v) && Number(v) > 0),
    context: Number.isSafeInteger(preview.context) ? Number(preview.context) : 0,
    modifiers: modifiers.filter(v => Number.isSafeInteger(object(v).type) && Number.isSafeInteger(object(v).value)).map(v => ({ type: Number(object(v).type), value: Number(object(v).value) })),
  };
}
export function auctionPreviewMatches(row: AuctionListing, item: AuctionItemDetails): boolean {
  if (row.petSpeciesId) return false;
  const bonuses = (values: number[]) => JSON.stringify([...values].sort((a, b) => a - b));
  const modifiers = (values: { type: number; value: number }[]) => JSON.stringify([...values].sort((a, b) => a.type - b.type || a.value - b.value));
  return row.context === item.context && bonuses(row.bonusIds) === bonuses(item.bonusIds) && modifiers(row.modifiers) === modifiers(item.modifiers);
}
