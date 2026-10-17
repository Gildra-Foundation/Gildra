import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import * as store from '../../../lib/wow/auctionGearSearchStore.ts';
import * as jobs from '../../../lib/wow/auctionGearJobs.ts';
import {selectedAuctionGearAssemblyOptions} from '../../../lib/wow/auctionGearRunner.ts';
const token='synthetic-objective-selection-token',owner=createHash('sha256').update(`battle-net:${token}`).digest('hex');
const moduleURL=s=>`data:text/javascript,${encodeURIComponent(s)}`;const calls=[];
globalThis.__objectiveSelection={select:selectedAuctionGearAssemblyOptions,start:async input=>{calls.push(input);return{kind:'search',searchId:'synthetic-objective-search',objective:input.objective};},assemble:async entry=>({kind:'assembly',searchId:entry.id})};
const hook=registerHooks({resolve(specifier,context,next){
 if(specifier==='@/auth')return{url:moduleURL(`export async function auth(){return {battleNetAccessToken:${JSON.stringify(token)}}}`),shortCircuit:true};
 if(specifier==='@/lib/wow/auctionGearRunner')return{url:moduleURL(`const s=globalThis.__objectiveSelection;export const selectedAuctionGearAssemblyOptions=(...a)=>s.select(...a);export const startAuctionGearSearch=(...a)=>s.start(...a);export const verifyAuctionGearSearch=async()=>{};export const assembleAuctionGearSearch=(...a)=>s.assemble(...a);export const continueAuctionGearSearch=async()=>{throw Error('unexpected_resume')}`),shortCircuit:true};
 if(specifier==='next/server')return next('next/server.js',context);return next(specifier,context);
}});
const route=await import('../../../app/api/wow/auction-gear-plans/route.ts');
const tick=()=>new Promise(r=>setImmediate(r));
const send=async body=>{const response=await route.POST(new Request('https://gildra.example/api/wow/auction-gear-plans',{method:'POST',headers:{host:'gildra.example',origin:'https://gildra.example'},body:JSON.stringify(body)}));return{status:response.status,body:await response.json()};};
try{
 const key=JSON.stringify([1,'a']),key2=JSON.stringify([2,'b']);
 const entry=store.createAuctionGearSearch(owner,{input:{characterSlug:'synthetic',locale:'en',scenario:'single-target',objective:'value'},options:[{id:'one',candidate:{itemId:1},variantKey:'a'},{id:'two',candidate:{itemId:2},variantKey:'b'}]});entry.knownVariantKeys=new Set([key,key2]);
 const body={action:'assemble',searchId:entry.id,excludedOptionIds:[],excludedVariantKeys:[key,key2],clientRequestId:'synthetic-selection-request-1'};
 const accepted=await send(body);assert.equal(accepted.status,202,JSON.stringify(accepted.body));await tick();
 assert.deepEqual(entry.excludedVariantKeys,[key,key2]);
 const replay=await send({...body,excludedVariantKeys:[key2,key]});assert.equal(replay.status,202);assert.equal(replay.body.id,accepted.body.id);
 assert.equal((await send({...body,excludedVariantKeys:[key],clientRequestId:body.clientRequestId})).status,400,'Changed variant exclusions cannot replay an existing nonce');
 for(const bad of [{excludedVariantKeys:['foreign']},{excludedVariantKeys:[key,key]},{allowedOptionIds:['one'],excludedOptionIds:undefined,excludedVariantKeys:[key]},{excludedVariantKeys:null}])assert.equal((await send({...body,...bad,clientRequestId:undefined})).status,400);
 globalThis.__gildraAuctionStarts.clear();
 const search={action:'search',characterSlug:'synthetic',locale:'en',budgetGold:'100',selectedSlots:['WRIST']};
 assert.equal((await send({...search,objective:'forged'})).status,400);assert.equal(calls.length,0);
 for(const objective of ['value','dps',undefined]){const r=await send({...search,...(objective?{objective}:{}),clientRequestId:'synthetic-objective-request-'+String(objective)});assert.equal(r.status,202,JSON.stringify(r.body));await tick();assert.equal(calls.at(-1).objective,objective??'dps');}
 console.log('PASS API: objective validation/legacy default, variant exclusion ownership, canonical nonce replay and changed-selection rejection.');
}finally{hook.deregister();delete globalThis.__objectiveSelection;}
