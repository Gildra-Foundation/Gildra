// Actual route, synthetic auth/store/market. Network is forbidden.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
import { auctionVariantKey } from '../lib/wow/auctionItemVariant.ts';
import { auctionGearResults } from '../lib/wow/auctionGearResult.ts';
const offer={auctionId:1,itemId:2,quantity:1,buyoutCopper:100,contextId:0,bonusIds:[3],modifiers:[]};
const purchase={...offer,name:'Synthetic ring',slotType:'FINGER_1',variantKey:auctionVariantKey(offer),lotCostCopper:100,itemLevel:1};
const comparison={baselineDps:100,candidateDps:110,deltaDps:10,deltaPercent:10,uncertainty:{significant:true,marginDps:1,marginPercent:1}};
const plan={purchases:[purchase],spentCopper:100,remainingCopper:900,removedSlots:[],comparison};
const assembly={...plan,bestConfirmed:plan,budgetCopper:1000};
const character={id:1,region:'eu',realm:{slug:'synthetic'}};
const entry={latestAssemblyResult:assembly,context:{character,input:{characterSlug:'synthetic',locale:'en'},market:{region:'eu',connectedRealmId:1}}};
const s=globalThis.__shoppingTest={token:'synthetic-a',entry,character,market:{region:'eu',connectedRealmId:1,sourceUpdatedAt:new Date().toISOString(),offers:[offer]},calls:0};
const owner=createHash('sha256').update('battle-net:synthetic-a').digest('hex');
const stub=source=>'data:text/javascript,'+encodeURIComponent(source);
const modules={
 '@/auth':`export async function auth(){return globalThis.__shoppingTest.token?{battleNetAccessToken:globalThis.__shoppingTest.token}:null}`,
 '@/lib/wow/auctionGearSearchStore':`export function getAuctionGearSearch(owner,id){return owner===${JSON.stringify(owner)}&&id==='owned'?globalThis.__shoppingTest.entry:null}`,
 '@/lib/wow/battleNetCharacters':`export async function getBattleNetCharacterBySlug(){return globalThis.__shoppingTest.character}`,
 '@/lib/wow/auctionMarketProvider':`export async function getCharacterAuctionMarket(){globalThis.__shoppingTest.calls++;return globalThis.__shoppingTest.market}`,
 '@/lib/wow/auctionBrowserData':`export async function exactCommodityPrices(){throw Error('unexpected commodities')}`,
};
const hooks=registerHooks({resolve(name,context,next){if(modules[name])return{url:stub(modules[name]),shortCircuit:true};return next(name==='next/server'?'next/server.js':name,context)}});
const savedFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('network forbidden')};
try{
 const {POST}=await import('../app/api/wow/auction-shopping-list/route.ts');
 const body={searchId:'owned',recommendationKey:auctionGearResults(assembly)[0].key,purchasedKeys:[]};
 const send=async(data=body,headers={})=>{const r=await POST(new Request('https://gildra.example/api/wow/auction-shopping-list',{method:'POST',headers:{host:'gildra.example',origin:'https://gildra.example',...headers},body:JSON.stringify(data)}));assert.equal(r.headers.get('cache-control'),'private, no-store');return{status:r.status,body:await r.json()}};
 assert.equal((await send(body,{origin:'https://other.example'})).status,403);
 s.token=null;assert.equal((await send()).status,401);
 s.token='synthetic-b';assert.equal((await send()).status,404);
 s.token='synthetic-a';assert.equal((await send({...body,prices:[1]})).status,400);
 assert.equal((await send({...body,purchasedKeys:['forged']})).status,400);
 assert.equal((await send({...body,recommendationKey:'forged'})).status,404);
 assert.equal(s.calls,0);
 let r=await send();assert.equal(r.status,200);assert.equal(r.body.remainingCopper,100);assert.equal(r.body.rows[0].status,'available');
 const key=r.body.rows[0].key;
 s.market.offers=[];r=await send();assert.equal(r.body.rows[0].status,'missing');assert.equal(r.body.remainingCopper,null);
 r=await send({...body,purchasedKeys:[key]});assert.equal(r.body.remainingCopper,0);
 s.market.offers=[{...offer,bonusIds:[4]}];r=await send();assert.equal(r.body.rows[0].status,'changed');
 s.market.sourceUpdatedAt='2000-01-01T00:00:00Z';assert.equal((await send()).status,503);
 s.market.sourceUpdatedAt=new Date().toISOString();s.market.connectedRealmId=2;assert.equal((await send()).status,409);
 s.character=null;assert.equal((await send()).status,404);
 assert.equal((await send({...body,recommendationKey:'x'.repeat(40000)})).status,413);
 console.log('Shopping API: ownership, validation, variants, partial purchase, stale market, realm isolation passed');
}finally{hooks.deregister();globalThis.fetch=savedFetch;delete globalThis.__shoppingTest}
