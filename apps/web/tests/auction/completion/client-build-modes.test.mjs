/** Goal and recovery contract fixtures only; no account, jobs or native execution. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {parseAuctionClientFormIntent,writeAuctionClientCache,readAuctionClientCache} from '../../../lib/wow/auctionGearClient.ts';
import {auctionGearResults} from '../../../lib/wow/auctionGearResult.ts';
import {assemblyResult} from '../reliability/ui-fixtures.ts';
const intent={characterSlug:'synthetic',locale:'en',budgetGold:'10000',scenario:'single-target',objective:'value',selectedSlots:['WRIST']};
const original=sessionStorageSafe();
function sessionStorageSafe(){try{return globalThis.sessionStorage;}catch{return undefined;}}
test.afterEach(()=>{if(original===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=original;});
test('new accepted goals are explicit; absent legacy intent stays absent and malformed goals fail',()=>{
 for(const enhancementMode of ['equipment','enhanced'])assert.equal(parseAuctionClientFormIntent({...intent,enhancementMode}).enhancementMode,enhancementMode);
 assert.equal(parseAuctionClientFormIntent(intent).enhancementMode,undefined);
 for(const enhancementMode of [null,'quick','full','',{},false])assert.equal(parseAuctionClientFormIntent({...intent,enhancementMode}),null);
});
test('quick/full/enhanced selection and accepted goal survive the exact scoped recovery cache',()=>{
 const rows=new Map();globalThis.sessionStorage={getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};
 for(const buildMode of ['quick','full','enhanced']){
  const formIntent=parseAuctionClientFormIntent({...intent,enhancementMode:buildMode==='enhanced'?'enhanced':'equipment'});
  writeAuctionClientCache('owned-scope',{version:1,profileKey:'snapshot',searchId:'owned-search',mode:'search',excludedOptionIds:['excluded-lot'],excludedVariantKeys:['excluded-variant'],buildMode,formIntent});
  const restored=readAuctionClientCache('owned-scope');assert.equal(restored.buildMode,buildMode);assert.deepEqual(restored.formIntent,formIntent);assert.deepEqual(restored.excludedOptionIds,['excluded-lot']);assert.deepEqual(restored.excludedVariantKeys,['excluded-variant']);
 }
 assert.equal(readAuctionClientCache('other-scope'),null);
 const saved=JSON.parse(rows.get('owned-scope'));rows.set('owned-scope',JSON.stringify({...saved,buildMode:'unbounded'}));assert.equal(readAuctionClientCache('owned-scope'),null);
});
test('explicit equipment goal has exact item total/remaining and leaves measured loadout facts unchanged',()=>{
 const assembly=assemblyResult({complete:true});const equipment=auctionGearResults({...assembly,enhancementMode:'equipment'});const legacy=auctionGearResults(assembly);const enhanced=auctionGearResults({...assembly,enhancementMode:'enhanced'});
 assert.equal(equipment.length,legacy.length);
 for(let i=0;i<equipment.length;i++){
  const row=equipment[i];assert.equal(row.totalCopper,row.itemsCopper);assert.equal(row.remainingCopper,assembly.budgetCopper-row.itemsCopper);assert.equal(row.gemsCopper,0);assert.equal(row.enchantsCopper,0);
  assert.deepEqual(row.purchases,legacy[i].purchases);assert.deepEqual(row.comparison,legacy[i].comparison);assert.equal(row.key,legacy[i].key);assert.equal(row.significant,legacy[i].significant);
  assert.equal(legacy[i].totalCopper,null);assert.equal(legacy[i].remainingCopper,null);assert.equal(enhanced[i].totalCopper,null);assert.equal(enhanced[i].remainingCopper,null);
 }
});
