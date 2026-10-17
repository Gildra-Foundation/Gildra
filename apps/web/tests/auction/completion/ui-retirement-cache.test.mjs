import assert from 'node:assert/strict';
import { clearAcknowledgedAuctionClientCache, readAuctionClientCache, writeAuctionClientCache } from '../../../lib/wow/auctionGearClient.ts';
const storage=new Map();
globalThis.sessionStorage={ getItem:key=>storage.get(key)??null, setItem:(key,value)=>storage.set(key,String(value)), removeItem:key=>storage.delete(key) };
const key='gildra:auction:v1:synthetic:fury-warrior:en',nonce='synthetic-request-owner-0001';
const intent={characterSlug:'synthetic',locale:'en',budgetGold:'9000',scenario:'aoe',objective:'value',selectedSlots:['HEAD']};
const saved={version:1,profileKey:'profile-0',searchId:'search-0',jobId:'job-0',clientRequestId:nonce,mode:'assembly',excludedOptionIds:['physical-lot:HEAD'],excludedVariantKeys:['[123,"exact-variant"]'],formIntent:intent,cancellationRequested:true};
const owner={profileKey:'profile-0',jobId:'job-0',clientRequestId:nonce};
const completed=[];
function check(name,body){storage.clear();body();completed.push(name);}
check('ACK clears only owned handles and retains the latest saved intent/exclusions/checkpoint',()=>{
 writeAuctionClientCache(key,saved);assert.equal(clearAcknowledgedAuctionClientCache(key,owner),true);
 const after=readAuctionClientCache(key);assert.equal(after.searchId,'search-0');assert.deepEqual(after.formIntent,intent);assert.deepEqual(after.excludedOptionIds,saved.excludedOptionIds);assert.deepEqual(after.excludedVariantKeys,saved.excludedVariantKeys);assert.equal(after.mode,'assembly');assert.equal(after.clientRequestId,undefined);assert.equal(after.jobId,undefined);assert.equal(after.cancellationRequested,undefined);
});
for(const [name,change]of [['new profile',{profileKey:'profile-1'}],['new request',{clientRequestId:'synthetic-request-newer-0002'}],['new job',{jobId:'job-1'}]])check(`Old ACK never rewrites ${name} at the same scope key`,()=>{
 const replacement={...saved,...change};writeAuctionClientCache(key,replacement);const before=storage.get(key);assert.equal(clearAcknowledgedAuctionClientCache(key,owner),false);assert.equal(storage.get(key),before);
});
check('ACK removes a matching pending first-search record with no checkpoint',()=>{
 writeAuctionClientCache(key,{...saved,searchId:undefined,jobId:undefined});assert.equal(clearAcknowledgedAuctionClientCache(key,{profileKey:'profile-0',clientRequestId:nonce}),true);assert.equal(storage.has(key),false);
});
check('Legacy known-job cache without nonce remains safely acknowledgeable',()=>{
 writeAuctionClientCache(key,{...saved,clientRequestId:undefined});assert.equal(clearAcknowledgedAuctionClientCache(key,{profileKey:'profile-0',jobId:'job-0'}),true);assert.equal(readAuctionClientCache(key).jobId,undefined);
});
check('An owner with no handle cannot clear a saved cancellation request',()=>{
 writeAuctionClientCache(key,saved);const before=storage.get(key);assert.equal(clearAcknowledgedAuctionClientCache(key,{profileKey:'profile-0'}),false);assert.equal(storage.get(key),before);
});
check('An ACK cannot resurrect an already removed cache',()=>{assert.equal(clearAcknowledgedAuctionClientCache(key,owner),false);assert.equal(storage.has(key),false);});
console.log(JSON.stringify({status:'passed',cases:completed.length,completed}));
