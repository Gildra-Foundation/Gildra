/** Hash compatibility and exact continuation tests; real pinned catalog, synthetic prices/DPS. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {assertFreshMarket} from '../../../lib/wow/auctionMarket.ts';
import {compareGearSimulationResults} from '../../../lib/wow/gearSimulation.ts';
import {exactCommodityQuote} from '../../../lib/wow/auctionGearCost.ts';
import {auctionEnhancementCatalogInfo as info,resolveExactEnhancements} from '../../../lib/wow/auctionEnhancementCatalog.ts';
const source=await readFile(new URL('../../../lib/wow/auctionGearEnhancementOptimizer.ts',import.meta.url),'utf8');
// Former canonical hash from30280ff234453a8d8f61ec9c75b14302deff7693. No Git history is required by tests.
const oldCanonical='const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)])) : value;\n';
const start=source.indexOf('const canonical ='),end=source.indexOf('const hash =',start);assert(start>=0&&end>start);
const globals={createHash,assertFreshMarket,compareGearSimulationResults,exactCommodityQuote,structuredClone,setImmediate,clearImmediate};
const strip=code=>stripTypeScriptTypes(code,{mode:'transform'}).replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
const compile=(legacy=false)=>new vm.Script(strip(legacy?source.slice(0,start)+oldCanonical+source.slice(end):source)+'\n;({canonical,hash,optimizeAuctionGearEnhancements})').runInNewContext({...globals});
const before=compile(true),after=compile();
test('canonical JSON and hashes remain byte-identical for plain facts, shared records, numeric keys and sparse arrays',()=>{
 const shared={z:3,a:{price:10,source:['one','two']},'10':10,'2':2};
 const samples=[null,undefined,42,'exact',[],{b:2,a:1},{rows:[shared,shared],again:shared},JSON.parse('{"__proto__":{"safe":1},"constructor":"fact","01":"a","0":"b"}'),[1,,undefined,null],new Date('2026-01-01')];
 let seed=12345;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
 for(let i=0;i<100;i++)samples.push({z:random(),rows:[shared,{b:random()%7,a:random()%11}],prices:{'211':{ladder:[[random()%100+1,3]]},'12':{ladder:[[2,4]]}}});
 for(const sample of samples){assert.equal(JSON.stringify(after.canonical(sample)),JSON.stringify(before.canonical(sample)));if(sample!==undefined)assert.equal(after.hash(sample),before.hash(sample));}
});
test('no canonical object/key-order data is reused after a mutable fact changes between hashes',()=>{
 const fact={prices:{'101':{ladder:[[10,2]]}},metadata:{socketColors:[14,0,0]},baseline:{dps:1000}};
 const first=after.hash(fact);assert.equal(first,before.hash(fact));fact.prices['101'].ladder[0][0]=20;fact.metadata.socketColors[1]=14;fact.baseline.engine='SimulationCraft changed';delete fact.baseline.dps;
 assert.notEqual(after.hash(fact),first);assert.equal(after.hash(fact),before.hash(fact));
});
const engine=`SimulationCraft ${info.simcRevision.slice(0,7)} hash-continuation-fixture`;
const resolution=resolveExactEnhancements({itemId:960010,inventoryType:11,itemClassId:4,itemSubclassId:0,itemLevel:150,socketColors:[14,14,0],build:info.build,revision:info.simcRevision,engine},{level:90,professions:[]});assert(resolution.verified);
const normalize=row=>({...row,...(row.category?{category:{id:String(row.category.id),limit:row.category.limit}}:{})});
const gems=resolution.gemChoices['0'].filter(row=>!row.uniqueEquipped&&!row.category).slice(0,3).map(normalize),enchants=resolution.enchantChoices.slice(0,2).map(normalize);
const now=new Date().toISOString();
function fixture(){
 const calls=[];const input={slots:[{slotType:'FINGER_1',variantKey:'exact',metadataKey:'verified',owned:false,sockets:[{key:'0',type:'14'},{key:'1',type:'14'}]}],
  catalog:{version:info.revision,complete:false,resolve:()=>({verified:true,enchantApplicable:true,enchantChoices:enchants,gemChoices:{'0':gems,'1':gems}})},character:{},
  prices:{sourceUpdatedAt:now,prices:Object.fromEntries([...gems,...enchants].map((row,i)=>[row.consumableItemId,{ladder:[[10+(i+1)**2*5,1],[20+(i+1)**2*5,30]]}]))},
  itemsCopper:100,budgetCopper:10000,simulationIdentity:'exact-fixture',objective:'value',baseline:{dps:1000,dpsError:1,confidence:95,iterations:750,engine},exhaustive:true,signal:new AbortController().signal,limits:{simulations:1,configurations:128},
  simulate:async configuration=>{calls.push(structuredClone(configuration));const slot=configuration.slots[0],rank=id=>gems.findIndex(g=>g.simulationId===id)+1;const noisy=slot.gemIds.every(id=>rank(id)===3);return{dps:noisy?2000:1020+slot.gemIds.reduce((sum,id)=>sum+rank(id)*17,0)+(enchants.findIndex(e=>e.simulationId===slot.enchantId)+1)*13,dpsError:noisy?1000:1,confidence:95,iterations:750,engine};}};
 return{input,calls};
}
async function finish(opt,input,checkpoint){let result;for(let i=0;i<200;i++){result=await opt({...input,checkpoint});checkpoint=JSON.parse(JSON.stringify(result.checkpoint));if(result.complete)return result;}assert.fail('fixture did not finish');}
test('old checkpoint resumes unchanged with identical configurations, exact quotes, uncertainty and both leaders',async()=>{
 const legacy=fixture(),expected=await finish(before.optimizeAuctionGearEnhancements,legacy.input);
 const mixed=fixture(),first=await before.optimizeAuctionGearEnhancements(mixed.input);const snapshot=JSON.stringify(first.checkpoint);
 const actual=await finish(after.optimizeAuctionGearEnhancements,mixed.input,JSON.parse(snapshot));
 assert.equal(JSON.stringify(first.checkpoint),snapshot);assert.deepEqual(mixed.calls,legacy.calls,'same positional configurations, costs, levels, statuses and native sequence');
 const plain=value=>JSON.parse(JSON.stringify(value));assert.deepEqual(plain(actual.checkpoint),plain(expected.checkpoint));
 assert(actual.checkpoint.bestValueConfirmed);assert(actual.checkpoint.bestDpsConfirmed);assert.notEqual(actual.checkpoint.bestValueConfirmed.configuration.key,actual.checkpoint.bestDpsConfirmed.configuration.key);
 const newer=new Date(Date.parse(now)+1000).toISOString();const refreshed=await after.optimizeAuctionGearEnhancements({...mixed.input,checkpoint:actual.checkpoint,prices:{...mixed.input.prices,sourceUpdatedAt:newer}});assert.equal(refreshed.simulations,0);assert.equal(refreshed.checkpoint.inputKey,actual.checkpoint.inputKey);
 const repriced=structuredClone(mixed.input.prices);repriced.prices[String(gems[0].consumableItemId)].ladder[0][0]++;await assert.rejects(after.optimizeAuctionGearEnhancements({...mixed.input,checkpoint:actual.checkpoint,prices:repriced}),/enhancement_checkpoint_changed/);
 const replay=await finish(after.optimizeAuctionGearEnhancements,{...mixed.input,prices:repriced,simulationCache:actual.checkpoint.cache});assert.equal(mixed.calls.length,legacy.calls.length,'price-only retry reuses unchanged exact native measurements');assert(replay.complete);
});
test('failed native continuation leaves the caller checkpoint retryable at the same exact configuration',async()=>{
 const h=fixture(),first=await before.optimizeAuctionGearEnhancements(h.input),saved=JSON.stringify(first.checkpoint);let failedKey;
 await assert.rejects(after.optimizeAuctionGearEnhancements({...h.input,checkpoint:first.checkpoint,simulate:async config=>{failedKey=config.key;throw Error('synthetic_native_failure');}}),/synthetic_native_failure/);
 assert.equal(JSON.stringify(first.checkpoint),saved);const retried=await after.optimizeAuctionGearEnhancements({...h.input,checkpoint:first.checkpoint});assert.equal(h.calls.at(-1).key,failedKey);assert.equal(retried.simulations,1);
});
