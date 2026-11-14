import assert from 'node:assert/strict';
import snapshot from '../data/wow/auction-enhancements/catalog.json' with {type:'json'};
import { auctionEnhancementCatalogInfo as info, auctionEnhancementRecords as records,
  auctionEnhancementConsumableIds as ids, lookupInstalled, resolveExactEnhancements } from '../lib/wow/auctionEnhancementCatalog.ts';

const target = {itemId:271878,inventoryType:7,itemClassId:4,itemSubclassId:4,itemLevel:300,
  socketColors:[14,0,0],engine:'SimulationCraft',build:info.build,revision:info.simcRevision};
const character = {level:90,professions:[]};
const sourceNames = new Map(snapshot.rows.filter(r=>r.table==='ItemSparse').map(r=>[r.id,r.payload.Display_lang]));
for (const record of records) {
  assert(record.name?.trim(), 'purchasable records must have a source display name');
  assert.equal(record.name,sourceNames.get(record.consumableItemId));
}
// Real local DB2 chains, not invented IDs or generated adjacency/name matches.
const armor = records.find(r=>r.consumableItemId===244643);
assert.equal(armor.simulationId,8163); assert.equal(armor.rank,2);
assert(armor.sourceRowIds.includes('SpellEffect:1244494'));
assert.equal(armor.minItemLevel,120);
const diamond=lookupInstalled('gem',240967);
assert(diamond.verified); assert.equal(diamond.enhancement.simulationId,240967);
assert.equal(diamond.enhancement.name,'Powerful Eversong Diamond');
assert.equal(diamond.enhancement.gemPropertiesId,4408);
assert(diamond.enhancement.sourceRowIds.includes('SpellItemEnchantment:8556'));
assert.deepEqual(diamond.enhancement.category,{id:698,limit:1});
assert.equal(ids.length,new Set(ids).size);
const ranked=records.find(r=>r.consumableItemId===244010);
assert.equal(ranked.simulationId,8020); assert.equal(ranked.rank,1);
assert.equal(records.find(r=>r.consumableItemId===244011).simulationId,8021);
assert.equal(ranked.mappingBuild,'12.1.5.70783');
assert(ranked.sourceRowIds.includes('CraftingDataEnchantQuality@12.1.5.70783:479'));
const result=resolveExactEnhancements(target,character);
assert(result.verified); assert(result.enchantApplicable);
assert(result.enchantChoices.some(r=>r.simulationId===8163));
assert.deepEqual(Object.keys(result.gemChoices),['0']);
assert(result.gemChoices['0'].some(r=>r.consumableItemId===240967));
assert(result.enchantChoices.every(r=>r.consumableItemId>0));
assert.equal(resolveExactEnhancements({...target,revision:'unverified'},character).verified,false);
assert.equal(resolveExactEnhancements({...target,build:'12.1.5.70783'},character).verified,false);
assert.equal(resolveExactEnhancements({...target,socketColors:[1,0,0]},character).verified,false);
assert.equal(resolveExactEnhancements({...target,socketColors:[]},character).verified,false);
for (const inventoryType of [1,5,11]) {
  const choice=resolveExactEnhancements({...target,inventoryType,itemSubclassId:inventoryType===11?0:4},character);
  assert(choice.verified && choice.enchantApplicable && choice.enchantChoices.length>0);
  assert(choice.enchantChoices.every(r=>r.mappingBuild==='12.1.5.70783'));
}
const wrist=resolveExactEnhancements({...target,inventoryType:9,socketColors:[0,0,0]},character);
assert(wrist.verified && wrist.enchantChoices.some(r=>r.consumableItemId===172416&&r.simulationId===6222));
assert(wrist.enchantChoices.every(r=>r.maxItemLevel===0||r.maxItemLevel>=300));
assert.equal(resolveExactEnhancements(target,{...character,level:70}).reason,'no_supported_enchant');
assert.equal(resolveExactEnhancements({...target,itemLevel:119},character).enchantChoices?.some(r=>r.simulationId===8163)??false,false);
const empty=resolveExactEnhancements({...target,inventoryType:12,itemSubclassId:0,socketColors:[0,0,0]},character);
assert(empty.verified); assert.equal(empty.enchantApplicable,false); assert.deepEqual(empty.enchantChoices,[]);
assert.deepEqual(empty.gemChoices,{});
const retained=lookupInstalled('enchant',6108);
assert(retained.verified); assert.equal(retained.enhancement.consumableItemId,0);
assert.equal(lookupInstalled('gem',8556).verified,false, 'gem lookup takes item ID, not enchant ID');
assert.equal(lookupInstalled('enchant',99999999).verified,false);
assert.equal(lookupInstalled('gem',99999999).verified,false);
assert.equal(info.completeness,'supported_subset');
// A ranked source row alone is insufficient: dropping its parity proof closes only that mapping.
const savedProofs=snapshot.rankedCompatibilityProofs;
try {
  snapshot.rankedCompatibilityProofs=savedProofs.filter(p=>p.itemId!==244010);
  const gated=await import('../lib/wow/auctionEnhancementCatalog.ts?missing-proof');
  assert(!gated.auctionEnhancementConsumableIds.includes(244010));
  assert(gated.auctionEnhancementConsumableIds.includes(244011));
} finally { snapshot.rankedCompatibilityProofs=savedProofs; }
console.log(`enhancement catalog: verified ${info.coverage.gems} gem mappings, ${info.coverage.enchants} enchant mappings; positive/negative contracts passed`);
