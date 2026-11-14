import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { parseAuctionListings } from '../../../lib/wow/auctionBrowser.ts';
import { summarizeAuctions } from '../../../lib/wow/auctionMarketSummary.ts';

async function heldSnapshotAdapter() {
  let release, fail, calls=0;
  const held=new Promise((resolve,reject)=>{release=resolve;fail=reject;});
  const source=await readFile(new URL('../../../lib/wow/auctionBrowserData.ts',import.meta.url),'utf8');
  const code=stripTypeScriptTypes(source,{mode:'strip'}).replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
  const adapter=new vm.Script(code+'\n;({exactCommodityPrices})').runInNewContext({
    parseAuctionListings,summarizeAuctions,Map,Set,WeakMap,Date,Number,JSON,Buffer,URL,URLSearchParams,AbortSignal,
    process:{env:{BATTLENET_CLIENT_ID:'synthetic',BATTLENET_CLIENT_SECRET:'synthetic'}},
    fetch:async url=>{
      if(url==='https://oauth.battle.net/token') return Response.json({access_token:'synthetic',expires_in:3600});
      assert.equal(new URL(url).pathname,'/data/wow/auctions/commodities');calls++;
      await held;
      return Response.json({auctions:[{id:1,item:{id:950001},quantity:3,unit_price:20},{id:2,item:{id:950001},quantity:2,unit_price:30}]},
        {headers:{'last-modified':new Date().toUTCString()}});
    },
  });
  return {...adapter,release,fail,get calls(){return calls;}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('real exact-price adapter cancels one shared-snapshot waiter while another completes without duplicate upstream',async()=>{
  const h=await heldSnapshotAdapter(),controller=new AbortController();
  const first=h.exactCommodityPrices('eu',[950001],{signal:controller.signal});
  let secondDone=false;
  const second=h.exactCommodityPrices('eu',[950001],{refresh:true}).then(value=>{secondDone=true;return value;});
  await tick();assert.equal(h.calls,1);
  const rejected=assert.rejects(first,error=>error.name==='AbortError');controller.abort();await rejected;
  assert.equal(secondDone,false,'Cancellation must settle before the shared transport');
  h.release();const result=await second;
  assert.deepEqual(JSON.parse(JSON.stringify(result.prices)),{'950001':{ladder:[[20,3],[30,2]]}});
  assert(result.sourceUpdatedAt);assert.equal(h.calls,1);
  await h.exactCommodityPrices('eu',[950001]);assert.equal(h.calls,1,'Completed snapshot remains cached');
});

test('cancelled exact-price waiter consumes late shared transport failure and pre-aborted calls do not fetch',async()=>{
  const h=await heldSnapshotAdapter(),controller=new AbortController();
  controller.abort();await assert.rejects(h.exactCommodityPrices('eu',[950001],{signal:controller.signal}),error=>error.name==='AbortError');
  assert.equal(h.calls,0);
  const active=new AbortController(),pending=h.exactCommodityPrices('eu',[950001],{signal:active.signal});
  await tick();assert.equal(h.calls,1);
  const rejected=assert.rejects(pending,error=>error.name==='AbortError');active.abort();await rejected;
  // node:test treats an unhandled late rejection as a failure even after this test ends.
  h.fail(new Error('synthetic late transport failure'));await tick();await tick();
});
