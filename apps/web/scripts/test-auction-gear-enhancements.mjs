// SYNTHETIC ONLY: algorithm/transport contracts, never live catalog or DPS evidence.
import assert from 'node:assert/strict';
import { optimizeAuctionGearEnhancements } from '../lib/wow/auctionGearEnhancementOptimizer.ts';
const gem = {key:'gem',kind:'gem',consumableItemId:100,simulationId:100};
const enchant = {key:'enchant',kind:'enchant',consumableItemId:200,simulationId:900};
const slot = {slotType:'HEAD',variantKey:'exact-bonus-1',metadataKey:'rules-1',owned:false,sockets:[{key:'a',type:'prismatic'},{key:'b',type:'prismatic'}]};
const now = Date.now();
const calls=[];
const base = {slots:[slot],catalog:{version:'synthetic-v1',complete:false,resolve:()=>({verified:true,enchantApplicable:true,enchantChoices:[enchant],gemChoices:{a:[gem],b:[gem]}})},
 character:{},prices:{sourceUpdatedAt:new Date(now).toISOString(),prices:{100:{ladder:[[10,1],[20,2]]},200:{ladder:[[40,1]]}}},itemsCopper:50,budgetCopper:120,
 simulationIdentity:'profile/engine/scenario',signal:new AbortController().signal,limits:{simulations:12},now,
 simulate:async c=>{calls.push(c);return {dps:1234,dpsError:1,confidence:95,iterations:100,engine:'SimulationCraft synthetic'};}};
let result=await optimizeAuctionGearEnhancements(base);
assert.equal(result.complete,true);assert.equal(calls.length,1);assert.equal(result.catalogComplete,false);
assert.deepEqual(calls[0].slots,[{slotType:'HEAD',variantKey:'exact-bonus-1',enchantId:900,gemIds:[100,100]}]);
assert.equal(calls[0].totalCopper,120);assert.equal(calls[0].fullyEnhanced,true);
assert.deepEqual(calls[0].consumables.map(({itemId,quantity,quotedCopper})=>({itemId,quantity,quotedCopper})),[{itemId:100,quantity:2,quotedCopper:30},{itemId:200,quantity:1,quotedCopper:40}]);
assert(result.configurations.some(c=>!c.fullyEnhanced));
for (const override of [{budgetCopper:119},{prices:{...base.prices,prices:{100:{ladder:[[10,1]]},200:{ladder:[[40,1]]}}}},{prices:{...base.prices,sourceUpdatedAt:null}},{prices:{...base.prices,sourceUpdatedAt:new Date(now-3*3600000).toISOString()}}]) {
 calls.length=0; const r=await optimizeAuctionGearEnhancements({...base,...override});assert.equal(calls.length,0);assert.equal(r.finalists.length,0);
}
const limitedGem={...gem,category:{id:'unique-gem',limit:1}};
calls.length=0;
await optimizeAuctionGearEnhancements({...base,catalog:{...base.catalog,resolve:()=>({verified:true,enchantApplicable:true,enchantChoices:[enchant],gemChoices:{a:[limitedGem],b:[limitedGem]}})}});
assert.equal(calls.length,0);
const professionGem={...gem,profession:{id:755,rank:50}};
const professional={...base,catalog:{...base.catalog,resolve:()=>({verified:true,enchantApplicable:true,enchantChoices:[enchant],gemChoices:{a:[professionGem],b:[professionGem]}})}};
assert.equal((await optimizeAuctionGearEnhancements(professional)).finalists.length,0);
assert.equal((await optimizeAuctionGearEnhancements({...professional,character:{professions:{755:50}}})).finalists.length,1);
const owned={...slot,owned:true,installed:{enchant,gems:[gem,gem]}};
result=await optimizeAuctionGearEnhancements({...base,slots:[owned],prices:{...base.prices,prices:{}},budgetCopper:50});
assert.equal(result.finalists[0].configuration.totalCopper,50);assert.deepEqual(result.finalists[0].configuration.consumables,[]);
assert.equal(result.visited,1);
const retainedOther={...owned,slotType:'CHEST',installed:{enchant,gems:[limitedGem,gem]}};
assert.equal((await optimizeAuctionGearEnhancements({...base,slots:[retainedOther,{...owned,installed:{enchant,gems:[limitedGem,gem]}}]})).finalists.length,0);
calls.length=0;
result=await optimizeAuctionGearEnhancements({...base,limits:{configurations:2}});
assert.equal(result.complete,false);assert(result.visited<=2);
while(!result.complete) result=await optimizeAuctionGearEnhancements({...base,limits:{configurations:2},checkpoint:result.checkpoint});
assert.equal(calls.length,1);assert.equal(result.finalists.length,1);
const resumed=await optimizeAuctionGearEnhancements({...base,checkpoint:result.checkpoint});assert.equal(resumed.simulations,0);assert.equal(calls.length,1);
await assert.rejects(()=>optimizeAuctionGearEnhancements({...base,simulationIdentity:'different-scenario',checkpoint:result.checkpoint}),/checkpoint_changed/);
const yielded=await optimizeAuctionGearEnhancements({...base,shouldYield:()=>true});assert.equal(yielded.visited,0);assert.equal(yielded.complete,false);
const unknown=await optimizeAuctionGearEnhancements({...base,catalog:{...base.catalog,resolve:()=>({verified:false,reason:'unknown_rules'})}});assert(unknown.reasons.includes('unknown_rules'));assert.equal(unknown.finalists.length,0);
console.log('Synthetic enhancement contracts passed: whole-set quantities/budget, unknown/stale prices, categories, professions, retained equipment, exact simulation, bounded resume/cache.');
const twoGems = [{...gem,key:'a'}, {...gem,key:'b',consumableItemId:101,simulationId:101}];
const synergyCalls=[];
const synergy = {...base, catalog:{...base.catalog,resolve:()=>({verified:true,enchantApplicable:false,enchantChoices:[],gemChoices:{a:twoGems,b:twoGems}})},
 prices:{...base.prices,prices:{100:{ladder:[[10,10]]},101:{ladder:[[20,10]]}}},
 simulate:async c=>{synergyCalls.push(c);return {dps:c.slots[0].gemIds[0]===101 && c.slots[0].gemIds[1]===100 ? 2000 : 1000,dpsError:1,confidence:95,iterations:100,engine:'SimulationCraft synthetic'};}};
const synergistic=await optimizeAuctionGearEnhancements(synergy);
assert.equal(synergyCalls.length,4);
assert.deepEqual(synergistic.finalists[0].configuration.slots[0].gemIds,[101,100]);
const staleResume=await optimizeAuctionGearEnhancements({...synergy,checkpoint:synergistic.checkpoint,now:now+3*3600000});
assert.equal(staleResume.finalists.length,0);
const retainedProfession=await optimizeAuctionGearEnhancements({...base,slots:[{...owned,installed:{enchant,gems:[professionGem,gem]}}]});
assert.equal(retainedProfession.finalists.length,0);
const ownedChange=await optimizeAuctionGearEnhancements({...synergy,slots:[{...slot,owned:true,allowOwnedChanges:true,installed:{gems:[gem,gem]}}]});
assert.equal(ownedChange.finalists[0].configuration.consumables[0].itemId,101);
assert.equal(ownedChange.finalists[0].configuration.consumables[0].quantity,1);
assert.equal(ownedChange.finalists[0].configuration.totalCopper,70);
// Full choices must precede the exponential set of bare combinations.
const manySlots=Array.from({length:16},(_,i)=>({...slot,slotType:`SLOT_${i}`}));
const firstFull=await optimizeAuctionGearEnhancements({...base,slots:manySlots,prices:{...base.prices,prices:{100:{ladder:[[1,100]]},200:{ladder:[[1,100]]}}},budgetCopper:1000,limits:{configurations:1,simulations:1}});
assert.equal(firstFull.simulations,1);assert.equal(firstFull.finalists[0].configuration.fullyEnhanced,true);
const ownedEmpty={...slot,slotType:'OWNED',owned:true,installed:{gems:[null,null]}};
const withEmptyOwned=await optimizeAuctionGearEnhancements({...base,slots:[slot,ownedEmpty],limits:{configurations:1}});
assert.equal(withEmptyOwned.simulations,1);
assert.deepEqual(withEmptyOwned.finalists[0].configuration.slots.find(s=>s.slotType==='OWNED').gemIds,[0,0]);
const repriced=await optimizeAuctionGearEnhancements({...base,prices:{...base.prices,prices:{100:{ladder:[[5,100]]},200:{ladder:[[5,100]]}}},simulationCache:firstFull.checkpoint.cache,limits:{configurations:1}});
assert.equal(repriced.finalists[0].configuration.totalCopper,65);
const cached=await optimizeAuctionGearEnhancements({...base,simulationCache:repriced.checkpoint.cache,limits:{configurations:1}});
assert.equal(cached.simulations,0);assert.equal(cached.finalists[0].configuration.totalCopper,120);
const valueResult=await optimizeAuctionGearEnhancements({...synergy,objective:'value',baselineDps:1000});
assert.deepEqual(valueResult.finalists[0].configuration.slots[0].gemIds,[101,100]);
await assert.rejects(()=>optimizeAuctionGearEnhancements({...base,objective:'value'}),/invalid_enhancement_input/);
const rankBase={...base,slots:[{...slot,sockets:[{key:'a',type:'prismatic'}]}],budgetCopper:1000,
 catalog:{...base.catalog,resolve:()=>({verified:true,enchantApplicable:false,enchantChoices:[],gemChoices:{a:twoGems}})},
 prices:{...base.prices,prices:{100:{ladder:[[10,10]]},101:{ladder:[[100,10]]}}},
 simulate:async c=>({dps:c.slots[0].gemIds[0]===100?1010:1020,dpsError:1,confidence:95,iterations:100,engine:'SimulationCraft synthetic'})};
assert.equal((await optimizeAuctionGearEnhancements(rankBase)).finalists[0].configuration.slots[0].gemIds[0],101);
assert.equal((await optimizeAuctionGearEnhancements({...rankBase,objective:'value',baselineDps:1000})).finalists[0].configuration.slots[0].gemIds[0],100);
const largeOptions=Array.from({length:20},(_,i)=>({...gem,key:`gem-${String(i).padStart(2,'0')}`,simulationId:100+i,consumableItemId:100+i}));
const capped=await optimizeAuctionGearEnhancements({...rankBase,catalog:{...base.catalog,resolve:()=>({verified:true,enchantApplicable:false,enchantChoices:[],gemChoices:{a:largeOptions}})},
 prices:{...base.prices,prices:Object.fromEntries(largeOptions.map(g=>[g.consumableItemId,{ladder:[[1,100]]}]))}});
assert.equal(capped.simulations,12);assert.equal(capped.complete,true);assert.equal(capped.searchLimited,true);assert(capped.reasons.includes('configuration_limit'));
console.log('Synthetic continuation/cache/objective integration contracts passed.');
// Installed enchant effect known, its consumable mapping unknown: preserve, never purchase ID zero.
const retainedOnlyEnchant={...enchant,consumableItemId:0};
const retainedOnly=await optimizeAuctionGearEnhancements({...base,slots:[{...owned,installed:{enchant:retainedOnlyEnchant,gems:[gem,gem]}}],prices:{...base.prices,prices:{}}});
assert.equal(retainedOnly.finalists[0].configuration.slots[0].enchantId,900);
assert.deepEqual(retainedOnly.finalists[0].configuration.consumables,[]);
assert.equal(retainedOnly.finalists[0].configuration.totalCopper,50);
await assert.rejects(()=>optimizeAuctionGearEnhancements({...base,catalog:{...base.catalog,resolve:()=>({verified:true,enchantApplicable:true,enchantChoices:[retainedOnlyEnchant],gemChoices:{a:[gem],b:[gem]}})}}),/invalid_enhancement_catalog/);
const typedQuotes=await optimizeAuctionGearEnhancements({...base,limits:{configurations:1}});
assert.deepEqual(typedQuotes.finalists[0].configuration.consumables.map(c=>[c.itemId,c.kind]),[[100,'gem'],[200,'enchant']]);
const preservedWithPurchases=await optimizeAuctionGearEnhancements({...base,slots:[slot,{...owned,slotType:'OWNED',installed:{enchant:retainedOnlyEnchant,gems:[gem,gem]}}],limits:{configurations:1}});
assert.deepEqual(preservedWithPurchases.finalists[0].configuration.consumables.map(c=>c.itemId),[100,200]);
console.log('Retained-only mapping and consumable-kind contracts passed.');
const uniqueGem={...gem,uniqueEquipped:true,category:{id:'shared',limit:3}};
const uniqueCatalog={...base.catalog,resolve:()=>({verified:true,enchantApplicable:true,enchantChoices:[enchant],gemChoices:{a:[uniqueGem],b:[uniqueGem]}})};
assert.equal((await optimizeAuctionGearEnhancements({...base,catalog:uniqueCatalog})).finalists.length,0);
// Either occurrence may carry the unique flag; order must not bypass it.
for (const gems of [[gem,uniqueGem],[uniqueGem,gem]]) {
 const r=await optimizeAuctionGearEnhancements({...base,slots:[{...owned,installed:{enchant,gems}}]});
 assert.equal(r.finalists.length,0);
}
// Cross-slot retained/new conflict, independent of the more permissive category cap.
const retainedUnique={...owned,slotType:'OWNED',installed:{enchant,gems:[uniqueGem,null]}};
assert.equal((await optimizeAuctionGearEnhancements({...base,slots:[{...slot,sockets:[slot.sockets[0]]},retainedUnique],catalog:uniqueCatalog})).finalists.length,0);
const uniqueEnchant={...enchant,consumableItemId:0,uniqueEquipped:true};
const retainedEnchantSlots=['HEAD','CHEST'].map(slotType=>({...owned,slotType,installed:{enchant:uniqueEnchant,gems:[gem,gem]}}));
assert.equal((await optimizeAuctionGearEnhancements({...base,slots:retainedEnchantSlots})).finalists.length,0);
// A gem and enchant with equal numeric IDs have distinct uniqueness identities.
const sameNumericId={...uniqueEnchant,simulationId:gem.simulationId};
const separateKinds=await optimizeAuctionGearEnhancements({...base,slots:[{...owned,installed:{enchant:sameNumericId,gems:[uniqueGem,null]}}]});
assert.equal(separateKinds.finalists.length,1);
console.log('Unique-equipped identity plus category contracts passed.');
// Review reproducer: 75 synthetic choices, three sockets, cheapest ordered ID absent.
// IDs resemble source records; all prices/availability/DPS here are synthetic only.
const reviewGems=Array.from({length:75},(_,i)=>({key:`review-${i.toString().padStart(3,'0')}`,kind:'gem',consumableItemId:240855+i,simulationId:240855+i}));
const reviewEnchant={key:'review-enchant',kind:'enchant',consumableItemId:240094,simulationId:9001};
const reviewSlot={...slot,slotType:'LEGS',sockets:['a','b','c'].map(key=>({key,type:'14'}))};
const reviewPrices={...base.prices,prices:Object.fromEntries([...reviewGems.slice(1).map(g=>[g.consumableItemId,{ladder:[[1,100]]}]),[240094,{ladder:[[1,100]]}]])};
const reviewInput={...base,slots:[reviewSlot],itemsCopper:1,budgetCopper:100,prices:reviewPrices,limits:{configurations:128,simulations:1},
 catalog:{...base.catalog,resolve:()=>({verified:true,enchantApplicable:true,enchantChoices:[reviewEnchant],gemChoices:{a:reviewGems,b:reviewGems,c:reviewGems}})}};
const reviewResult=await optimizeAuctionGearEnhancements(reviewInput);
assert.equal(reviewResult.simulations,1);assert.equal(reviewResult.visited,1);
assert.deepEqual(reviewResult.finalists[0].configuration.slots[0].gemIds,[240856,240856,240856]);
assert.equal(reviewResult.finalists[0].configuration.totalCopper,5);
assert(reviewResult.reasons.includes('price_unknown_or_insufficient_quantity'));
// Almost all choices share a unique category. Suffix pruning must jump invalid Cartesian blocks.
const conflictedGems=reviewGems.map((g,i)=>i===74 ? g : {...g,category:{id:'review-shared',limit:1}});
const conflictInput={...reviewInput,catalog:{...base.catalog,resolve:()=>({verified:true,enchantApplicable:true,enchantChoices:[reviewEnchant],gemChoices:{a:conflictedGems,b:conflictedGems,c:conflictedGems}})}};
let pruned=await optimizeAuctionGearEnhancements(conflictInput), turns=1;
while(!pruned.finalists.length && !pruned.complete && turns<4) {pruned=await optimizeAuctionGearEnhancements({...conflictInput,checkpoint:pruned.checkpoint});turns++;}
assert.equal(pruned.finalists.length,1);assert(turns<=2);assert(pruned.checkpoint.traversalSteps<256);
assert(pruned.checkpoint.nextConfiguration>4096,'Skipped Cartesian ordinals do not consume traversal budget');
assert.equal(pruned.finalists[0].configuration.slots[0].gemIds.filter(id=>id!==240929).length,1);
assert.equal(pruned.finalists[0].configuration.totalCopper,5);
// Repeated gems cannot reuse a single unit: find an affordable mixed configuration instead.
const scarceInput={...reviewInput,prices:{...reviewPrices,prices:{...reviewPrices.prices,240856:{ladder:[[1,1]]}}}};
const scarce=await optimizeAuctionGearEnhancements(scarceInput);
assert.equal(scarce.finalists.length,1);
assert.equal(scarce.finalists[0].configuration.slots[0].gemIds.filter(id=>id===240856).length,1);
assert.equal(scarce.finalists[0].configuration.totalCopper,5);
const cachedPruned=await optimizeAuctionGearEnhancements({...conflictInput,simulationCache:pruned.checkpoint.cache,limits:{configurations:1024,simulations:1}});
assert(cachedPruned.finalists.some(f=>f.configuration.key===pruned.finalists[0].configuration.key));
console.log(`Price-aware/pruned review cases passed: missing-first visited=${reviewResult.visited}, category-conflict steps=${pruned.checkpoint.traversalSteps}, continuation turns=${turns}.`);
// Distinct consumables with the same native enchant must not let an unavailable first mapping hide a priced alternative.
const alternateEnchant={...reviewEnchant,key:'z-priced',consumableItemId:240095};
const aliasInput={...reviewInput,prices:{...reviewPrices,prices:{...reviewPrices.prices,240094:{ladder:[]},240095:{ladder:[[1,100]]}}},
 catalog:{...reviewInput.catalog,resolve:()=>({verified:true,enchantApplicable:true,enchantChoices:[reviewEnchant,alternateEnchant],gemChoices:{a:reviewGems,b:reviewGems,c:reviewGems}})}};
assert.equal((await optimizeAuctionGearEnhancements(aliasInput)).finalists[0].configuration.consumables.find(c=>c.kind==='enchant').itemId,240095);
// A large enchant axis must not monopolize the twelve native evaluations.
const ringEnchants=Array.from({length:18},(_,i)=>({...enchant,key:`ring-enchant-${String(i).padStart(2,'0')}`,consumableItemId:3000+i,simulationId:4000+i}));
const ringGems=[{...gem,key:'cheap',consumableItemId:5000,simulationId:5000},{...gem,key:'strong',consumableItemId:5001,simulationId:5001}];
const diversifiedCalls=[];
const ringInput={...base,slots:[{...slot,slotType:'FINGER_1',sockets:[{key:'a',type:'14'}]}],itemsCopper:1,budgetCopper:1000,limits:{simulations:1},
 prices:{...base.prices,prices:Object.fromEntries([...ringEnchants.map((e,i)=>[e.consumableItemId,{ladder:[[i+1,100]]}]),[5000,{ladder:[[1,100]]}],[5001,{ladder:[[10,100]]}]])},
 catalog:{...base.catalog,resolve:()=>({verified:true,enchantApplicable:true,enchantChoices:ringEnchants,gemChoices:{a:ringGems}})},
 simulate:async c=>{diversifiedCalls.push(c);return {dps:c.slots.some(s=>s.gemIds.includes(5001))?2000:1000,dpsError:1,confidence:95,iterations:100,engine:'SimulationCraft synthetic'};}};
let diversified=await optimizeAuctionGearEnhancements(ringInput), diverseTurns=1;
while(!diversified.complete && diverseTurns<30) { diversified=await optimizeAuctionGearEnhancements({...ringInput,checkpoint:JSON.parse(JSON.stringify(diversified.checkpoint))});diverseTurns++; }
assert.equal(diversified.complete,true);assert.equal(diversifiedCalls.length,12);
assert(diversifiedCalls.slice(0,4).some(c=>c.slots[0].gemIds[0]===5001));
assert.equal(diversified.finalists[0].configuration.slots[0].gemIds[0],5001);
assert.equal(new Set(diversifiedCalls.map(c=>c.key)).size,diversifiedCalls.length,'Seed/radix overlaps must reuse cache');
const allAtOnceCalls=[];
const allAtOnce=await optimizeAuctionGearEnhancements({...ringInput,limits:{simulations:12},simulate:async c=>{allAtOnceCalls.push(c.key);return ringInput.simulate(c);}});
assert.deepEqual(allAtOnceCalls,diversifiedCalls.slice(0,12).map(c=>c.key),'Persisted seeds must preserve evaluation ordering');
assert.equal(allAtOnce.finalists[0].configuration.key,diversified.finalists[0].configuration.key);
// More axes than native budget: stratification/global seeds must still touch the final equipment slot.
const laterCalls=[];
const laterInput={...ringInput,slots:Array.from({length:16},(_,i)=>({...ringInput.slots[0],slotType:`SLOT_${String(i).padStart(2,'0')}`})),limits:{simulations:12},
 simulate:async c=>{laterCalls.push(c);return {dps:c.slots.at(-1).gemIds[0]===5001?3000:1000,dpsError:1,confidence:95,iterations:100,engine:'SimulationCraft synthetic'};}};
const later=await optimizeAuctionGearEnhancements(laterInput);
assert(laterCalls.length<=12);assert(laterCalls.some(c=>c.slots.at(-1).gemIds[0]===5001));
assert.equal(later.finalists[0].configuration.slots.at(-1).gemIds[0],5001);
assert(later.searchLimited);
console.log(`Diversified bounded seeds passed: 18 enchants/2 gems, ${diverseTurns} checkpoint turns, late-axis coverage, cache deduplication.`);
// Preserve a lower-mean confirmed upgrade independently of the mean-ranked shortlist.
const incumbentChoices=Array.from({length:5},(_,i)=>({...gem,key:`incumbent-${i}`,consumableItemId:6000+i,simulationId:6000+i}));
const preciseBaseline={dps:100.125,dpsError:1,confidence:95,iterations:100,engine:'SimulationCraft synthetic'};
const incumbentInput={...rankBase,baseline:preciseBaseline,limits:{simulations:1,finalists:3},
 catalog:{...base.catalog,resolve:()=>({verified:true,enchantApplicable:false,enchantChoices:[],gemChoices:{a:incumbentChoices}})},
 prices:{...base.prices,prices:Object.fromEntries(incumbentChoices.map(g=>[g.consumableItemId,{ladder:[[1,100]]}]))},
 simulate:async c=>({dps:c.slots[0].gemIds[0]===6000?115.125:120.125+c.slots[0].gemIds[0]-6001,dpsError:c.slots[0].gemIds[0]===6000?1:50,confidence:95,iterations:100,engine:'SimulationCraft synthetic'})};
let incumbentResult=await optimizeAuctionGearEnhancements(incumbentInput);
while(!incumbentResult.complete) incumbentResult=await optimizeAuctionGearEnhancements({...incumbentInput,checkpoint:JSON.parse(JSON.stringify(incumbentResult.checkpoint))});
assert.equal(Object.keys(incumbentResult.checkpoint.cache).length,5);
assert.equal(incumbentResult.finalists.length,3);
assert(incumbentResult.finalists.some(f=>f.simulation.dps===115.125));
assert.equal(incumbentResult.checkpoint.confirmed.simulation.dps,115.125);
assert.equal(incumbentResult.finalists[0].simulation.dps,123.125);
const expiredIncumbent=await optimizeAuctionGearEnhancements({...incumbentInput,checkpoint:incumbentResult.checkpoint,now:now+3*3600000});
assert.equal(expiredIncumbent.finalists.length,0);assert.equal(expiredIncumbent.checkpoint.confirmed,undefined);
await assert.rejects(()=>optimizeAuctionGearEnhancements({...incumbentInput,checkpoint:incumbentResult.checkpoint,prices:{...incumbentInput.prices,sourceUpdatedAt:new Date(now+1).toISOString()}}),/checkpoint_changed/);
console.log('Confirmed incumbent survives four higher noisy means, serialization, and stale-price invalidation.');
let cacheHits=0,nativeCalls=0;
const cacheMetricInput={...base,limits:{configurations:1,simulations:1},onCacheHit:()=>{cacheHits++;},simulate:async c=>{nativeCalls++;return base.simulate(c);}};
const cacheMetricFirst=await optimizeAuctionGearEnhancements(cacheMetricInput);
assert.equal(nativeCalls,1);assert.equal(cacheHits,0,'New native measurements must not increment cache hits');
await optimizeAuctionGearEnhancements({...cacheMetricInput,simulationCache:cacheMetricFirst.checkpoint.cache});
assert.equal(nativeCalls,1);assert.equal(cacheHits,1,'A reused validated configuration measurement increments once');
await optimizeAuctionGearEnhancements({...cacheMetricInput,simulationCache:cacheMetricFirst.checkpoint.cache,shouldYield:()=>true});
assert.equal(cacheHits,1,'Unvisited cache entries must not increment diagnostics');
console.log('Cache-hit diagnostics callback contract passed.');
