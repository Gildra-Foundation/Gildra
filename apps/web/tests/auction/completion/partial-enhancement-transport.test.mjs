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

test('the shopping recommendation respects the independently measured value winner', async () => {
  const { auctionGearResults, recommendedAuctionGearResult } = await import('../../../lib/wow/auctionGearResult.ts');
  const comparison = (gain) => ({candidateDps: 1000 + gain, deltaDps: gain, uncertainty: {significant: true}});
  const ring = {slotType: 'FINGER_1', auctionId: 1, itemId: 1, variantKey: 'ring'};
  const assembly = {purchases: [ring], spentCopper: 200, budgetCopper: 400, comparison: comparison(100), removedSlots: [],
    enhancementMode: 'enhanced', enhancementOptimization: {traversal: 'exhaustive', complete: true, verifiedValueKey: 'one-ring',
      recommendations: [{configuration: {key: 'one-ring', status: 'priced', itemsCopper: 100, totalCopper: 101,
        consumables: [{kind: 'gem', quotedCopper: 1}]}, purchases: [{...ring, auctionId: 2}], comparison: comparison(45)}]}};
  const selected = () => recommendedAuctionGearResult(auctionGearResults(assembly), 'value');
  assert.equal(selected().totalCopper, 101);
  assembly.enhancementOptimization.complete = false;
  assert.equal(selected().totalCopper, 200);
});

test('an early significant bare gain cannot replace a completed independent zero-upgrade result', async () => {
  const { auctionGearResults, recommendedAuctionGearResult, auctionGearLoadoutComparison } = await import('../../../lib/wow/auctionGearResult.ts');
  const checked={deltaDps:0,candidateDps:1000,uncertainty:{significant:false}};
  const noisy={deltaDps:18,candidateDps:1018,uncertainty:{significant:true}};
  const assembly={purchases:[{slotType:'HEAD',itemId:1,auctionId:2,variantKey:'early'}],spentCopper:200,budgetCopper:500,
    comparison:noisy,removedSlots:[],enhancementMode:'enhanced',enhancementOptimization:{traversal:'exhaustive',complete:true,
      verifiedObjectives:{dps:'baseline',value:'baseline'},recommendations:[{configuration:{key:'baseline',status:'priced',
        itemsCopper:0,totalCopper:0,consumables:[]},purchases:[],comparison:checked}]}};
  const results=auctionGearResults(assembly);
  for(const objective of ['dps','value']) {
    const winner=recommendedAuctionGearResult(results,objective);
    assert.deepEqual(winner.purchases,[]);
    assert.equal(winner.totalCopper,0);
    assert.equal(winner.significant,false);
  }
  assert.equal(auctionGearLoadoutComparison(results),null);
  assembly.enhancementOptimization.complete=false;
  assert.equal(recommendedAuctionGearResult(auctionGearResults(assembly),'dps').totalCopper,200);
});
