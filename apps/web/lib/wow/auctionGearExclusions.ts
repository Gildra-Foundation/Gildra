/** Selection identity for one exact item variant, independent of lot or slot alias. */
export function auctionGearVariantSelectionKey(item: { itemId: number; variantKey: string }): string {
  return JSON.stringify([item.itemId, item.variantKey]);
}
