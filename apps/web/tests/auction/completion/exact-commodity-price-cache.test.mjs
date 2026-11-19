/** Synthetic exact ladders; no live market or DPS claims. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createExactCommodityPriceCache,exactCommodityCost,exactCommodityQuote} from '../../../lib/wow/auctionGearCost.ts';
import {optimizeAuctionGearEnhancements} from '../../../lib/wow/auctionGearEnhancementOptimizer.ts';

test('snapshot cache retains exact quantity costs, procurement levels and insufficient stock',()=>{
 const prices={100:{ladder:[[10,1],[25,2],[80,4]]},200:{ladder:[]}};
 const cache=createExactCommodityPriceCache(prices);
 for(const itemId of [100,200,300])for(let quantity=1;quantity<=9;quantity++) {
  const expected=prices[itemId]?exactCommodityQuote(prices[itemId].ladder,quantity):{totalCopper:null,levels:[],missingQuantity:quantity};
  assert.equal(cache.cost(itemId,quantity),expected.totalCopper);
  assert.deepEqual(cache.quote(itemId,quantity),expected);
  assert.equal(cache.cost(itemId,quantity),expected.totalCopper);
 }
 assert.equal(cache.cost(100,2),35,'two units consume both the cheap and next price level');
 assert.equal(cache.cost(100,8),null,'a cached smaller quantity cannot certify unavailable stock');
});

test('each used ladder is captured once and callers cannot mutate cached procurement levels',()=>{
 let captures=0;
 const ladder=[[10,1],[25,2]],prices={100:{get ladder(){captures++;return ladder;}}};
 const cache=createExactCommodityPriceCache(prices);
 assert.equal(cache.cost(100,1),10);
 ladder[0][0]=20;
 assert.equal(cache.cost(100,2),35);
 const quote=cache.quote(100,2);quote.totalCopper=0;quote.levels[0].unitCopper=0;quote.levels.push({unitCopper:1,quantity:100});
 assert.deepEqual(cache.quote(100,2),{totalCopper:35,levels:[{unitCopper:10,quantity:1},{unitCopper:25,quantity:1}],missingQuantity:0});
 assert.equal(captures,1);
 assert.equal(createExactCommodityPriceCache(prices).cost(100,2),45,'a new evaluation captures refreshed ladder values');
 assert.equal(cache.cost(200,1),null);prices[200]={ladder:[[1,1]]};
 assert.equal(cache.cost(200,1),null);
 assert.equal(createExactCommodityPriceCache(prices).cost(200,1),1);
});

test('cached lookup preserves full ladder, quantity and safe-integer validation',()=>{
 for(const ladder of [[[10,1],[9,2]],[[10,1],[10,1]],[[10,1],[11,0]],[[10,1],[1.5,2]]]) {
  assert.throws(()=>exactCommodityCost(ladder,1),/invalid_commodity_ladder/);
  const cache=createExactCommodityPriceCache({100:{ladder}});
  assert.throws(()=>cache.cost(100,1),/invalid_commodity_ladder/);
  assert.throws(()=>cache.quote(100,1),/invalid_commodity_ladder/,'invalid trailing levels are still checked');
 }
 const cache=createExactCommodityPriceCache({100:{ladder:[[Number.MAX_SAFE_INTEGER,2]]}});
 assert.equal(cache.cost(100,1),Number.MAX_SAFE_INTEGER);
 assert.throws(()=>cache.cost(100,2),/invalid_budget/);
 assert.throws(()=>cache.quote(100,2),/invalid_budget/);
 for(const quantity of [0,-1,1.5,Infinity,Number.MAX_SAFE_INTEGER+1]) {
  assert.throws(()=>cache.cost(100,quantity),/invalid_commodity_quantity/);
  assert.throws(()=>cache.quote(200,quantity),/invalid_commodity_quantity/);
 }
});

test('exhaustive partial pruning and final procurement agree at the exact budget and stock boundaries',async()=>{
 const gem={key:'gem',kind:'gem',consumableItemId:100,simulationId:200};
 const sockets=Array.from({length:3},(_,index)=>({key:String(index),type:'14'}));
 const calls=[],now=Date.now();
 const input={exhaustive:true,slots:[{slotType:'HEAD',variantKey:'synthetic',metadataKey:'verified',owned:false,sockets}],
  catalog:{version:'synthetic-cache-v1',complete:true,resolve:()=>({verified:true,enchantApplicable:false,enchantChoices:[],gemChoices:Object.fromEntries(sockets.map(s=>[s.key,[gem]]))})},
  character:{},prices:{prices:{100:{ladder:[[10,1],[90,1]]}},sourceUpdatedAt:new Date(now).toISOString()},
  itemsCopper:5,budgetCopper:105,simulationIdentity:'synthetic-cache-budget',signal:new AbortController().signal,now,
  limits:{configurations:128,simulations:12},simulate:async config=>{calls.push(config);return{dps:1100,dpsError:1,confidence:95,iterations:100,engine:'SimulationCraft cache-fixture'};}};
 const result=await optimizeAuctionGearEnhancements(input);
 assert.equal(result.complete,true);assert.equal(calls.length,7,'bare, three single gems and three double gems are affordable');
 for(const config of calls) {
  const quantity=config.slots[0].gemIds.filter(Boolean).length;
  assert.equal(config.totalCopper,[5,15,105][quantity]);
  if(quantity)assert.deepEqual(config.consumables[0],{itemId:100,kind:'gem',quantity,quotedCopper:quantity===1?10:100,
   levels:quantity===1?[{unitCopper:10,quantity:1}]:[{unitCopper:10,quantity:1},{unitCopper:90,quantity:1}],missingQuantity:0});
 }
 calls.length=0;
 const tighter=await optimizeAuctionGearEnhancements({...input,budgetCopper:104});
 assert.equal(tighter.complete,true);assert.equal(calls.length,4);
 assert(calls.every(config=>config.totalCopper<=104));
});
