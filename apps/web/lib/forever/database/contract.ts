/** IDs are scoped to edition + build + type. Never redirect a missing record to Retail. */
export const FOREVER_EDITION = "forever" as const;
export const FOREVER_BUILD = "1.60.1.70862" as const;
export function foreverIconUrl(fileId: number | undefined): string | undefined {
  return Number.isSafeInteger(fileId) && fileId! > 0 ? `https://foreverdb.net/icons/${fileId}.webp` : undefined;
}
export const FOREVER_TYPES = ["item", "spell", "npc", "quest", "recipe"] as const;
export type ForeverType = typeof FOREVER_TYPES[number];
export type ForeverLocale = "en" | "ru";
export function isForeverType(value: unknown): value is ForeverType {
  return typeof value === "string" && (FOREVER_TYPES as readonly string[]).includes(value);
}
export function foreverRecordPath(type: ForeverType, id: number, locale: ForeverLocale = "en") {
  if (!isForeverType(type) || !Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid Forever identity");
  return `${locale === "ru" ? "/ru" : ""}/wow/forever/library/${type}/${id}`;
}
export interface ForeverRelation { type: ForeverType; id: number; kind: string; quantity?: number; quantityRange?: [number, number] }
export interface ForeverRecord {
  edition: typeof FOREVER_EDITION; build: string; type: ForeverType; id: number;
  name: { en: string; ru?: string }; icon?: number;
  level?: number; requiredLevel?: number; quality?: number; category?: string; categories?: string[];
  description?: { en: string; ru?: string };
  attributes?: { name: { en: string; ru?: string }; value: number }[];
  slotId?: number;
  locations?: string[];
  effects?: string[];
  facts: Record<string, string | number>;
  relations: ForeverRelation[];
}
export type ForeverSummary = Omit<ForeverRecord, "description" | "facts" | "relations" | "attributes" | "locations" | "effects">;
