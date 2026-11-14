import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { assertFreshMarket, MARKET_MAX_AGE_MS } from '../../../lib/wow/auctionMarket.ts';
import { evaluateAuctionGearScenarios } from '../../../lib/wow/auctionGearScenarioExecution.ts';
import { evaluateAuctionEnhancementStage } from '../../../lib/wow/auctionGearEnhancementStage.ts';

const measurement = dps => ({dps,dpsError:1,confidence:95,iterations:750,engine:'SimulationCraft 18428cd synthetic-stale-transport'});
async function publicationGuard() {
  const source=await readFile(new URL('../../../lib/wow/auctionGearRunner.ts',import.meta.url),'utf8');
  const start=source.indexOf('function withFreshEnhancementQuotes');
  const end=source.indexOf('export function selectedAuctionGearAssemblyOptions',start);
  assert(start>=0&&end>start);
  return vm.runInNewContext(stripTypeScriptTypes(source.slice(start,end))+';withFreshEnhancementQuotes',{assertFreshMarket,Set});
}

test('late scenario partial and final publications withdraw expired full-cost recommendations without mutating earlier snapshot',async t=>{
  const fresh=await publicationGuard();
  let now=Date.now();t.mock.method(Date,'now',()=>now);
  const sourceUpdatedAt=new Date(now-MARKET_MAX_AGE_MS+1500).toISOString();
  const earlier={kind:'assembly',enhancementOptimization:{complete:true,status:'ready',reasons:[],recommendations:[{configuration:{status:'priced',totalCopper:110,sourceUpdatedAt}}]}};
  assert.equal(fresh(earlier),earlier);
  const publications=[];
  const rows=await evaluateAuctionGearScenarios(['enhanced'],[{scenario:'aoe',fightLengthSeconds:60,targets:5}],new AbortController().signal,
    async selection=>{now+=1000;return measurement(selection?1100:1000);},
    {onProgress:scenarioComparisons=>publications.push(fresh({...earlier,scenarioComparisons,scenarioComparisonsComplete:false}))});
  const final=fresh({...earlier,scenarioComparisons:rows,scenarioComparisonsComplete:true});
  assert.equal(publications.length,1);
  for(const result of [...publications,final]) {
    assert.equal(result.enhancementOptimization.recommendations.length,0);
    assert.equal(result.enhancementOptimization.status,'unavailable');
    assert(result.enhancementOptimization.reasons.includes('market_unverified'));
  }
  assert.equal(earlier.enhancementOptimization.recommendations.length,1,'Already published snapshots cannot be mutated');
  assert.equal(earlier.enhancementOptimization.status,'ready');
});

function option(id) {
  const variantKey=`synthetic-stale-${id}`;
  const candidate={entityId:`synthetic-${id}`,itemId:id,name:'Synthetic socketed trinket',slotType:'TRINKET_1',itemLevel:150,
    inventoryType:12,itemClassId:4,itemSubclassId:0,constraints:{uniqueEquipped:false,crafted:false,allowableClassMask:'1',requiredLevel:1},
    compatibility:{specId:72,method:'specialization',itemClassId:4,itemSubclassId:0},eligible:true,rejectionReasons:[],
    provenance:{buildId:1},season:{id:'synthetic',patch:'synthetic',status:'current',evidence:'synthetic'},source:{type:'auction',evidence:'synthetic'},
    variants:[{key:variantKey,itemLevel:150,bonusIds:[],resolution:{engine:measurement(1).engine,metadataVersion:2,stats:{},requiredLevel:1,
      enhancements:{status:'verified',socketColors:[14,0,0],socketCount:1,socketBonusId:0,requiredProfessionId:0,requiredProfessionRank:0}}}]};
  return {id:`synthetic-option-${id}`,auctionId:id,quantity:1,costCopper:100,candidate,variantKey};
}

test('stage withdraws first finalist quote when it expires during the second finalist simulation',async t=>{
  let now=Date.now();t.mock.method(Date,'now',()=>now);
  const sourceUpdatedAt=new Date(now-MARKET_MAX_AGE_MS+1500).toISOString(), fetchedAt=new Date(now).toISOString();
  let simulations=0;
  const result=await evaluateAuctionEnhancementStage({finalists:[{label:'first',options:[option(960010)]},{label:'second',options:[option(960011)]}],
    equipment:{equipped_items:[{slot:{type:'TRINKET_1'},item:{id:970010}}]},loadout:[{slotType:'TRINKET_1',itemId:970010,inventoryType:12,itemSubclassId:0}],
    specId:72,level:90,region:'eu',engine:measurement(1).engine,profileFingerprint:'synthetic-stale-stage',
    encounter:{scenario:'single-target',fightLengthSeconds:120,targets:1},budgetCopper:500,objective:'dps',baseline:measurement(1000),
    signal:new AbortController().signal,shouldYield:()=>false,state:{checkpoints:{}},
    quote:async(_region,ids)=>({prices:Object.fromEntries(ids.map(id=>[id,{ladder:[[10,10]]}])),sourceUpdatedAt,fetchedAt}),
    simulate:async()=>{simulations++;now+=1000;return measurement(1100);}});
  assert.equal(simulations,2);
  assert.equal(result.recommendations.length,0,'The first previously fresh finalist must not survive expired final publication');
  assert(result.reasons.includes('market_unverified'));
});
