/** Offline optimizer replay benchmark. Synthetic prices/DPS, real optimizer traversal. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {createExactCommodityPriceCache,exactCommodityQuote} from '../../../lib/wow/auctionGearCost.ts';
import {assertFreshMarket} from '../../../lib/wow/auctionMarket.ts';
import {compareGearSimulationResults} from '../../../lib/wow/gearSimulation.ts';

const source=await readFile(new URL('../../../lib/wow/auctionGearEnhancementOptimizer.ts',import.meta.url),'utf8');
const stripped=stripTypeScriptTypes(source,{mode:'transform'}).replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const compile=factory=>new vm.Script(stripped+'\n;({optimizeAuctionGearEnhancements,hash})').runInNewContext({
 createHash,assertFreshMarket,compareGearSimulationResults,createExactCommodityPriceCache:factory,structuredClone,setImmediate,clearImmediate});
const measurement={dps:1100,dpsError:1,confidence:95,iterations:750,engine:'SimulationCraft synthetic-price-cache'};
const gems=Array.from({length:6},(_,i)=>({key:`gem-${i}`,kind:'gem',consumableItemId:100+i,simulationId:200+i}));
const slots=Array.from({length:2},(_,i)=>({slotType:`FINGER_${i+1}`,variantKey:`synthetic-${i}`,metadataKey:'verified-synthetic',owned:false,
 sockets:[{key:'0',type:'14'},{key:'1',type:'14'}]}));
const catalog={version:'synthetic-price-cache-v1',complete:true,resolve:()=>({verified:true,enchantApplicable:false,enchantChoices:[],gemChoices:{'0':gems,'1':gems}})};
const identity='synthetic-price-cache-replay',simulationCache={};
const hash=compile(createExactCommodityPriceCache).hash;
for(let cursor=0;cursor<7**4;cursor++) {
 let value=cursor;const ids=Array.from({length:4},()=>{const at=value%7;value=Math.floor(value/7);return at===6?0:gems[at].simulationId;});
 const configurationSlots=slots.map((slot,i)=>({slotType:slot.slotType,variantKey:slot.variantKey,enchantId:0,gemIds:ids.slice(i*2,i*2+2)}));
 simulationCache[hash({identity,catalog:catalog.version,slots:configurationSlots,metadata:slots.map(s=>s.metadataKey)})]=measurement;
}
const repeats=Number(process.env.AUCTION_PRICE_CACHE_REPEATS??5);
const out=new URL('../../../../../work/gear-planner/exact-price-cache/',import.meta.url);
const fixtures=[];
for(const ladderLevels of [2,30,300]) {
 const prices=Object.fromEntries(gems.map((gem,i)=>[gem.consumableItemId,{ladder:Array.from({length:ladderLevels},(_,level)=>[10+level+i,level===0?1:10])}]));
 const rows=[];
 for(let repeat=0;repeat<repeats;repeat++)for(const version of repeat%2?['cached','uncached']:['uncached','cached']) {
  const metrics={costRequests:0,quoteRequests:0,fullLadderCostEvaluations:0,capturedLadders:0};
  const factory=prices=>{
   const cache=version==='cached'?createExactCommodityPriceCache(prices):undefined,seen=new Set(),items=new Set();
   const count=(itemId,quantity,kind)=>{
    metrics[`${kind}Requests`]++;
    const key=`${itemId}:${quantity}`;
    if(!cache||!seen.has(key))metrics.fullLadderCostEvaluations++;
    if(cache&&!items.has(itemId))metrics.capturedLadders++;
    seen.add(key);items.add(itemId);
   };
   return {
    cost:(itemId,quantity)=>{count(itemId,quantity,'cost');return cache?cache.cost(itemId,quantity):prices[itemId]?exactCommodityQuote(prices[itemId].ladder,quantity).totalCopper:null;},
    quote:(itemId,quantity)=>{count(itemId,quantity,'quote');return cache?cache.quote(itemId,quantity):prices[itemId]?exactCommodityQuote(prices[itemId].ladder,quantity):{totalCopper:null,levels:[],missingQuantity:quantity};},
   };
  };
  const optimize=compile(factory).optimizeAuctionGearEnhancements;
  const input={exhaustive:true,slots,catalog,character:{},prices:{prices,sourceUpdatedAt:new Date().toISOString()},itemsCopper:100,budgetCopper:100000,
   simulationIdentity:identity,simulationCache,signal:new AbortController().signal,limits:{configurations:1024,simulations:12},
   simulate:async()=>assert.fail('All mechanical configurations must already be measured')};
  let result,turns=0;const trace=[],started=performance.now();
  do {
   result=await optimize({...input,checkpoint:result?.checkpoint});turns++;
   trace.push(...result.configurations.map(config=>({...config,sourceUpdatedAt:undefined})));
   assert(turns<10);
  }while(!result.complete);
  rows.push({version,repeat,ms:performance.now()-started,turns,configurations:trace.length,traceHash:digest(trace),metrics});
 }
 assert(rows.every(row=>row.traceHash===rows[0].traceHash),'cached pricing must preserve every positional configuration and procurement level');
 assert(rows.every(row=>row.configurations===7**4));
 const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
 const summary=Object.fromEntries(['uncached','cached'].map(version=>{const samples=rows.filter(row=>row.version===version);return [version,{medianMs:median(samples.map(row=>row.ms)),...samples[0].metrics}];}));
 fixtures.push({ladderLevels,summary,rows});
}
await mkdir(out,{recursive:true});
await writeFile(new URL('report.json',out),JSON.stringify({scope:'Offline synthetic 2 rings / 4 sockets / 6 gems, all 2401 mechanical simulations cached. Same current optimizer, only pricing lookup changes. No live-market or native-process performance claim.',sourceHash:digest(source),repeats,fixtures},null,2)+'\n');
console.log(JSON.stringify({output:new URL('report.json',out).pathname,fixtures:fixtures.map(({ladderLevels,summary})=>({ladderLevels,summary}))},null,2));
