// Real route/store, synthetic authentication and runner. No external services.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { randomUUID } from 'node:crypto';
import { farmRecoveryUrl, parseFarmScope } from '../lib/wow/gearFarm/recovery.ts';
const state={session:{battleNetAccessToken:'synthetic-owner-a'},calls:[],resolve:null};
globalThis.__farmApiTest=state;
const moduleURL=s=>`data:text/javascript,${encodeURIComponent(s)}`;
const auth=moduleURL('export async function auth(){return globalThis.__farmApiTest.session}');
const runner=moduleURL('export async function runGearFarmPlan(input,token,signal){const s=globalThis.__farmApiTest;s.calls.push({input,token});return await new Promise(resolve=>{s.resolve=resolve})}');
const hooks=registerHooks({resolve(specifier,context,next){
 if(specifier==='@/auth')return {url:auth,shortCircuit:true};
 if(specifier==='@/lib/wow/gearFarm/runner')return {url:runner,shortCircuit:true};
 if(specifier==='next/server')return next('next/server.js',context);
 return next(specifier,context);
}});
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('Unexpected network in synthetic API test')};
try {
 const route=await import('../app/api/wow/gear-farm-plans/route.ts');
 const scope=parseFarmScope({characterSlug:'eu--synthetic--api',profileKey:'synthetic-profile',locale:'en'});
 const nonce=()=>`${Date.now()}:${randomUUID()}`;
 async function send(method,body,path=farmRecoveryUrl(scope),headers={}){
  const response=await route[method](new Request(`https://synthetic.invalid${path}`,{method,headers:{host:'synthetic.invalid',origin:'https://synthetic.invalid',...headers},...(body?{body:JSON.stringify(body)}:{})}));
  const payload=await response.json();
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert(!JSON.stringify(payload).includes('synthetic-owner-'),'Token must not escape');
  return {status:response.status,payload};
 }
 for(const method of ['POST','GET','DELETE']){
  assert.equal((await send(method,method==='POST'?{}:undefined,undefined,{origin:'https://foreign.invalid'})).status,403);
  state.session=null;assert.equal((await send(method,method==='POST'?{}:undefined)).status,401);state.session={battleNetAccessToken:'synthetic-owner-a'};
 }
 assert.equal((await send('POST',{characterSlug:scope.characterSlug,locale:'en'})).status,400);
 assert.equal((await send('POST',{...scope,clientRequestId:nonce(),dungeonDifficulty:'invented'})).payload.error,'invalid_farm_settings');
 assert.equal((await send('POST',{...scope,clientRequestId:nonce(),dungeonDifficulty:'mythic-plus',mythicKeyLevel:1})).status,400);
 assert.equal((await send('POST',{...scope,clientRequestId:nonce(),mythicKeyLevel:2})).status,400);
 const requestId=nonce(),input={...scope,clientRequestId:requestId};
 const accepted=await send('POST',input);assert.equal(accepted.status,202);const id=accepted.payload.id;
 assert.deepEqual(accepted.payload.scope,scope);assert.equal(state.calls.length,1);
 assert.equal((await send('POST',input)).payload.id,id);assert.equal(state.calls.length,1);
 const conflict=await send('POST',{...input,clientRequestId:nonce()});assert.equal(conflict.status,409);assert.equal(conflict.payload.job.id,id);
 assert.equal((await send('GET')).payload.job.id,id);
 assert.equal((await send('GET',undefined,farmRecoveryUrl(scope,{clientRequestId:requestId}))).payload.id,id);
 for(const changed of [{...scope,profileKey:'changed'},{...scope,locale:'ru'},{...scope,dungeonDifficulty:'heroic'}]){
  assert.equal((await send('GET',undefined,farmRecoveryUrl(changed))).payload.job,null);
  assert.equal((await send('GET',undefined,farmRecoveryUrl(changed,{id}))).status,404);
  assert.equal((await send('DELETE',undefined,farmRecoveryUrl(changed,{id}))).status,404);
 }
 state.session={battleNetAccessToken:'synthetic-owner-b'};
 assert.equal((await send('GET')).payload.job,null);
 assert.equal((await send('GET',undefined,farmRecoveryUrl(scope,{id}))).status,404);
 assert.equal((await send('DELETE',undefined,farmRecoveryUrl(scope,{id}))).status,404);
 state.session={battleNetAccessToken:'synthetic-owner-a'};
 assert.equal((await send('DELETE',undefined,farmRecoveryUrl(scope,{id}))).payload.status,'cancelled');
 state.resolve({});await new Promise(r=>setTimeout(r,1));
 const tombstoneId=nonce();assert.equal((await send('DELETE',undefined,farmRecoveryUrl(scope,{clientRequestId:tombstoneId}))).payload.status,'cancelled');
 assert.equal((await send('POST',{...scope,clientRequestId:tombstoneId})).payload.status,'cancelled');assert.equal(state.calls.length,1);
 assert.equal((await send('POST',{...scope,clientRequestId:`${Date.now()-31*60_000}:${randomUUID()}`})).status,410);
 const mplus={...scope,dungeonDifficulty:'mythic-plus',mythicKeyLevel:7,raidDifficulty:'heroic'}, n=nonce();
 assert.equal((await send('POST',{...mplus,clientRequestId:n})).status,202);
 assert.equal(state.calls[1].input.mythicKeyLevel,7);assert.equal(state.calls[1].input.raidDifficulty,'heroic');
 assert.equal((await send('GET',undefined,farmRecoveryUrl(mplus))).payload.job.scope.mythicKeyLevel,7);
 assert.equal((await send('GET',undefined,`${farmRecoveryUrl(mplus)}0`)).status,200); // valid key70 is a different empty scope
 assert.equal((await send('GET',undefined,farmRecoveryUrl(mplus).replace('mythicKeyLevel=7','mythicKeyLevel=7.5'))).status,400);
 await send('DELETE',undefined,farmRecoveryUrl(mplus,{clientRequestId:n}));state.resolve({});
 state.session={battleNetAccessToken:'synthetic-owner-c'};
 const previousScope={...scope,profileKey:'previous-profile'};
 const previous=await send('POST',{...previousScope,clientRequestId:nonce()});assert.equal(previous.status,202);
 state.resolve({synthetic:'completed'});await new Promise(r=>setTimeout(r,1));
 const active=await send('POST',{...scope,clientRequestId:nonce()});assert.equal(active.status,202);
 const blocked=await send('POST',{...previousScope,clientRequestId:nonce()});
 assert.equal(blocked.status,409);assert.equal(blocked.payload.job,null,'A completed result in another scope is not the active conflicting request');
 await send('DELETE',undefined,farmRecoveryUrl(scope,{id:active.payload.id}));state.resolve({});
 console.log(JSON.stringify({status:'passed',checks:['same-origin/auth guards','validated request settings','no private owner/token exposure','idempotency/conflict adoption','scoped owner discovery/read/cancel','cancel-before-POST','expired nonce','settings passed to runner']}));
} finally {hooks.deregister();globalThis.fetch=originalFetch;delete globalThis.__farmApiTest;}
