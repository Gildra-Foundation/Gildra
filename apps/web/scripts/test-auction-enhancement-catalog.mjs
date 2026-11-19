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
assert.deepEqual(resolveExactEnhancements(target,{...character,level:70}).coverageGaps,['no_supported_enchant']);
assert.equal(resolveExactEnhancements({...target,itemLevel:119},character).enchantChoices?.some(r=>r.simulationId===8163)??false,false);
const empty=resolveExactEnhancements({...target,inventoryType:12,itemSubclassId:0,socketColors:[0,0,0]},character);
assert(empty.verified); assert.equal(empty.enchantApplicable,false); assert.deepEqual(empty.enchantChoices,[]);
assert.deepEqual(empty.gemChoices,{});
// Auction candidates from the saved Eversong run, including both sides of native level limits.
for (const [itemId,inventoryType,itemSubclassId,itemLevel,scrollId,spellId] of [
  [7918,3,4,13,38375,3329], [20818,11,0,11,110617,5284], [20950,2,0,12,110624,5285],
]) {
  const resolved = resolveExactEnhancements({...target,itemId,inventoryType,itemSubclassId,itemLevel,socketColors:[0,0,0]},character);
  assert(resolved.verified && resolved.enchantApplicable);
  const scroll = resolved.enchantChoices.find(row => row.consumableItemId === scrollId);
  assert.equal(scroll.simulationId,spellId);
  assert(scroll.sourceRowIds.includes(`SpellItemEnchantment:${spellId}`));
  assert(snapshot.nativeRules.some(rule => rule.enchantId === spellId && rule.inventoryMask === scroll.inventoryMask));
}
const socketedRing={...target,itemId:173131,inventoryType:11,itemSubclassId:0,itemLevel:35};
const ring=resolveExactEnhancements(socketedRing,character);
assert(ring.verified && ring.enchantApplicable);
const doublet=ring.gemChoices['0'].find(row=>row.consumableItemId===173121);
assert.equal(doublet.simulationId,173121);
assert.deepEqual(doublet.sourceRowIds,['ItemSparse:173121','GemProperties:3821','SpellItemEnchantment:6236']);
assert(!ring.gemChoices['0'].some(row=>row.consumableItemId===240967));
const highNeck=resolveExactEnhancements({...target,itemId:258911,inventoryType:2,itemSubclassId:0,itemLevel:159},character);
assert(highNeck.verified && !highNeck.enchantApplicable && highNeck.gemChoices['0'].length>0);
const lowRing=resolveExactEnhancements({...socketedRing,itemId:20906,itemLevel:8,socketColors:[0,0,0]},character);
assert(lowRing.verified && !lowRing.enchantApplicable);
const belt=resolveExactEnhancements({...target,itemId:237919,inventoryType:6,itemLevel:210,socketColors:[0,0,0]},character);
assert.deepEqual(belt,{verified:true,enchantApplicable:true,enchantChoices:[],gemChoices:{},coverageGaps:['no_supported_enchant']});
const socketedLowRing=resolveExactEnhancements({...socketedRing,itemId:20906,itemLevel:8},character);
assert(socketedLowRing.verified && !socketedLowRing.enchantApplicable);
const spheres=socketedLowRing.gemChoices['0'].filter(row=>[22459,22460].includes(row.consumableItemId));
assert.deepEqual(spheres.map(r=>r.simulationId),[22459,22460],'two consumable gem IDs can share an enchant effect');
assert(spheres.every(r=>r.sourceRowIds.includes('SpellItemEnchantment:5233')));
assert(!socketedLowRing.gemChoices['0'].some(row=>row.consumableItemId===173121));
assert(socketedLowRing.gemChoices['0'].find(row=>row.consumableItemId===49110).uniqueEquipped);

const weapon={...target,itemId:260907,inventoryType:17,itemClassId:2,itemSubclassId:8,itemLevel:1,socketColors:[0,0,0]};
const lowWeapon=resolveExactEnhancements(weapon,character);
const chain=lowWeapon.enchantChoices.find(row=>row.consumableItemId===6041);
assert.equal(chain.simulationId,37);
assert.deepEqual(chain.sourceRowIds,['ItemSparse:6041','ItemXItemEffect:688','ItemEffect:651','SpellEffect:2678','SpellEquippedItems:113','SpellItemEnchantment:37']);
assert(!resolveExactEnhancements({...weapon,itemLevel:81},character).enchantChoices.some(row=>row.consumableItemId===6041));
assert(!resolveExactEnhancements({...weapon,itemClassId:4,inventoryType:12,itemSubclassId:0},character).enchantChoices.length);
const gloves={...target,inventoryType:10,itemClassId:4,itemSubclassId:4,itemLevel:253,socketColors:[0,0,0]};
const gloveScrolls=faction=>resolveExactEnhancements(gloves,{...character,faction});
assert(gloveScrolls().coverageGaps.includes('faction_unverified'));
assert(!gloveScrolls().enchantChoices.some(row=>row.consumableItemId===153430));
assert(!gloveScrolls('HORDE').enchantChoices.some(row=>row.consumableItemId===153430));
assert(gloveScrolls('ALLIANCE').enchantChoices.some(row=>row.consumableItemId===153430));
const scopes=resolveExactEnhancements({...weapon,inventoryType:26,itemSubclassId:3,itemLevel:20},character);
assert(scopes.enchantChoices.some(row=>row.consumableItemId===4405 && row.simulationId===30),'historic scopes use consumable class 0');
const chainBOE=records.find(row=>row.consumableItemId===55057);
assert.equal(sourceNames.get(chainBOE.consumableItemId),'Pyrium Weapon Chain');
assert.equal(snapshot.rows.find(row=>row.table==='ItemSparse' && row.id===55057).payload.Bonding,'2');
assert(!ids.includes(87581),'bind-on-pickup shoulder inscription cannot be purchased');

// Engineering use spells cannot stack with another use effect on the target.
const engineer = { level:90, professions:[{id:2504,rank:75}] };
const beltTarget = {...target, inventoryType:6, itemLevel:150, socketColors:[14,0,0]};
const unknownUse = resolveExactEnhancements(beltTarget,engineer);
assert(unknownUse.coverageGaps.includes('target_effects_unverified'));
assert(unknownUse.gemChoices['0'].length && !unknownUse.enchantChoices.some(r=>r.consumableItemId===40776));
const occupiedUse = resolveExactEnhancements({...beltTarget,hasOnUseEffect:true},engineer);
assert(!occupiedUse.enchantChoices.some(r=>r.consumableItemId===40776));
assert(!occupiedUse.coverageGaps.includes('target_effects_unverified'));
const freeUse = resolveExactEnhancements({...beltTarget,hasOnUseEffect:false},engineer);
assert(freeUse.enchantChoices.some(r=>r.consumableItemId===40776));
assert(lookupInstalled('enchant',3599).verified);
// DB2 MaxLevel is a scaling cap. Only ItemLevelMax bounds this scroll's target.
assert.equal(snapshot.rows.find(row=>row.table==='SpellItemEnchantment' && row.id===37).payload.MaxLevel,'50');
assert(resolveExactEnhancements({...weapon,itemLevel:80},character).enchantChoices.some(r=>r.consumableItemId===6041));
const restricted = snapshot.rows.find(row=>row.table==='ItemSparse' && row.id===6041).payload;
try {
  restricted.RequiredPVPRank='1';
  const gated = await import('../lib/wow/auctionEnhancementCatalog.ts?pvp-requirement');
  assert(!gated.resolveExactEnhancements(weapon,character).enchantChoices.some(r=>r.consumableItemId===6041));
} finally { restricted.RequiredPVPRank='0'; }
// Preserve the negative case even as pinned low-level gem coverage grows.
const originalRows=snapshot.rows;
try {
  snapshot.rows=originalRows.filter(row=>row.table!=='GemProperties');
  const missing=await import('../lib/wow/auctionEnhancementCatalog.ts?missing-gem-properties');
  const noGem=missing.resolveExactEnhancements({...socketedRing,itemLevel:8},character);
  assert(noGem.verified);
  assert.deepEqual(noGem.gemChoices,{'0':[]});
  assert.deepEqual(noGem.coverageGaps,['no_supported_gem']);
} finally { snapshot.rows=originalRows; }
// Missing native rules or level bounds must never turn an incomplete source into a verified empty slot.
const removedRule=snapshot.nativeRules.pop();
try {
  assert.equal(resolveExactEnhancements({...target,inventoryType:12,itemSubclassId:0},character).reason,'enchant_applicability_unknown');
} finally { snapshot.nativeRules.push(removedRule); }
const neckLimits=snapshot.rows.find(row=>row.table==='SpellItemEnchantment' && row.id===5285).payload;
const savedMax=neckLimits.ItemLevelMax;
try {
  delete neckLimits.ItemLevelMax;
  assert.equal(resolveExactEnhancements({...target,inventoryType:2,itemSubclassId:0},character).reason,'enchant_applicability_unknown');
} finally { neckLimits.ItemLevelMax=savedMax; }
const dragonflight = lookupInstalled('enchant',6614);
assert.equal(dragonflight.enhancement.consumableItemId,199943);
assert(dragonflight.enhancement.sourceRowIds.includes('CraftingDataEnchantQuality@12.1.5.70783:81'));
assert.deepEqual(snapshot.rankedRejected.map(r=>r.itemId),[223664,223665]);
assert(!ids.includes(225652));
for (const [itemId,verifiedRow,rejectedRow] of [[223664,194,327],[223665,195,328]]) {
  const mapped = records.find(r=>r.consumableItemId===itemId);
  assert(mapped.sourceRowIds.includes(`CraftingDataEnchantQuality@12.1.5.70783:${verifiedRow}`));
  assert(!snapshot.rankedCompatibilityProofs.some(proof=>proof.qualityRowId===rejectedRow));
}
const retained=lookupInstalled('enchant',6194);
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
