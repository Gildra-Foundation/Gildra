import assert from 'node:assert/strict';
import {supportedAuctionModifiers} from '../lib/wow/gearItemModifiers.ts';
import {auctionVariantKey,auctionVariantChange,resolvedAuctionVariant} from '../lib/wow/auctionItemVariant.ts';
import {matchAuctionVariant} from '../lib/wow/auctionMarket.ts';
import {parseAuctionItemReference,nativeMatchesItemReference,getAuctionItemReferences} from '../lib/wow/auctionItemReference.ts';
import {resolveAuctionVariants} from '../lib/wow/auctionVariantResolver.ts';
const offer={auctionId:1,itemId:123,quantity:1,buyoutCopper:1000,contextId:23,bonusIds:[6657,1234],modifiers:[{type:9,value:81},{type:28,value:502},{type:29,value:40},{type:30,value:49},{type:39,value:123456}]};
assert(supportedAuctionModifiers(offer.modifiers));for(const bad of [[null],[{}],[{type:9,value:91}],[{type:28,value:-1}],[{type:29,value:999}],[{type:28,value:1},{type:28,value:2}],[{type:1000,value:1}]])assert.equal(supportedAuctionModifiers(bad),false);
assert.equal(auctionVariantKey(offer),auctionVariantKey({...offer,bonusIds:[1234,6657],modifiers:[...offer.modifiers].reverse()}));
assert.notEqual(auctionVariantKey(offer),auctionVariantKey({...offer,modifiers:[{type:9,value:80}]}));
assert.notEqual(auctionVariantKey(offer),auctionVariantKey({...offer,contextId:24}));
const change=auctionVariantChange(offer,'head');assert.deepEqual(change.modifiers,offer.modifiers);assert.equal(change.contextId,23);assert.equal(change.bonusIds.length,2);
const metadata={key:auctionVariantKey(offer),itemId:123,itemLevel:133,requiredLevel:80,inventoryType:1,itemClassId:4,itemSubclassId:4,quality:3,uniqueEquipped:false,setId:0,stats:{strint:100,crit_rating:20}};
const variant=resolvedAuctionVariant(offer,metadata,'SimulationCraft test');assert.equal(variant.itemLevel,133);assert.equal(variant.resolution.requiredLevel,80);assert.equal(variant.modifiers.length,5);
assert.equal(matchAuctionVariant(offer,{itemId:123,variants:[variant]}),variant);
assert.throws(()=>resolvedAuctionVariant(offer,{...metadata,itemId:124},'SimulationCraft test'),/unverified/);
assert.throws(()=>resolvedAuctionVariant(offer,{...metadata,error:'unknown_bonus'},'SimulationCraft test'),/unverified/);
const saved=globalThis.fetch;let requests=0;
try{
 globalThis.fetch=async(url,options)=>{requests++;const body=JSON.parse(options.body);assert.equal(body.characterLevel,81);assert.deepEqual(body.variants[0].change.modifiers,offer.modifiers);return Response.json({engine:'SimulationCraft test',variants:[metadata]},{headers:{'x-gildra-engine':'simulationcraft'}});};
 const result=await resolveAuctionVariants({offers:[{offer,slot:'head'},{offer:{...offer,auctionId:2},slot:'head'}],spec:'fury-warrior',characterLevel:81,signal:new AbortController().signal});assert.equal(requests,1);assert.equal(result.variants.size,1);
 globalThis.fetch=async()=>Response.json({code:'variant_metadata_worker_upgrade_required'},{status:503});
 await assert.rejects(resolveAuctionVariants({offers:[{offer,slot:'head'}],spec:'fury-warrior',characterLevel:81,signal:new AbortController().signal}),/worker_upgrade/);
 globalThis.fetch=async()=>Response.json({engine:'SimulationCraft test',variants:[{...metadata,itemId:124}]},{headers:{'x-gildra-engine':'simulationcraft'}});
 await assert.rejects(resolveAuctionVariants({offers:[{offer,slot:'head'}],spec:'fury-warrior',characterLevel:81,signal:new AbortController().signal}),/invalid_variant_resolution/);
}finally{globalThis.fetch=saved;}
console.log('Auction variant checks passed: raw modifier identity, exact context/bonuses, native level/requirements, deduplication, response binding and stale worker rejection.');

const reference=parseAuctionItemReference({id:123,required_level:70,preview_item:{item:{id:123},context:0,bonus_list:[10382,10844],level:{value:73},requirements:{level:{value:70}},stats:[{type:{type:'STRENGTH'},value:16},{type:{type:'STAMINA'},value:25}]}},123);
assert(reference);
const verified={...metadata,itemLevel:73,requiredLevel:70,stats:{strint:16,stamina:25}};
assert(nativeMatchesItemReference(reference,verified));
assert(!nativeMatchesItemReference(reference,{...verified,itemLevel:545,requiredLevel:0}),'pre-squish item level must not be recommended');
assert(!nativeMatchesItemReference(reference,{...verified,stats:{strint:1193,stamina:29428}}),'unverified stat scale must not be recommended');
assert(!nativeMatchesItemReference(reference,{...verified,requiredLevel:90}));
assert.equal(parseAuctionItemReference({id:123,level:545},123),null,'top-level API level is not the current tooltip level');
console.log('Blizzard preview checks passed: current tooltip level/requirements/stats, hybrid primaries and rejection of legacy scaling.');

let calls=0,active=0,peak=0;
try {
 globalThis.fetch=async(url,options)=>{calls++;active++;peak=Math.max(peak,active);await Promise.resolve();active--;assert.equal(new URL(url).origin,'https://eu.api.blizzard.com');assert.equal(options.cache,'no-store');const id=Number(new URL(url).pathname.split('/').at(-1));return Response.json({id,required_level:80,preview_item:{item:{id},level:{value:100},bonus_list:[],stats:[]}});};
 const controls=await getAuctionItemReferences([991,992,993,994,995,996],'eu','qa-token',new AbortController().signal);assert.equal(controls.size,6);assert.equal(peak,4);assert.equal(calls,6);
 await getAuctionItemReferences([991],'eu','qa-token',new AbortController().signal);assert.equal(calls,6,'public control metadata is cached without tokens');
 globalThis.fetch=async()=>Response.json({},{status:404});assert.equal((await getAuctionItemReferences([997],'eu','qa-token',new AbortController().signal)).size,0);
 globalThis.fetch=async()=>Response.json({},{status:429});await assert.rejects(getAuctionItemReferences([998],'eu','qa-token',new AbortController().signal),/item_reference_unavailable/);
 await assert.rejects(getAuctionItemReferences([999],'invalid','qa-token',new AbortController().signal),/invalid_item_reference_request/);
} finally {globalThis.fetch=saved;}
console.log('Blizzard reference service checks passed: fixed origin, bounded concurrency, cache, missing items and upstream failure.');
