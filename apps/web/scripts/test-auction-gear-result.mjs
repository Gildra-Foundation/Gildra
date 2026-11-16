/** All prices, gear and simulations here are isolated synthetic fixtures. */
import assert from 'node:assert/strict';
import { auctionGearResults, recommendedAuctionGearResult, auctionGearResultMatchesIntent } from '../lib/wow/auctionGearResult.ts';
const comparison = (gain, significant = true) => ({baselineDps:1000,candidateDps:1000+gain,deltaDps:gain,deltaPercent:gain/10,uncertainty:{significant,marginDps:5}});
const purchase = id => ({auctionId:id,itemId:id,name:`Synthetic ${id}`,slotType:'HEAD',variantKey:'exact',itemLevel:1,lotCostCopper:100,quantity:1});
const enhanced = (key,gain,itemsCopper,gemsCopper,extra={}) => ({label:key,configuration:{key,slots:[],consumables:[{itemId:10,kind:'gem',quantity:2,quotedCopper:gemsCopper}],itemsCopper,totalCopper:gemsCopper===null?null:itemsCopper+gemsCopper,fullyEnhanced:true,status:'priced',...extra},comparison:comparison(gain),purchases:[purchase(Number(key))],consumableNames:{}});
const assembly = {budgetCopper:1000,purchases:[purchase(1)],spentCopper:100,remainingCopper:900,comparison:comparison(40),removedSlots:[],bestConfirmed:null,enhancementOptimization:{recommendations:[enhanced('2',60,200,100),enhanced('3',100,500,300)]}};
let results = auctionGearResults(assembly);
let recommended = recommendedAuctionGearResult(results,'value');
assert.equal(recommended.key,'enhanced:2');assert.equal(recommended.totalCopper,300);assert.equal(recommended.remainingCopper,700);assert.equal(recommended.comparison.deltaDps,60);assert.equal(recommended.purchases[0].auctionId,2);assert.equal(recommended.gemsCopper,100);assert.equal(recommended.enchantsCopper,0);
assert.equal(recommendedAuctionGearResult(results,'dps').key,'enhanced:3');
assert.equal(results[0].totalCopper,null);assert.equal(results[0].remainingCopper,null);
results=auctionGearResults({...assembly,bestConfirmed:{...assembly,spentCopper:80,purchases:[purchase(4)],comparison:comparison(20)}});
assert.equal(results.length,4);assert.equal(results[0].purchases[0].auctionId,4);assert.equal(results[0].itemsCopper,80);
for(const extra of [{status:'price_unknown'},{totalCopper:2000},{totalCopper:999},{status:'market_unverified'}]) {
 const candidate=auctionGearResults({...assembly,enhancementOptimization:{recommendations:[enhanced('5',200,100,20,extra)]}}).at(-1);
 assert.equal(candidate.totalCopper,null);assert.equal(candidate.remainingCopper,null);
}
results=auctionGearResults({...assembly,enhancementOptimization:{recommendations:[enhanced('5',200,100,null)]}});assert.equal(results.at(-1).gemsCopper,null);assert.equal(results.at(-1).totalCopper,null);
results=auctionGearResults({...assembly,enhancementOptimization:{recommendations:[enhanced('5',200,100,20,{fullyEnhanced:false}),enhanced('6',50,100,100)]}});assert.equal(recommendedAuctionGearResult(results,'dps').key,'enhanced:5');
// A priced partial configuration competes on the actual objective, never on slot completion.
assert.equal(recommendedAuctionGearResult(results,'value').key,'enhanced:5');
results=auctionGearResults({...assembly,enhancementOptimization:{recommendations:[enhanced('5',200,700,200,{fullyEnhanced:false}),enhanced('6',50,50,50)]}});
assert.equal(recommendedAuctionGearResult(results,'dps').key,'enhanced:5');
assert.equal(recommendedAuctionGearResult(results,'value').key,'enhanced:6');
// Full enhancements break a tie only after objective scores and DPS are equal.
results=auctionGearResults({...assembly,enhancementOptimization:{recommendations:[enhanced('5',50,50,50,{fullyEnhanced:false}),enhanced('6',50,50,50)]}});
for(const objective of ['value','dps']) assert.equal(recommendedAuctionGearResult(results,objective).key,'enhanced:6');
const noGain=auctionGearResults({...assembly,comparison:comparison(1,false),enhancementOptimization:undefined});assert.equal(recommendedAuctionGearResult(noGain,'value').significant,false);
// Quick equipment-only plans retain the chosen value objective without claiming
// that missing enhancement prices are zero or that the full budget is verified.
const quick=auctionGearResults({...assembly,spentCopper:900,comparison:comparison(100),
  bestConfirmed:{purchases:[purchase(4)],spentCopper:100,comparison:comparison(50),removedSlots:[]},
  enhancementOptimization:{recommendations:[enhanced('7',500,100,null)]}});
const quickValue=recommendedAuctionGearResult(quick,'value');
assert.equal(quickValue.purchases[0].auctionId,4);
assert.equal(quickValue.totalCopper,null);assert.equal(quickValue.remainingCopper,null);
assert.equal(recommendedAuctionGearResult(quick.filter(r=>r.kind==='items'),'dps').purchases[0].auctionId,1);
const intent={budgetGold:'1',objective:'value',selectedSlots:['HEAD','NECK'],scenario:'single-target'};
const recovered={budgetCopper:10000,objective:'value',selectedSlots:['NECK','HEAD'],scenario:'single-target',fightLengthSeconds:120,targets:1};
assert(auctionGearResultMatchesIntent(intent,recovered));assert(!auctionGearResultMatchesIntent(intent,{...recovered,objective:'dps'}));assert(!auctionGearResultMatchesIntent(intent,{...recovered,objective:undefined}));assert(auctionGearResultMatchesIntent({...intent,objective:'dps'},{...recovered,objective:undefined}));assert(!auctionGearResultMatchesIntent(intent,{...recovered,budgetCopper:20000}));assert(!auctionGearResultMatchesIntent(intent,{...recovered,selectedSlots:['HEAD']}));assert(!auctionGearResultMatchesIntent(intent,{...recovered,targets:2}));
console.log('Auction selected-result cost, objective, uncertainty and recovery contracts passed.');
