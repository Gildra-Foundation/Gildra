import assert from "node:assert/strict";
import {getCharacterAuctionMarket} from "../lib/wow/auctionMarketProvider.ts";
import {enqueueAuctionGearJob,getAuctionGearJob,cancelAuctionGearJob} from "../lib/wow/auctionGearJobs.ts";
const savedFetch=globalThis.fetch;
let realmCalls=0,auctionCalls=0;
const char={region:"eu",realm:{slug:"test",name:"Test"}};
try{
 globalThis.fetch=async url=>{
  if(String(url).includes('/realm/')){realmCalls++;return Response.json({connected_realm:{href:'https://eu.api.blizzard.com/data/wow/connected-realm/999991'}});}
  auctionCalls++;await new Promise(r=>setTimeout(r,10));return Response.json({auctions:[{id:123,item:{id:456},buyout:100,quantity:1}]},{headers:{'last-modified':new Date().toUTCString()}});
 };
 const [a,b]=await Promise.all([getCharacterAuctionMarket(char,'test-token'),getCharacterAuctionMarket(char,'other-token')]);
 assert.equal(a.id,b.id);assert.equal(auctionCalls,1);assert.equal(realmCalls,2);await getCharacterAuctionMarket(char,'test-token');assert.equal(auctionCalls,1);
 globalThis.fetch=async()=>Response.json({connected_realm:{href:'https://evil.example/data/wow/connected-realm/1'}});
 await assert.rejects(getCharacterAuctionMarket(char,'secret'),/connected_realm_unresolved/);
 globalThis.fetch=async url=>String(url).includes('/realm/')?Response.json({connected_realm:{href:'https://eu.api.blizzard.com/data/wow/connected-realm/999992'}}):Response.json({auctions:[]},{headers:{'last-modified':new Date(Date.now()-3*3600000).toUTCString()}});
 await assert.rejects(getCharacterAuctionMarket(char,'test'),/market_stale/);
 let finish;
 const j=enqueueAuctionGearJob('owner-a',async signal=>{await new Promise(r=>{finish=r});signal.throwIfAborted();return {};});
 assert.equal(getAuctionGearJob('owner-b',j.id),null);assert.equal(cancelAuctionGearJob('owner-b',j.id),null);
 assert.throws(()=>enqueueAuctionGearJob('owner-a',async()=>({})),/already_running/);
 assert.equal(cancelAuctionGearJob('owner-a',j.id).status,'cancelled');finish();await new Promise(r=>setTimeout(r,5));assert.equal(getAuctionGearJob('owner-a',j.id).status,'cancelled');
 const completed=enqueueAuctionGearJob('owner-b',async()=>({spentCopper:1}));await new Promise(r=>setTimeout(r,5));assert.equal(getAuctionGearJob('owner-b',completed.id).status,'completed');
 let releaseQueue,cancelledTasksRun=0;
 const held=enqueueAuctionGearJob('capacity-active',async()=>{await new Promise(r=>{releaseQueue=r});return {};});
 for(let index=0;index<16;index++) {
  const owner=`capacity-cancel-${index}`;
  const queued=enqueueAuctionGearJob(owner,async()=>{cancelledTasksRun++;return {};});
  assert.equal(queued.status,'queued');
  assert.equal(cancelAuctionGearJob(owner,queued.id).status,'cancelled');
 }
 const waiting=Array.from({length:8},(_,index)=>({owner:`capacity-wait-${index}`,job:enqueueAuctionGearJob(`capacity-wait-${index}`,async()=>({}))}));
 assert(waiting.every(({job})=>job.status==='queued'));
 assert.throws(()=>enqueueAuctionGearJob('capacity-overflow',async()=>({})),/plan_queue_full/);
 releaseQueue();await new Promise(r=>setTimeout(r,5));
 assert.equal(getAuctionGearJob('capacity-active',held.id).status,'completed');
 assert(waiting.every(({owner,job})=>getAuctionGearJob(owner,job.id).status==='completed'));
 assert.equal(cancelledTasksRun,0,'Cancelled queued work ran');
 console.log('Auction service checks passed: realm binding, shared snapshot, freshness, owner isolation, duplicate work, cancellation race, capacity after 16 queued cancellations.');
}finally{globalThis.fetch=savedFetch;}
