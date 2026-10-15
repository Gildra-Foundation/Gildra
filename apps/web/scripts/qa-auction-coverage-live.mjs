import {readFile,writeFile} from 'node:fs/promises';
import {lookupGearRecords,gearEntityDetails,currentGearSeason} from '../lib/wow/gearCandidateRepository.ts';
import {normalizeGearCandidate,gearSlotCategoryPaths,catalogLoadoutItem} from '../lib/wow/gearCandidates.ts';
import {validateGearLoadout} from '../lib/wow/gearCompatibility.ts';
import {matchAuctionVariant} from '../lib/wow/auctionMarket.ts';
const {character,armory,market}=JSON.parse(await readFile('../../.artifacts/auction-live/real-data.json','utf8'));
const baselineRecords=await lookupGearRecords(armory.equipment.equipped_items.map(i=>i.item.id),'en_US');
const baselineEntities=await gearEntityDetails(baselineRecords,'en_US',false);
const loadout=armory.equipment.equipped_items.map(i=>catalogLoadoutItem(baselineEntities.find(e=>e.externalId===i.item.id),i.slot.type));
try{validateGearLoadout(loadout,armory.activeSpecializationId);console.log('Baseline constraints passed');}catch(e){console.log(JSON.stringify({baselineError:e.message,loadout}));}
const budget=100000000;
const affordable=market.offers.filter(o=>o.buyoutCopper<=budget);
const ids=[...new Set(affordable.sort((a,b)=>a.buyoutCopper-b.buyoutCopper).map(o=>o.itemId))];
const records=(await Promise.all([2,4].map(c=>lookupGearRecords(ids,'en_US',c)))).flat();
const byId=new Map(records.map(r=>[r.externalId,r]));
const entities=await gearEntityDetails(ids.flatMap(id=>byId.has(id)?[byId.get(id)]:[]).slice(0,500),'en_US',false);
const reasons={},items=[],matched=[],eligibleOffers=[];
for(const entity of entities){
 const slots=[];let representative;
 for(const slotType of Object.keys(gearSlotCategoryPaths)){
  const c=normalizeGearCandidate(entity,{classId:character.playableClass.id,specId:armory.activeSpecializationId,characterLevel:character.level,raceId:character.playableRace.id,faction:character.faction.type,slotType,currentItemLevel:0,anchorItemClassId:-1,anchorItemSubclassId:-1,season:currentGearSeason(),acquisition:{type:'auction',evidence:'auction'}});
  if(!c.rejectionReasons.includes('slot_mismatch'))representative??=c;
  if(c.eligible){slots.push(slotType);for(const o of affordable.filter(o=>o.itemId===entity.externalId)){
   eligibleOffers.push({auctionId:o.auctionId,itemId:o.itemId,slot:slotType,modifiers:o.modifiers});if(matchAuctionVariant(o,c))matched.push(o.auctionId);
  }}
 }
 const offers=affordable.filter(o=>o.itemId===entity.externalId);
 if(!slots.length&&representative)for(const reason of representative.rejectionReasons)reasons[reason]=(reasons[reason]??0)+1;
 const variantBlock=entity.tooltip?.blocks?.find(b=>b.type==='item_variants');
 items.push({id:entity.externalId,name:entity.name,slots,reasons:slots.length?[]:representative?.rejectionReasons,variants:variantBlock?.entries?.length??0,variantSamples:variantBlock?.entries?.slice(0,3),offerSamples:offers.slice(0,2),registry:entity.tooltip?.blocks?.find(b=>b.type==='item_registry'),requirements:entity.tooltip?.blocks?.find(b=>b.type==='item_requirements')});
}
const summary={character:{name:character.name,level:character.level},marketUpdatedAt:market.sourceUpdatedAt,budgetGold:10000,totalLots:market.offers.length,affordableLots:affordable.length,affordableItemIds:ids.length,equipmentRecords:records.length,itemsDetailed:entities.length,rejectedItems:reasons,eligibleItems:items.filter(i=>i.slots.length).length,eligibleLots:[...new Set(eligibleOffers.map(o=>o.auctionId))].length,eligibleLotsWithoutModifiers:[...new Set(eligibleOffers.filter(o=>!o.modifiers.length).map(o=>o.auctionId))].length,exactMatchedLots:[...new Set(matched)].length,itemsWithNoVariants:items.filter(i=>!i.variants).length};
await writeFile('../../.artifacts/auction-live/coverage.json',JSON.stringify({summary,items},null,2),{mode:0o600});console.log(JSON.stringify(summary,null,2));
console.log(JSON.stringify({eligibleSamples:items.filter(i=>i.slots.length).slice(0,3).map(i=>({id:i.id,name:i.name,slots:i.slots,variants:i.variants,variantSamples:i.variantSamples?.map(v=>({key:v.key,context:v.context_id,bonuses:v.bonus_list_ids,itemLevel:v.item_level})),offers:i.offerSamples}))},null,2));
