import assert from 'node:assert/strict';
import test from 'node:test';
import { customizedAuctionGearOptions } from '../../../lib/wow/auctionGearEnhancedConfiguration.ts';

const option = { variantKey: 'auction-head', candidate: { slotType: 'HEAD',
  variants: [{ key: 'auction-head', resolution: { enhancements: { status: 'verified', socketColors: [1, 0, 2] } } }] } };
const config = { status: 'priced', fullyEnhanced: false, totalCopper: 120, itemsCopper: 100,
  slots: [{ slotType: 'HEAD', variantKey: option.variantKey, gemIds: [0, 240967], enchantId: 0 }] };

test('a budgeted partial configuration keeps the native position of a later gem', () => {
  assert.deepEqual(customizedAuctionGearOptions([option], config)[0].customization, { gemIds: [0, 0, 240967] });
  assert.deepEqual(customizedAuctionGearOptions([option], { ...config, slots: [{ ...config.slots[0],
    gemIds: [0, 0], enchantId: 7961 }] })[0].customization, { enchantId: 7961 });
  assert.throws(() => customizedAuctionGearOptions([option], { ...config, status: 'price_unknown' }), /unverified/);
});

test('exact search compares a verified gear-only purchase at its actual price with the gemmed build', async () => {
  const { auctionGearResults, recommendedAuctionGearResult } = await import('../../../lib/wow/auctionGearResult.ts');
  const comparison = gain => ({ candidateDps: 1000 + gain, deltaDps: gain, uncertainty: { significant: true } });
  const purchase = { slotType: 'HEAD', auctionId: 1, itemId: 1, variantKey: 'bare' };
  const bare = { purchases: [purchase], comparison: comparison(90), spentCopper: 100, removedSlots: [] };
  const enhanced = { configuration: { key: 'gemmed', status: 'priced', fullyEnhanced: false, itemsCopper: 80,
    totalCopper: 85, consumables: [{ kind: 'gem', quotedCopper: 5 }] },
    purchases: [{ ...purchase, auctionId: 2 }], comparison: comparison(80), removedSlots: ['OFF_HAND'] };
  const results = auctionGearResults({ ...bare, enhancementMode: 'enhanced', budgetCopper: 100,
    enhancementOptimization: { traversal: 'exhaustive', recommendations: [enhanced] } });
  assert.equal(recommendedAuctionGearResult(results, 'dps').totalCopper, 100);
  assert.deepEqual(recommendedAuctionGearResult(results, 'value').removedSlots, ['OFF_HAND']);
});
