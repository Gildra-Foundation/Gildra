/** Combat slots accepted by the auction search; order is shared by UI and server. */
export const auctionGearSlots = [
  "HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "WRIST", "HANDS", "WAIST",
  "LEGS", "FEET", "FINGER_1", "FINGER_2", "TRINKET_1", "TRINKET_2", "MAIN_HAND", "OFF_HAND"
] as const;

export type AuctionGearSlot = typeof auctionGearSlots[number];

export function parseAuctionGearSlots(value: unknown): AuctionGearSlot[] {
  if (!Array.isArray(value) || !value.length || value.length > auctionGearSlots.length ||
      value.some(slot => typeof slot !== "string" || !auctionGearSlots.includes(slot as AuctionGearSlot)) ||
      new Set(value).size !== value.length) throw new Error("invalid_equipment_slots");
  return auctionGearSlots.filter(slot => value.includes(slot));
}
