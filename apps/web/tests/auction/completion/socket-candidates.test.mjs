// Synthetic options only: tests selection constraints, never live market/DPS claims.
import assert from 'node:assert/strict';
import test from 'node:test';
import { additionalAuctionSocketFinalists } from '../../../lib/wow/auctionGearEnhancementCandidates.ts';
import { auctionEnhancementScenarioFinalists } from '../../../lib/wow/auctionGearEnhancementStage.ts';

function option(id, slotType='HEAD', sockets=true) {
  return {id:String(id),auctionId:id,quantity:1,costCopper:10,variantKey:`v${id}`,candidate:{
    entityId:`synthetic-${id}`,itemId:id,name:'Synthetic option',slotType,itemLevel:150,
    inventoryType:slotType==='HEAD'?1:slotType==='CHEST'?5:11,itemClassId:4,itemSubclassId:4,
    constraints:{uniqueEquipped:false,crafted:false,allowableClassMask:'1',requiredLevel:1},
    compatibility:{specId:72,method:'specialization',itemClassId:4,itemSubclassId:4},eligible:true,rejectionReasons:[],
    variants:[{key:`v${id}`,itemLevel:150,bonusIds:[101],contextId:13,resolution:{engine:'SimulationCraft synthetic',
      stats:{},requiredLevel:1,enhancements:{status:'verified',socketColors:[sockets?14:0,0,0],socketCount:sockets?1:0,
        socketBonusId:0,requiredProfessionId:0,requiredProfessionRank:0}}}],
  }};
}
const metadata = row => row.candidate.variants[0].resolution.enhancements;
const input = (options,finalists=[]) => ({options,finalists,measured:[],equipment:{equipped_items:[]},loadout:[],
  specId:72,budgetCopper:100,selectedSlots:['HEAD','CHEST','FINGER_1','FINGER_2'],signal:new AbortController().signal});

test('socket proposal bound preserves retained sets, exact lots, bare-loss ordering and unmeasured eligibility',()=>{
  const chest=option(1,'CHEST',false), existing={label:'confirmed',options:[chest]};
  const candidates=[option(2),option(3),option(4)];
  const result=additionalAuctionSocketFinalists({...input(candidates,[existing]),
    measured:[{optionId:'2',comparison:{candidateDps:990}},{optionId:'3',comparison:{candidateDps:995}}]});
  assert.equal(result.finalists.length,2);
  assert.deepEqual(result.finalists.map(row=>row.options.map(option=>option.id)),[['1','3'],['1','2']]);
  assert.equal(result.candidatesConsidered,3);assert.equal(result.searchLimited,true);
  assert(result.reasons.includes('socket_candidate_limit'));
  assert.deepEqual(existing.options,[chest]);
  assert.equal(additionalAuctionSocketFinalists(input([option(5)])).finalists[0].options[0].id,'5');
  const duplicate=structuredClone(candidates[0]);duplicate.id='expensive';duplicate.auctionId=9;duplicate.costCopper=20;
  const dedup=additionalAuctionSocketFinalists(input([duplicate,candidates[0]]));
  assert.equal(dedup.candidatesConsidered,1);assert.equal(dedup.finalists[0].options[0].id,'2');
});

test('unverified sockets, profession gates, known finalists and exhausted item budgets never enter supplemental search',()=>{
  const unknown=option(1),profession=option(2),unavailable=option(3),bare=option(4,'HEAD',false),spent=option(5),known=option(6);
  delete unknown.candidate.variants[0].resolution.enhancements;
  metadata(profession).requiredProfessionId=755;unavailable.candidate.eligible=false;spent.costCopper=100;
  const result=additionalAuctionSocketFinalists(input([unknown,profession,unavailable,bare,spent,known],[{label:'known',options:[known]}]));
  assert.deepEqual(result.finalists,[]);assert.deepEqual(result.reasons,[]);
  unknown.candidate.slotType='CHEST';unknown.candidate.inventoryType=5;
  const standalone=additionalAuctionSocketFinalists(input([known],[{label:'unknown-anchor',options:[unknown]}]));
  assert.deepEqual(standalone.finalists.map(row=>row.options.map(option=>option.id)),[['6']]);
});

test('whole-set quantity and unique constraints can use a valid standalone replacement without an invalid anchor',()=>{
  const existing=option(1,'FINGER_1',false),replacement=option(2,'FINGER_2');
  existing.candidate.constraints.limitCategoryId=5;existing.candidate.constraints.limitQuantity=1;
  replacement.candidate.constraints.limitCategoryId=5;replacement.candidate.constraints.limitQuantity=1;
  const result=additionalAuctionSocketFinalists(input([replacement],[{label:'existing',options:[existing]}]));
  assert.deepEqual(result.finalists.map(row=>row.options.map(option=>option.id)),[['2']]);
  const sameLot=structuredClone(replacement);sameLot.id='same-lot';sameLot.auctionId=existing.auctionId;
  sameLot.variantKey=existing.variantKey;sameLot.candidate.itemId=existing.candidate.itemId;
  sameLot.candidate.variants[0].key=existing.variantKey;
  const shared=additionalAuctionSocketFinalists(input([sameLot],[{label:'existing',options:[existing]}]));
  assert(shared.finalists.every(row=>row.options.length===1));
});

test('socket proposals cannot remove a locked offhand, and cancellation stops selection',()=>{
  const staff=option(1,'MAIN_HAND');Object.assign(staff.candidate,{inventoryType:17,itemClassId:2,itemSubclassId:10});
  staff.candidate.compatibility={specId:63,method:'specialization',itemClassId:2,itemSubclassId:10};
  const request={...input([staff]),specId:63,selectedSlots:['MAIN_HAND'],
    loadout:[{slotType:'MAIN_HAND',itemId:10,inventoryType:13,itemSubclassId:7},{slotType:'OFF_HAND',itemId:11,inventoryType:23,itemSubclassId:0}]};
  assert.deepEqual(additionalAuctionSocketFinalists(request).finalists,[]);
  const controller=new AbortController();controller.abort();
  assert.throws(()=>additionalAuctionSocketFinalists({...request,signal:controller.signal}),{name:'AbortError'});
});

test('scenario shortlist retains independent value, significant maximum, and noisy measured leader within three',()=>{
  const recommendation=(key,gain,cost,significant=true)=>({label:key,configuration:{key,totalCopper:cost},comparison:{deltaDps:gain,uncertainty:{significant}}});
  const rows=[recommendation('cheap',10,1),recommendation('maximum',100,100),recommendation('noisy',200,100,false),recommendation('middle',20,20)];
  assert.deepEqual(auctionEnhancementScenarioFinalists(rows,'dps').map(row=>row.label),['noisy','cheap','maximum']);
  assert.deepEqual(auctionEnhancementScenarioFinalists(rows,'value').map(row=>row.label),['cheap','maximum']);
});
