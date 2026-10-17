import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {registerHooks,syncBuiltinESMExports} from 'node:module';
import * as jobs from '../../../lib/wow/auctionGearJobs.ts';

assert(process.env.GILDRA_AUCTION_STATE_DIR?.includes('gildra-cancellation-'),'Only isolated test state is allowed');
const mode=process.argv[2],input=JSON.parse(process.argv[3]??'{}'),actualNow=Date.now;
let now=input.now??actualNow();Date.now=()=>now;
const scope={characterSlug:'synthetic-cancellation',locale:'en'},token='synthetic-cancellation-owner';let currentToken=token,calls=0,aborts=0;
const owner=t=>createHash('sha256').update(`battle-net:${t}`).digest('hex'),tick=()=>new Promise(r=>setImmediate(r));
globalThis.__cancellationRegression={auth:()=>({battleNetAccessToken:currentToken}),run:async signal=>{calls++;await new Promise((resolve,reject)=>{const abort=()=>{aborts++;reject(signal.reason);};if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});}};
const moduleURL=s=>`data:text/javascript,${encodeURIComponent(s)}`;
const hook=registerHooks({resolve(specifier,context,next){
 if(specifier==='@/auth')return{url:moduleURL('export async function auth(){return globalThis.__cancellationRegression.auth()}'),shortCircuit:true};
 if(specifier==='@/lib/wow/auctionGearRunner')return{url:moduleURL("export const startAuctionGearSearch=(_i,_o,_t,s)=>globalThis.__cancellationRegression.run(s);export const continueAuctionGearSearch=async()=>{throw Error('unexpected_resume')};export const assembleAuctionGearSearch=async()=>{throw Error('unexpected_assembly')};export const selectedAuctionGearAssemblyOptions=()=>[];export const verifyAuctionGearSearch=async()=>{}"),shortCircuit:true};
 if(specifier==='next/server')return next('next/server.js',context);return next(specifier,context);
}});
globalThis.fetch=async()=>{throw Error('unexpected_network_in_cancellation_test');};
const route=await import('../../../app/api/wow/auction-gear-plans/route.ts');
async function send(method,body,query={}){const response=await route[method](new Request('https://gildra.example/api/wow/auction-gear-plans?'+new URLSearchParams(query),{method,headers:{host:'gildra.example',origin:'https://gildra.example'},...(body?{body:JSON.stringify(body)}:{})}));return{status:response.status,body:await response.json()};}
const nonce=i=>`synthetic-cancellation-request-${i}`,cancel=i=>send('DELETE',undefined,{...scope,clientRequestId:nonce(i)});
const get=i=>send('GET',undefined,{...scope,clientRequestId:nonce(i)});
async function seedResults(count){const results=[];for(let i=0;i<count;i++){const actor=owner('synthetic-terminal-'+i),job=jobs.enqueueAuctionGearJob(actor,async()=>({kind:'search',searchId:'synthetic-result-'+i}),{scope});await tick();assert.equal(jobs.getAuctionGearJob(actor,job.id).status,'completed');results.push({owner:actor,id:job.id});}return results;}
let output;
try{
 if(mode==='capacity'){
  await seedResults(199);const protectedAck=await cancel('protected');assert.equal(protectedAck.status,200);
  const admitted=await cancel('late');assert.equal(admitted.status,200,'Completed result capacity must not reject cancellation');assert.equal(admitted.body.status,'cancelled');
  const replay=await send('POST',{action:'search',...scope,budgetGold:'1',clientRequestId:nonce('late')});assert.equal(replay.status,202);assert.equal(replay.body.id,admitted.body.id);assert.equal(calls,0);
  assert.equal((await get('protected')).body.id,protectedAck.body.id);assert.equal((await cancel('late')).body.id,admitted.body.id);
  output={protectedId:protectedAck.body.id,newId:admitted.body.id,now,status:'passed'};
 }else if(mode==='capacity-read'){
  assert.equal((await get('protected')).body.id,input.protectedId);assert.equal((await get('late')).body.id,input.newId);
  assert.equal((await cancel('after-restart')).status,200);output={status:'passed'};
 }else if(mode==='replacement-failure'){
  const results=await seedResults(200),oldest=results[0],rename=fs.renameSync,unlink=fs.unlinkSync;
  for(const failure of ['write','remove']){
   if(failure==='write')fs.renameSync=()=>{const e=Error('synthetic-write-EIO');e.code='EIO';throw e;};
   else fs.unlinkSync=path=>{if(String(path).endsWith(`job-${oldest.id}.bin`)){const e=Error('synthetic-unlink-EIO');e.code='EIO';throw e;}return unlink(path);};
   syncBuiltinESMExports();let rejected;
   try{rejected=await cancel(failure);}finally{fs.renameSync=rename;fs.unlinkSync=unlink;syncBuiltinESMExports();}
   assert.equal(rejected.status,503);assert.equal(rejected.body.error,'auction_storage_unavailable');assert.equal(jobs.getAuctionGearJob(oldest.owner,oldest.id).status,'completed');assert.equal((await get(failure)).status,404,'Failed admission cannot leave a marker');
  }
  output={status:'passed',oldest,now};
 }else if(mode==='replacement-read'){
  assert.equal(jobs.getAuctionGearJob(input.oldest.owner,input.oldest.id).status,'completed');assert.equal((await get('write')).status,404);assert.equal((await get('remove')).status,404);assert.equal((await cancel('successful-retry')).status,200);output={status:'passed'};
 }else if(mode==='rate'||mode==='rate-seed'){
  if(mode==='rate')globalThis.__gildraAuctionStarts.set(owner(token),{searches:[now],continuations:[]}); // Live pre-fix in-memory shape.
  let first;for(let i=0;i<60;i++){const r=await cancel(i);assert.equal(r.status,200,`Cancellation${i+1} must not hit a30minute owner-count trap`);first??=r.body.id;}
  assert.equal((await cancel(60)).status,429);assert.equal((await cancel(0)).body.id,first,'Acknowledged retries remain free');
  if(mode==='rate-seed')output={status:'passed',now,first};
  else{
   const running=await send('POST',{action:'search',...scope,budgetGold:'1',clientRequestId:nonce('accepted')});assert.equal(running.status,202);await tick();
   assert.equal((await cancel('accepted')).status,200,'Accepted work remains cancellable at the full minute rate');await tick();assert.equal(calls,1);assert.equal(aborts,1);
   now+=60_001;assert.equal((await cancel(60)).status,200);assert.equal((await get(0)).body.id,first,'Minute-rate expiry must preserve30minute ACK');output={status:'passed'};
  }
 }else if(mode==='rate-read'){
  now=input.now+1000;assert.equal((await get(0)).body.id,input.first);assert.equal((await cancel(60)).status,429,'Restart cannot erase minute rate');
  now=input.now+60_001;assert.equal((await cancel(60)).status,200);assert.equal((await get(0)).body.id,input.first);output={status:'passed'};
 }else if(mode==='protected-full'){
  let first;for(let actor=0;actor<4;actor++){currentToken='synthetic-marker-owner-'+actor;for(let i=0;i<50;i++){const r=await cancel(i);assert.equal(r.status,200);first??=r.body.id;}}
  currentToken='synthetic-marker-owner-0';assert.equal((await get(0)).body.id,first);assert.equal((await cancel('overflow')).status,503);assert.equal((await cancel(0)).body.id,first);
  assert.equal((await send('POST',{action:'search',...scope,budgetGold:'1',clientRequestId:nonce('new-work')})).status,503);assert.equal(calls,0);output={status:'passed'};
 }else if(mode==='scope'){
  const ack=await cancel('scope');assert.equal(ack.status,200);
  assert.equal((await send('DELETE',undefined,{...scope,locale:'ru',clientRequestId:nonce('scope')})).status,400);
  currentToken='synthetic-foreign-owner';assert.equal((await get('scope')).status,404);const foreign=await cancel('scope');assert.equal(foreign.status,200);assert.notEqual(foreign.body.id,ack.body.id);
  currentToken=token;assert.equal((await get('scope')).body.id,ack.body.id);assert.equal(calls,0);output={status:'passed'};
 }else if(mode==='crash-seed'){
  const ack=await cancel('oldest-protected');assert.equal(ack.status,200);const results=await seedResults(199),unlink=fs.unlinkSync;
  fs.unlinkSync=path=>{
   if(String(path).endsWith(`job-${results[0].id}.bin`)){
    const count=fs.readdirSync(process.env.GILDRA_AUCTION_STATE_DIR).filter(name=>name.startsWith('job-')&&name.endsWith('.bin')).length;assert.equal(count,201);
    fs.writeSync(1,JSON.stringify({status:'crashed-at-commit-gap',protectedId:ack.body.id,now,count})+'\n');process.exit(0);
   }
   return unlink(path);
  };syncBuiltinESMExports();await cancel('crash-overflow');assert.fail('Crash barrier was not reached');
 }else if(mode==='crash-read'){
  assert.equal(fs.readdirSync(process.env.GILDRA_AUCTION_STATE_DIR).filter(name=>name.endsWith('.bin')).length,201);
  const oldest=await get('oldest-protected');assert.equal(oldest.status,200,'Restart pruning must never erase an acknowledged cancellation');assert.equal(oldest.body.id,input.protectedId);
  assert.equal((await get('crash-overflow')).body.status,'cancelled');assert.equal(calls,0);
  assert.equal(fs.readdirSync(process.env.GILDRA_AUCTION_STATE_DIR).filter(name=>name.endsWith('.bin')).length,200);output={status:'passed'};
 }else throw Error('unknown_cancellation_fixture');
 console.log(JSON.stringify(output));
}finally{Date.now=actualNow;hook.deregister();delete globalThis.__cancellationRegression;}
