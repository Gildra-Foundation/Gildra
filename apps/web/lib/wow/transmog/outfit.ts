import {
  armoredSlots, classArmor, transmogSlots,
  type ArmorType, type TransmogAppearance, type TransmogClass, type TransmogSetDetail, type TransmogSetSummary, type TransmogSlot,
} from "./model";

/**
 * Pure outfit logic of the studio (no React, no fetch): what is worn, undo
 * history, variants of one look, Randomize and the set list. Unit-tested in
 * tests/atlas/transmog.test.ts.
 */

export type Looks = Partial<Record<TransmogSlot, TransmogAppearance>>;
export type Snapshot = { looks: Looks; hidden: TransmogSlot[] };

/** ItemModifiedAppearanceIDs of what is worn, in slot order (the share link). */
export function lookIds(looks: Looks): Partial<Record<TransmogSlot, number>> {
  return Object.fromEntries(transmogSlots.filter((slot) => looks[slot]).map((slot) => [slot, looks[slot]!.modifiedAppearanceId]));
}

/** A set replaces only its own slots. */
export function wearSet(looks: Looks, detail: Pick<TransmogSetDetail, "items">): Looks {
  const next = { ...looks };
  for (const item of detail.items) next[item.slot] = item;
  return next;
}

export function wearLook(looks: Looks, slot: TransmogSlot, look: TransmogAppearance | undefined): Looks {
  const next = { ...looks };
  if (look) next[slot] = look;
  else delete next[slot];
  return next;
}

export function toggleHidden(hidden: TransmogSlot[], slot: TransmogSlot): TransmogSlot[] {
  return hidden.includes(slot) ? hidden.filter((entry) => entry !== slot) : [...hidden, slot];
}

export const HISTORY_LIMIT = 30;
/** Undo stack: newest last, capped. */
export function pushHistory<T>(history: T[], entry: T, limit = HISTORY_LIMIT): T[] {
  return [...history.slice(-(limit - 1)), entry];
}

/**
 * Looks that share a name and an icon are variants of one item (difficulty or
 * colour): the game lists them as one entry with several looks. Same-named
 * items with another icon (a gladiator helm of another class) stay apart.
 * Order is kept, the first look of a group opens it; duplicates are dropped.
 */
export type LookGroup = { key: string; name: string; quality: number; iconName?: string; variants: TransmogAppearance[] };
export function groupVariants(items: TransmogAppearance[]): LookGroup[] {
  const groups = new Map<string, LookGroup>();
  const seen = new Set<number>();
  for (const item of items) {
    if (seen.has(item.appearanceId)) continue;
    seen.add(item.appearanceId);
    const key = `${item.name.trim().toLocaleLowerCase()}|${item.iconName ?? ""}`;
    const group = groups.get(key);
    if (group) {
      group.variants.push(item);
      if (item.quality > group.quality) group.quality = item.quality;
    } else {
      groups.set(key, { key, name: item.name, quality: item.quality, iconName: item.iconName, variants: [item] });
    }
  }
  return [...groups.values()];
}

/** Armor of the outfit: the class's, else what the chest (or most armored slots) wear, else plate. */
export function outfitArmor(cls: TransmogClass | "", looks: Looks): Exclude<ArmorType, "cosmetic"> {
  if (cls) return classArmor[cls];
  const chest = looks.chest?.armor;
  if (chest && chest !== "cosmetic") return chest;
  const counts = new Map<Exclude<ArmorType, "cosmetic">, number>();
  for (const slot of armoredSlots) {
    const armor = looks[slot]?.armor;
    if (armor && armor !== "cosmetic") counts.set(armor, (counts.get(armor) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "plate";
}

/** Slots Randomize dresses; shirt, tabard and weapons stay as they are. */
export const randomSlots: TransmogSlot[] = ["head", "shoulder", "back", "chest", "wrist", "hands", "waist", "legs", "feet"];

/** Paging cursor of the transmog API: base64url of the decimal offset, unpadded. */
export function offsetCursor(offset: number): string {
  const text = String(Math.max(0, Math.floor(offset)));
  const base64 = typeof btoa === "function" ? btoa(text) : Buffer.from(text, "binary").toString("base64");
  return base64.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function randomOffset(total: number, random: () => number = Math.random): number {
  if (total <= 0) return 0;
  return Math.min(total - 1, Math.floor(random() * total));
}

/** Developer placeholders of the game files ("[DNT] …", "[PH] …", "zzOld…") are not sets a player can collect. */
export function playerSet(entry: Pick<TransmogSetSummary, "name">): boolean {
  return !/^\s*(\[(dnt|ph|nyi|test|unused)\]|zz|test\b)/i.test(entry.name);
}
