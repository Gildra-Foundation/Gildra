import assert from 'node:assert/strict';
import {farmRules,endgameFarmRules,farmAccess,normalLootMask} from '../lib/wow/gearFarm/rules.ts';
import {farmCandidate,farmPrimaryCompatible,sourceTargets,sortFarmActivities} from '../lib/wow/gearFarm/planner.ts';
import {enqueueGearFarmJob,getGearFarmJob,cancelGearFarmJob} from '../lib/wow/gearFarm/jobs.ts';
const spire=farmRules.find(r=>r.slug==='windrunner-spire');
assert.equal(farmAccess(spire,81,120),'level_condition_met');
assert.equal(farmAccess(farmRules.find(r=>r.slug==='murder-row'),81,120),'unlock_unverified');
assert(farmRules.every(r=>farmAccess(r,90,120)==='level_condition_met'));
const lfr=endgameFarmRules.find(r=>r.difficulty==='raid-finder'),world=endgameFarmRules.find(r=>r.difficulty==='world');
assert.equal(farmAccess(lfr,81,500),'level_locked');assert.equal(farmAccess(lfr,90,272),'gear_locked');assert.equal(farmAccess(lfr,90,273),'level_condition_met');
assert.equal(farmAccess(world,90,120),'level_condition_met','Recommended gear is not a queue gate');
assert.equal(farmAccess(spire,80,120),'unlock_unverified','Quest/warband can provide alternate unlock');
assert(normalLootMask(-1));for(const mask of [null,undefined,0,1,2,'-1',NaN])assert.equal(normalLootMask(mask),false);
const context={classId:1,specId:72,characterLevel:81,anchorItemClassId:-1,anchorItemSubclassId:-1,raceId:10,faction:'HORDE',season:{id:'midnight-season-2',patch:'12.1',expansionId:11,sourceUrl:spire.sourceUrl,activityNames:[spire.name]}};
const entity=(id,type=4,subclass=4,inventory='HEAD',stat=74)=>({id:`entity-${id}`,externalId:id,name:`Published loot ${id}`,payload:{},tooltip:{blocks:[{type:'item_registry',class_id:type,subclass_id:subclass,inventory_type:inventory},{type:'item_requirements',class_mask:'-1',race_mask_0:'-1',race_mask_1:'-1',required_level:90},{type:'item_variants',entries:[{key:'base',item_level:108,context_id:0,bonus_list_ids:[],modifiers:[],stats:[{type:stat,allocation:5000}]}]}]}});
const source={id:2658,name:'The Restless Heart',location:spire.name};
const plate=entity(251098),cloth=entity(10,4,1),intellect=entity(11,4,0,'TRINKET',73);
const activity={...spire,access:'level_condition_met',targets:[],lootItemsChecked:1,variantsUnverified:0};
assert(farmCandidate(plate,{...context,slotType:'HEAD',currentItemLevel:102},source,[]));
assert.equal(farmCandidate(cloth,{...context,slotType:'HEAD',currentItemLevel:102},source,[]),null);
assert.equal(farmPrimaryCompatible(intellect,1,72),false);assert(farmPrimaryCompatible(entity(12,4,0,'TRINKET',72),1,72));
assert(farmPrimaryCompatible(entity(13,4,0,'TRINKET',71),1,72));
assert.equal(farmPrimaryCompatible(entity(14,4,0,'TRINKET',49),1,72),false,'Statless trinkets require effect/spec evidence');
assert.equal(farmPrimaryCompatible(entity(14,4,0,12,49),1,72),false);
const equipment=[{slotType:'HEAD',itemId:1,itemLevel:102},{slotType:'HANDS',itemId:2,itemLevel:120}];
const targets=sourceTargets({loot:[{entity:plate,encounterId:2658,encounterName:source.name,difficultyMask:-1},{entity:entity(2,4,4,'HANDS'),encounterId:2655,encounterName:'Emberdawn',difficultyMask:-1}],activity,equipment,loadout:[],context});
assert.equal(targets.length,2);assert.equal(targets[0].slotType,'HEAD');assert(targets.every(t=>t.itemLevel===undefined && t.requiredLevel===undefined && t.deltaDps===undefined && t.verification==='scaling_unverified'),'Catalog base108 is not an obtainable level81 reward');
const unique=entity(55,4,0,'FINGER',49);unique.tooltip.blocks.push({type:'unique_equipped'});
assert.equal(farmCandidate(unique,{...context,slotType:'FINGER_2',currentItemLevel:102},source,[{slotType:'FINGER_1',itemId:55,inventoryType:11,itemSubclassId:0,uniqueEquipped:true}]),null);
const restricted=entity(56);restricted.tooltip.blocks.find(b=>b.type==='item_requirements').required_skill_id=123;
assert.equal(farmCandidate(restricted,{...context,slotType:'HEAD',currentItemLevel:102},source,[]),null);
assert.equal(sortFarmActivities([{...activity,id:'unknown',access:'unlock_unverified',targets},{...activity,id:'available',targets:[]}])[0].id,'available');
let release;const pending=new Promise(r=>{release=r});
const job=enqueueGearFarmJob('owner1',async(signal)=>{await pending;signal.throwIfAborted();return {}});
assert.equal(getGearFarmJob('owner2',job.id),null);assert.equal(cancelGearFarmJob('owner2',job.id),null);
assert.throws(()=>enqueueGearFarmJob('owner1',async()=>({})),/plan_already_running/);
assert.equal(cancelGearFarmJob('owner1',job.id).status,'cancelled');release();await new Promise(r=>setTimeout(r,20));
assert.equal(getGearFarmJob('owner1',job.id).status,'cancelled');
let releaseBlocker;
const blocker = enqueueGearFarmJob('queue-blocker', async signal => {
  await new Promise(resolve => { releaseBlocker = resolve; });
  signal.throwIfAborted();
  return {};
});
let cancelledTasksRun = 0;
for (let index = 0; index < 16; index++) {
  const owner = `cancelled-queue-owner-${index}`;
  const queued = enqueueGearFarmJob(owner, async () => { cancelledTasksRun++; return {}; });
  assert.equal(queued.status, 'queued');
  assert.equal(cancelGearFarmJob(owner, queued.id).status, 'cancelled');
}
const afterCancellations = enqueueGearFarmJob('queue-next-owner', async () => ({}));
assert.equal(afterCancellations.status, 'queued', 'Cancelled queued jobs must immediately release capacity');
cancelGearFarmJob('queue-next-owner', afterCancellations.id);
cancelGearFarmJob('queue-blocker', blocker.id);
releaseBlocker();
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(cancelledTasksRun, 0, 'Cancelled jobs must never start a simulation');
console.log(JSON.stringify({status:'passed',checks:['official alternative unlocks','hard vs recommended gear','difficulty evidence','Fury primary/armor compatibility','current weak-slot priority','unverified scaling never becomes gain','unique/skill requirements','private job ownership and cancellation']}));

// Simulation fixtures exercise evidence gates and comparison behavior only.
// Real loot generation and live DPS are verified separately by the QA runner.
const {confirmFarmImprovements}=await import('../lib/wow/gearFarm/confirmation.ts');
const engine='SimulationCraft test-engine';
function option(id) {
 const candidate=farmCandidate(plate,{...context,slotType:'HEAD',currentItemLevel:102},source,[]);
 candidate.itemId=id;candidate.itemLevel=139;candidate.constraints.requiredLevel=78;
 candidate.variants=[{key:'verified',itemLevel:139,bonusIds:[100],contextId:17,modifiers:[{type:9,value:81}],resolution:{engine,requiredLevel:78,stats:{strength:31}}}];
 return {activityId:activity.id,candidate,variantKey:'verified',target:{...targets[0],itemId:id,itemLevel:139,requiredLevel:78,verification:'variant_verified'}};
}
const options=[option(1001),option(1002),option(1003)];
const preparedCalls=[];
const sim=async prepared=>{
 preparedCalls.push(prepared);
 const dps=prepared.changes.length===0?10000:({1001:10500,1002:9900,1003:10010}[prepared.changes[0].itemId]);
 return {dps,dpsError:10,confidence:95,iterations:750,engine};
};
const simInput={activities:[activity],options,equipment:{equipped_items:[{item:{id:1},slot:{type:'HEAD'}}]},loadout:[{itemId:1,slotType:'HEAD',inventoryType:1,itemSubclassId:4}],specId:72,characterLevel:81,signal:AbortSignal.timeout(5000),simulate:sim};
const confirmed=await confirmFarmImprovements(simInput);
assert.equal(confirmed.simulations,4);assert.equal(options[0].target.verification,'simulated');assert.equal(options[0].target.deltaPercent,5);
assert.equal(options[1].target.verification,'not_upgrade');assert.equal(options[2].target.verification,'not_upgrade','Small positive differences within uncertainty are not upgrades');
assert(preparedCalls.slice(1).every(p=>p.changes.length===1),'Each comparison changes one drop independently');
assert.equal(simInput.equipment.equipped_items[0].item.id,1,'Baseline snapshot must not mutate');
assert.equal(preparedCalls.filter(p=>p.changes.length===0).length,1,'The unchanged baseline runs once');
let invoked=0;
const unknown=await confirmFarmImprovements({...simInput,activities:[{...activity,access:'unlock_unverified'}],simulate:async()=>{invoked++;throw new Error('must_not_run')}});
assert.equal(invoked,0);assert.equal(unknown.simulations,0);
const missing=option(2001);delete missing.candidate.variants[0].resolution;
await assert.rejects(confirmFarmImprovements({...simInput,options:[missing]}),/farm_reward_unverified/);
const high=option(2002);high.candidate.variants[0].resolution.requiredLevel=90;
await assert.rejects(confirmFarmImprovements({...simInput,options:[high]}),/farm_reward_unverified/);
await assert.rejects(confirmFarmImprovements({...simInput,options:[option(2003)],simulate:async()=>({dps:10000,dpsError:10,confidence:95,engine:'SimulationCraft different',iterations:750})}),/simulation_version_changed/);
const controller=new AbortController();controller.abort();await assert.rejects(confirmFarmImprovements({...simInput,signal:controller.signal}),{name:'AbortError'});
console.log(JSON.stringify({status:'passed',confirmedUpgradeChecks:['positive95percent','negative and uncertain excluded','one unchanged baseline','independent drops','unknown access not recommended','required level and native proof','engine agreement','cancellation']}));
