import assert from "node:assert/strict";
import {getCharacterAuctionMarket} from "../lib/wow/auctionMarketProvider.ts";
import {enqueueAuctionGearJob,getAuctionGearJob,cancelAuctionGearJob} from "../lib/wow/auctionGearJobs.ts";
const savedFetch=globalThis.fetch;
const savedNow=Date.now;
let realmCalls=0,auctionCalls=0;
const char={region:"eu",realm:{slug:"test",name:"Test"}};
async function completedJob(owner,options) {
 const job=enqueueAuctionGearJob(owner,async()=>({}),options);
 for(let attempt=0;attempt<100;attempt++) {
  const current=getAuctionGearJob(owner,job.id);
  if(current?.status==='completed') return current;
  await new Promise(resolve=>setTimeout(resolve,1));
 }
 assert.fail(`Synthetic job did not complete: ${owner}`);
}
try{
 globalThis.fetch=async url=>{
  if(String(url).includes('/realm/')){realmCalls++;return Response.json({connected_realm:{href:'https://eu.api.blizzard.com/data/wow/connected-realm/999991'}});}
  auctionCalls++;await new Promise(r=>setTimeout(r,10));return Response.json({auctions:[{id:123,item:{id:456},buyout:100,quantity:1}]},{headers:{'last-modified':new Date().toUTCString()}});
 };
 const [a,b]=await Promise.all([getCharacterAuctionMarket(char,'test-token'),getCharacterAuctionMarket(char,'other-token')]);
 assert.equal(a.id,b.id);assert.equal(auctionCalls,1);assert.equal(realmCalls,2);await getCharacterAuctionMarket(char,'test-token');assert.equal(auctionCalls,1);
 await getCharacterAuctionMarket(char,'test-token',{refresh:true});assert.equal(auctionCalls,2,'Assembly refresh must revalidate a cached market');
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
 // Accepted start times determine the quota. Progress/completion can renew job
 // retention after a long simulation without making its old start recent again.
 let now=savedNow()+3_600_000;
 Date.now=()=>now;
 let releaseLong,reportProgress;
 const long=enqueueAuctionGearJob('rolling-owner',async(_signal,progress)=>{
  reportProgress=progress;
  await new Promise(resolve=>{releaseLong=resolve;});
  return {};
 });
 for(let index=0;index<8;index++) assert.throws(()=>enqueueAuctionGearJob('rolling-owner',async()=>({})),/plan_already_running/);
 now+=120_000;
 reportProgress({phase:'simulating',completed:1,total:1});releaseLong();
 await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(getAuctionGearJob('rolling-owner',long.id).status,'completed');
 for(let index=0;index<3;index++) await completedJob('rolling-owner');
 assert.throws(()=>enqueueAuctionGearJob('rolling-owner',async()=>({})),/plan_rate_limited/,'Only starts in the last minute count');
 for(let index=0;index<60;index++) await completedJob('rolling-owner',{continuation:true});
 assert.throws(()=>enqueueAuctionGearJob('rolling-owner',async()=>({}),{continuation:true}),/plan_rate_limited/,'Continuations have their own bounded quota');
 now+=60_001;
 await completedJob('rolling-owner');await completedJob('rolling-owner',{continuation:true});
 // Cancellation still consumes a start, while a full-queue rejection does not.
 let releaseRateQueue;
 enqueueAuctionGearJob('rate-queue-active',async()=>{await new Promise(resolve=>{releaseRateQueue=resolve;});return {};});
 for(let index=0;index<3;index++) {
  const cancelled=enqueueAuctionGearJob('cancel-rate-owner',async()=>assert.fail('Cancelled queued task ran'));
  cancelAuctionGearJob('cancel-rate-owner',cancelled.id);
 }
 assert.throws(()=>enqueueAuctionGearJob('cancel-rate-owner',async()=>({})),/plan_rate_limited/,'Cancelling cannot bypass the new-search quota');
 const full=Array.from({length:8},(_,index)=>({owner:`rate-full-${index}`,job:enqueueAuctionGearJob(`rate-full-${index}`,async()=>({}))}));
 for(let index=0;index<5;index++) assert.throws(()=>enqueueAuctionGearJob('rejected-owner',async()=>({})),/plan_queue_full/);
 for(const {owner,job} of full) cancelAuctionGearJob(owner,job.id);
 const accepted=enqueueAuctionGearJob('rejected-owner',async()=>({}));
 releaseRateQueue();await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(getAuctionGearJob('rejected-owner',accepted.id).status,'completed');
 await completedJob('rejected-owner');await completedJob('rejected-owner');
 assert.throws(()=>enqueueAuctionGearJob('rejected-owner',async()=>({})),/plan_rate_limited/);
 // Public retained job views remain bounded independently of the rate history.
 const retained=[];
 for(let index=0;index<201;index++) retained.push(await completedJob(`retained-${index}`));
 assert.equal(getAuctionGearJob('retained-0',retained[0].id),null);
 assert.equal(getAuctionGearJob('retained-200',retained[200].id).status,'completed');
 console.log('Auction service checks passed: realm binding, shared snapshot, freshness, owner isolation, cancellation races, queue/result bounds, rolling start quotas (3 searches/60 continuations), rejected-start accounting and cancellation limits (offline fixtures only).');
}finally{globalThis.fetch=savedFetch;Date.now=savedNow;}
