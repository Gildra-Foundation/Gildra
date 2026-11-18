import type { OwnedAuctionGearChange, PricedEnhancementConfiguration } from './auctionGearEnhancementOptimizer';
import type { AuctionGearOption } from './auctionGearTypes';

/** Preserve equipment procurement identity; enhancements have their own aggregate cost. */
export function customizedAuctionGearOptions(options: readonly AuctionGearOption[], config: PricedEnhancementConfiguration): AuctionGearOption[] {
  if (config.status !== 'priced' || config.totalCopper === null || !Number.isSafeInteger(config.totalCopper) || config.totalCopper < config.itemsCopper) throw new Error('enhancement_configuration_unverified');
  if (new Set(config.slots.map(slot => slot.slotType)).size !== config.slots.length) throw new Error('duplicate_equipment_slot');
  return options.map(option => {
    const slot = config.slots.find(slot => slot.slotType === option.candidate.slotType && slot.variantKey === option.variantKey);
    const metadata = option.candidate.variants.find(v => v.key === option.variantKey)?.resolution?.enhancements;
    if (!slot || metadata?.status !== 'verified') throw new Error('enhancement_configuration_unverified');
    let cursor=0;
    const gemIds=metadata.socketColors.map(color => color ? slot.gemIds[cursor++] : 0);
    if(cursor !== slot.gemIds.length || gemIds.some(id => !Number.isSafeInteger(id) || id < 0)) throw new Error('invalid_gems_for_slot');
    while(gemIds.length && gemIds.at(-1) === 0) gemIds.pop();
    return { ...option, customization: { ...(slot.enchantId ? {enchantId:slot.enchantId}:{}), ...(gemIds.length ? {gemIds}: {}) } };
  });
}

export function ownedAuctionGearChanges(config: PricedEnhancementConfiguration): readonly OwnedAuctionGearChange[] {
  return config.ownedChanges ?? [];
}

/** Patch the same local_json instance that native SimC uses for its baseline.
 * In particular, never recreate crafted stats, drop level or item bonuses. */
export function applyOwnedAuctionGearChanges(equipment: Record<string, unknown>, changes: readonly OwnedAuctionGearChange[]) {
  if (!changes.length) return equipment;
  const pending = new Map(changes.map(change => [change.slotType, change]));
  if (pending.size !== changes.length || !Array.isArray(equipment.equipped_items)) throw new Error('enhancement_configuration_unverified');
  const equipped = equipment.equipped_items.map(item => {
    const change = pending.get(item.slot?.type);
    if (!change) return item;
    if (item.item?.id !== change.itemId) throw new Error('enhancement_configuration_unverified');
    pending.delete(change.slotType);
    const updated = { ...item };
    if (change.enchantId) {
      const enhancements: Record<string, unknown>[] = (item.enchantments ?? []).filter((row: {enchantment_slot?:{id?:number}}) => Number(row.enchantment_slot?.id ?? 0) !== 0);
      updated.enchantments = [...enhancements, { enchantment_id:change.enchantId, enchantment_slot:{id:0,type:'PERMANENT'} }];
    }
    if (change.gems.length) {
      const sockets = Array.isArray(item.sockets) ? [...item.sockets] : [];
      for (const gem of change.gems) {
        if (!sockets[gem.index] || sockets[gem.index].socket_type?.type !== 'PRISMATIC') throw new Error('invalid_gems_for_slot');
        // Gem bonuses and links describe the previous stone, not its socket.
        sockets[gem.index] = {socket_type:sockets[gem.index].socket_type, item:{id:gem.itemId}};
      }
      updated.sockets = sockets;
    }
    return updated;
  });
  if (pending.size) throw new Error('enhancement_configuration_unverified');
  return { ...equipment, equipped_items:equipped };
}
