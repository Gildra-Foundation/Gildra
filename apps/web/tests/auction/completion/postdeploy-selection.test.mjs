import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import * as store from '../../../lib/wow/auctionGearSearchStore.ts';
import {selectedAuctionGearAssemblyOptions} from '../../../lib/wow/auctionGearRunner.ts';
import {auctionVariantKey} from '../../../lib/wow/auctionItemVariant.ts';

assert.equal(process.env.GILDRA_AUCTION_STATE_DIR,undefined,'No production checkpoint directory');
const token='offline-postdeploy-selection-owner',owner=createHash('sha256').update(`battle-net:${token}`).digest('hex');
const state={token,select:selectedAuctionGearAssemblyOptions,calls:[],hold:null};
globalThis.__postdeploySelection=state;
const moduleURL=source=>`data:text/javascript,${encodeURIComponent(source)}`;
const hooks=registerHooks({resolve(specifier,context,next){
 if(specifier==='@/auth')return{url:moduleURL('export async function auth(){return {battleNetAccessToken:globalThis.__postdeploySelection.token}}'),shortCircuit:true};
 if(specifier==='@/lib/wow/auctionGearRunner')return{url:moduleURL(`const s=globalThis.__postdeploySelection;export const selectedAuctionGearAssemblyOptions=(...a)=>s.select(...a);export const assembleAuctionGearSearch=async(entry,selection)=>{s.calls.push(selection);if(s.hold)await s.hold;return{kind:'assembly',searchId:entry.id,purchases:[]}};export const verifyAuctionGearSearch=async()=>{};export const startAuctionGearSearch=async()=>{throw Error('unexpected_start')};export const continueAuctionGearSearch=async()=>{throw Error('unexpected_resume')}`),shortCircuit:true};
 if(specifier==='next/server')return next('next/server.js',context);return next(specifier,context);
}});
const route=await import('../../../app/api/wow/auction-gear-plans/route.ts');
const savedFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Unexpected network in offline contract test');};
const entries=[];let nonce=0;
const options=Array.from({length:20001},(_,i)=>{
 const itemId=123456+i%1001,bonusIds=[1+Math.floor(i/1001)],variantKey=auctionVariantKey({itemId,contextId:0,bonusIds,modifiers:[]});
 return{id:`${i+1}:WRIST:${variantKey}`,auctionId:i+1,quantity:1,costCopper:100,variantKey,candidate:{itemId,slotType:'WRIST',eligible:true,variants:[{key:variantKey,itemLevel:100,contextId:0,bonusIds,modifiers:[]}]}};
});
const variant=option=>JSON.stringify([option.candidate.itemId,option.variantKey]);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const create=(pool=options)=>{const entry=store.createAuctionGearSearch(owner,{input:{characterSlug:'offline-owned',locale:'en',scenario:'single-target',budgetCopper:100000000},options:pool});entries.push(entry);return entry;};
const send=async(body,raw=false)=>{const text=raw?body:JSON.stringify(body);const r=await route.POST(new Request('https://gildra.example/api/wow/auction-gear-plans',{method:'POST',headers:{host:'gildra.example',origin:'https://gildra.example'},body:text}));return{status:r.status,body:await r.json(),bytes:Buffer.byteLength(text)};};
const request=(entry,selection)=>({action:'assemble',searchId:entry.id,...selection,clientRequestId:`offline-large-selection-${++nonce}`});
const transport=()=>import('../../../lib/wow/auctionGearSelectionTransport.ts');
after(()=>{for(const entry of entries)store.deleteAuctionGearSearch(owner,entry.id);hooks.deregister();delete globalThis.__postdeploySelection;globalThis.fetch=savedFetch;});

test('11001 owned variants can exclude 11000 using the original wire contract',async()=>{
 const entry=create(options.slice(0,11001)),selection={excludedOptionIds:[],excludedVariantKeys:entry.context.options.slice(0,11000).map(variant)};
 assert.equal(selectedAuctionGearAssemblyOptions(entry,selection).length,1);
 const body=request(entry,selection),response=await send(body);assert.equal(response.status,202,JSON.stringify(response.body));assert(response.bytes>512*1024);await tick();
 const {encodeAuctionGearSelectionTransport:encode}=await transport();const replay=await send(encode(body));assert.equal(replay.status,202);assert.equal(replay.body.id,response.body.id);
});

test('full 20k physical plus 20k variant exclusions fit 4MiB, preserve domain and replay across encodings',async()=>{
 const {encodeAuctionGearSelectionTransport:encode,decodeAuctionGearSelectionTransport:decode,auctionGearSelectionBodyLimit}=await transport();
 assert.equal(auctionGearSelectionBodyLimit,4*1024*1024);
 const entry=create(),selection={excludedOptionIds:options.slice(0,20000).map(o=>o.id),excludedVariantKeys:options.slice(0,20000).map(variant)};
 const body=request(entry,selection),original=structuredClone(body),wire=encode(body);
 assert.deepEqual(body,original,'Encoding cannot alter cache/recovery intent');assert.deepEqual(wire.excludedOptionIds,body.excludedOptionIds);
 assert.equal(wire.excludedVariantKeys.length,0);assert.equal(wire.excludedVariantIds.length,20000);assert.deepEqual(decode(wire),body);
 assert(Buffer.byteLength(JSON.stringify(body))<3*1024*1024);assert(Buffer.byteLength(JSON.stringify(wire))<3*1024*1024);
 const response=await send(wire);assert.equal(response.status,202,JSON.stringify(response.body));await tick();
 const replay=await send(body);assert.equal(replay.status,202,JSON.stringify(replay.body));assert.equal(replay.body.id,response.body.id);
 assert.equal((await send({...body,excludedVariantKeys:body.excludedVariantKeys.slice(1)})).status,400,'Changed intent cannot reuse nonce');
 assert.deepEqual(entry.excludedVariantKeys,selection.excludedVariantKeys);assert.deepEqual(state.calls.at(-1),selection);
 const future={...options[20000],id:'future:WRIST:variant',candidate:{...options[20000].candidate,itemId:999999}};
 entry.context.options=[...options,future];assert.equal(selectedAuctionGearAssemblyOptions(entry,selection).length,2,'New variants stay available: exclusions are not an allowlist');
});

test('mixed legacy and canonical keys are lossless and canonicalized before nonce fingerprinting',async()=>{
 const {encodeAuctionGearSelectionTransport:encode,decodeAuctionGearSelectionTransport:decode}=await transport();
 const legacy={id:'legacy-lot',variantKey:'legacy-variant',candidate:{itemId:42}},entry=create([options[0],legacy,options[1]]);
 const keys=[variant(options[0]),variant(legacy)],body=request(entry,{excludedOptionIds:[],excludedVariantKeys:keys});
 const wire=encode(body);assert.deepEqual(wire.excludedVariantKeys,[variant(legacy)]);assert.deepEqual(new Set(decode(wire).excludedVariantKeys),new Set(keys));
 const r=await send(wire);assert.equal(r.status,202,JSON.stringify(r.body));await tick();assert.equal((await send(body)).body.id,r.body.id);
 const untouched={action:'resume',searchId:entry.id};assert.deepEqual(encode(untouched),untouched);assert.deepEqual(decode(untouched),untouched);
});

test('compact tuples reject malformed values, duplicate identities and oversized cardinality',async()=>{
 const entry=create(options.slice(0,2)),hash=options[0].variantKey.slice(8),tuple=[options[0].candidate.itemId,hash];
 const invalid=[null,'bad',{},[[0,hash]],[[-1,hash]],[[1.5,hash]],[[Number.MAX_SAFE_INTEGER+1,hash]],[['123456',hash]],[[123456,'a'.repeat(31)]],[[123456,'A'.repeat(32)]],[[123456,'z'.repeat(32)]],[[123456,hash,'extra']],[tuple,tuple],Array.from({length:20001},(_,i)=>[i+1,hash])];
 for(const excludedVariantIds of invalid){const r=await send(request(entry,{excludedOptionIds:[],excludedVariantIds}));assert.equal(r.status,400,JSON.stringify(excludedVariantIds).slice(0,120));assert.equal(r.body.error,'invalid_auction_selection');}
 const mixed=await send(request(entry,{excludedOptionIds:[],excludedVariantKeys:[variant(options[0])],excludedVariantIds:[tuple]}));assert.equal(mixed.status,400);assert.equal(mixed.body.error,'invalid_auction_selection');
 const combined=await send(request(entry,{excludedOptionIds:[],excludedVariantKeys:Array.from({length:20000},(_,i)=>`legacy-${i}`),excludedVariantIds:[tuple]}));assert.equal(combined.status,400);assert.equal(combined.body.error,'invalid_auction_selection');
});

test('normalization preserves server ownership and action validation',async()=>{
 const entry=create(options.slice(0,2)),tuple=[options[0].candidate.itemId,options[0].variantKey.slice(8)];
 const valid=request(entry,{excludedOptionIds:[],excludedVariantIds:[tuple]});
 assert.equal((await send({...valid,excludedVariantIds:[[999999,'f'.repeat(32)]]})).status,400,'Foreign variant is not in this search');
 assert.equal((await send({...valid,excludedOptionIds:['foreign-lot']})).status,400);
 assert.equal((await send({...valid,excludedOptionIds:undefined})).status,400,'Variants require the explicit exclusion selector');
 for(const action of ['search','resume'])assert.equal((await send({...valid,action})).status,400,'Compact field is assembly-only');
 state.token='foreign-owner';try{assert.equal((await send(valid)).status,404);}finally{state.token=token;}
 const accepted=await send(valid);assert.equal(accepted.status,202,JSON.stringify(accepted.body));await tick();
});

test('body bound is 4MiB for both legacy and compact requests',async()=>{
 const tooLarge=await send('{'.repeat(4*1024*1024+1),true);assert.equal(tooLarge.status,413);assert.equal(tooLarge.body.error,'request_too_large');
 const exact=await send('{'.repeat(4*1024*1024),true);assert.equal(exact.status,400);assert.equal(exact.body.error,'invalid_plan_request','Exactly-bound malformed JSON passes size check');
});
