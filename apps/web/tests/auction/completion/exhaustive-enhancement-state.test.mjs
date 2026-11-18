import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { createAuctionGearEnhancedLoadoutIterator } from '../../../lib/wow/auctionGearEnhancedLoadouts.ts';
import { assertFreshMarket } from '../../../lib/wow/auctionMarket.ts';
import { readAuctionState, writeAuctionState } from '../../../lib/wow/auctionGearPersistence.ts';

const source = await readFile(new URL('../../../lib/wow/auctionGearExhaustiveEnhancements.ts',import.meta.url),'utf8');
const code=stripTypeScriptTypes(source.replace(/^import[\s\S]*?;\n/gm,'')).replace(/^export /gm,'');
const storeSource=await readFile(new URL('../../../lib/wow/auctionGearSearchStore.ts',import.meta.url),'utf8');
const storeCode=storeSource.slice(storeSource.indexOf('function storedEntry('),storeSource.indexOf('export function saveAuctionGearSearch('));
const storedEntry=vm.runInNewContext(stripTypeScriptTypes(storeCode)+';storedEntry',{snapshotAuctionGearContext:()=>({})});
const simulation=dps=>({dps,dpsError:1,iterations:750,confidence:95,engine:'SimulationCraft synthetic-state'});
function fixture() {
  const h={price:10,stale:false,partial:false,stageCalls:[],slice:0,abortAfterQuotes:false};
  const quote=async()=>({prices:{'1':{ladder:[[h.price,100]]}},sourceUpdatedAt:h.stale?'2000-01-01T00:00:00Z':new Date().toISOString(),fetchedAt:new Date().toISOString()});
  const advance=vm.runInNewContext(code+';advanceAuctionGearExhaustiveEnhancements',{
    createHash,createAuctionGearEnhancedLoadoutIterator,assertFreshMarket,structuredClone,
    auctionGearSlots:['HEAD'],auctionEnhancementCatalogInfo:{revision:'synthetic-state-v1'},exactCommodityPrices:quote,
    evaluateAuctionEnhancementStage:async input=>{
      const options=input.finalists[0].options,key=options.map(o=>o.id).join()||'baseline';
      h.stageCalls.push(key);h.slice++;
      input.state.quotes=await quote();input.state.quotedItemIds=[1];
      input.state.checkpoints.current={nativeFacts:'preserved',key};
      if(h.abortAfterQuotes)throw new DOMException('Aborted','AbortError');
      const spent=options.reduce((sum,o)=>sum+o.costCopper,0),dps=1000+(options[0]?.candidate.itemId??0);
      const recommendation={label:'synthetic',optionIds:options.map(o=>o.id),purchases:[],consumableNames:{},simulation:simulation(dps),
        comparison:{deltaDps:dps-1000,candidateDps:dps,uncertainty:{significant:dps>1000}},
        configuration:{key,status:'priced',itemsCopper:spent,totalCopper:spent+h.price,fullyEnhanced:false,consumables:[],slots:[],sourceUpdatedAt:input.state.quotes.sourceUpdatedAt}};
      return{complete:!h.partial,status:h.stale?'unavailable':'ready',searchLimited:true,recommendations:h.stale?[]:[recommendation],reasons:h.stale?['market_unverified']:[],traversal:'exhaustive'};
    },
  });
  const options=[1,2,3].map(id=>({id:`option-${id}`,auctionId:id,costCopper:100,quantity:1,variantKey:'variant',
    candidate:{itemId:id,name:'Synthetic',slotType:'HEAD',inventoryType:1,itemClassId:4,itemSubclassId:4,itemLevel:150,
      constraints:{uniqueEquipped:false,crafted:false,allowableClassMask:'1',requiredLevel:1},eligible:true,rejectionReasons:[],
      compatibility:{specId:72,method:'specialization',itemClassId:4,itemSubclassId:4},variants:[{key:'variant',itemLevel:150,bonusIds:[],contextId:13}]}}));
  const input={options,selectedSlots:['HEAD'],equipment:{equipped_items:[{slot:{type:'HEAD'},item:{id:999}}]},loadout:[{slotType:'HEAD',itemId:999,inventoryType:1,itemSubclassId:4}],
    specId:72,level:90,region:'eu',engine:'SimulationCraft synthetic-state',profileFingerprint:'synthetic-profile',encounter:{scenario:'single-target',fightLengthSeconds:120,targets:1},
    budgetCopper:1000,objective:'dps',baseline:simulation(1000),simulate:async()=>{throw Error('stage controls measurements')},
    signal:new AbortController().signal,shouldYield:()=>h.slice>=1,quote,onState:state=>{h.state=state;}};
  h.run=async()=>{h.slice=0;return advance({...input,state:h.state});};h.input=input;return h;
}
async function finish(h){let result;for(let i=0;i<12;i++){result=(await h.run()).result;if(result.complete)return result;}throw Error('fixture did not finish');}

test('durable store whitelist roundtrip resumes the same pending assignment and retains only three leaders',async()=>{
  const h=fixture();h.partial=true;await h.run();assert.deepEqual([...h.state.currentOptionIds],[]);assert.equal(h.state.equipmentChecked,0);
  assert.equal(process.env.GILDRA_AUCTION_STATE_DIR,undefined);const directory=await mkdtemp(join(tmpdir(),'gildra-exact-state-'));process.env.GILDRA_AUCTION_STATE_DIR=directory;
  try{
    const id=randomUUID();writeAuctionState('search',id,Date.now()+60000,storedEntry({id,owner:'synthetic',exhaustiveEnhancementState:h.state}),{metadata:{owner:'synthetic'}});
    h.state=readAuctionState('search',id).data.exhaustiveEnhancementState;
    assert.equal(h.state.stage.checkpoints.current.nativeFacts,'preserved');h.partial=false;
    const result=await finish(h);assert.equal(result.complete,true);assert.equal(result.equipmentChecked,4);
    assert.equal(result.recommendations[0].optionIds[0],'option-3');assert.equal(Object.keys(h.state.stage.checkpoints).length,0);
    assert.equal(h.stageCalls.filter(key=>key==='option-3').length,1);assert(result.recommendations.length<=3);
    const calls=h.stageCalls.length;await h.run();assert.equal(h.stageCalls.length,calls,'Completed unchanged domain is idempotent');
  }finally{delete process.env.GILDRA_AUCTION_STATE_DIR;await rm(directory,{recursive:true,force:true});}
});

test('price ladder changes reopen completed ranking while equal-price timestamps keep the exact cursor',async()=>{
  const h=fixture();await finish(h);const calls=h.stageCalls.length;
  h.state.stage.quotes.fetchedAt='2000-01-01T00:00:00Z';await h.run();assert.equal(h.stageCalls.length,calls);
  h.price=20;h.state.stage.quotes.fetchedAt='2000-01-01T00:00:00Z';const changed=await h.run();
  assert.equal(changed.result.complete,false);assert.equal(changed.result.equipmentChecked,1);assert(!changed.result.recommendations.some(row=>row.optionIds.includes('option-3')));
  const fresh=await finish(h);assert.equal(fresh.recommendations[0].configuration.totalCopper,120);
});

test('exclusion, budget, profile and option-price changes discard old global winners',async()=>{
  for(const change of [h=>{h.input.options=h.input.options.slice(0,2);},h=>{h.input.budgetCopper=900;},h=>{h.input.profileFingerprint='other-profile';},h=>{h.input.options[2].costCopper=150;}]){
    const h=fixture();await finish(h);const old=h.state.inputKey;change(h);const result=await h.run();
    assert.notEqual(h.state.inputKey,old);assert.equal(result.result.complete,false);assert.equal(result.result.equipmentChecked,1);
    assert(!result.result.recommendations.some(row=>row.optionIds.includes('option-3')));
  }
});

test('stale quotes never consume a set and fresh same-ladder retry resumes preserved facts without spinning',async()=>{
  const h=fixture();h.stale=true;await assert.rejects(h.run(),/market_stale/);
  assert.equal(h.state.equipmentChecked,0);assert.deepEqual([...h.state.currentOptionIds],[]);assert.equal(h.stageCalls.length,1);
  assert.equal(h.state.stage.checkpoints.current.nativeFacts,'preserved');h.stale=false;
  const result=await finish(h);assert.equal(result.complete,true);assert.equal(result.equipmentChecked,4);
  h.stale=true;h.state.stage.quotes.fetchedAt='2000-01-01T00:00:00Z';await assert.rejects(h.run(),/market_stale/);
});

test('a price mutation followed by abort cannot silently reuse the old global ranking',async()=>{
  const h=fixture();await h.run();await h.run();assert(h.state.dps);
  h.price=99;h.abortAfterQuotes=true;await assert.rejects(h.run(),{name:'AbortError'});
  assert.equal(h.state.dps.recommendation.configuration.totalCopper,110);
  h.abortAfterQuotes=false;const resumed=await h.run();assert.equal(resumed.result.equipmentChecked,1);
  assert(!resumed.result.recommendations.some(row=>row.optionIds.includes('option-1')));
});
