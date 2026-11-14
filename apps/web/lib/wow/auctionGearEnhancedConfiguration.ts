import type { PricedEnhancementConfiguration } from './auctionGearEnhancementOptimizer';
import type { AuctionGearOption } from './auctionGearTypes';

/** Preserve equipment procurement identity; enhancements have their own aggregate cost. */
export function customizedAuctionGearOptions(options: readonly AuctionGearOption[], config: PricedEnhancementConfiguration): AuctionGearOption[] {
  if (config.status !== 'priced' || !config.fullyEnhanced || config.totalCopper === null) throw new Error('enhancement_configuration_unverified');
  if (new Set(config.slots.map(slot => slot.slotType)).size !== config.slots.length) throw new Error('duplicate_equipment_slot');
  return options.map(option => {
    const slot = config.slots.find(slot => slot.slotType === option.candidate.slotType && slot.variantKey === option.variantKey);
    const metadata = option.candidate.variants.find(v => v.key === option.variantKey)?.resolution?.enhancements;
    if (!slot || metadata?.status !== 'verified') throw new Error('enhancement_configuration_unverified');
    let cursor=0;
    const gemIds=metadata.socketColors.map(color => color ? slot.gemIds[cursor++] : 0);
    if(cursor !== slot.gemIds.length || gemIds.some(id => id === undefined)) throw new Error('invalid_gems_for_slot');
    while(gemIds.length && gemIds.at(-1) === 0) gemIds.pop();
    return { ...option, customization: { ...(slot.enchantId ? {enchantId:slot.enchantId}:{}), ...(gemIds.length ? {gemIds}: {}) } };
  });
}
