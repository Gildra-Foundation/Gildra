import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {getBattleNetSimulationSnapshot} from '../lib/wow/battleNetCharacterDetails.ts';
import {runAuctionGearPlanFromSnapshot} from '../lib/wow/auctionGearRunner.ts';
// Use the existing public maintained-preset endpoint while all simulations run
// on the isolated worker built from this worktree. No response is mocked.
const upstreamFetch=globalThis.fetch;
const resolvedVariants=[];
const itemReferences=[];
globalThis.fetch=async(input,init)=>{
 const url=String(input);
 const presetPrefix=`${process.env.ROTATION_WORKER_URL}/v1/wow/rotation/fury-warrior?`;
 const response=await upstreamFetch(url.startsWith(presetPrefix)?url.replace(process.env.ROTATION_WORKER_URL,'http://127.0.0.1:58082'):input,init);
 if(url.endsWith('/v1/wow/gear/variants'))resolvedVariants.push({request:JSON.parse(init.body),response:await response.clone().json()});
 if(/\/data\/wow\/item\/\d+\?/.test(url))itemReferences.push(await response.clone().json());
 return response;
};
const response=await fetch('https://oauth.battle.net/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${process.env.BATTLENET_CLIENT_ID}:${process.env.BATTLENET_CLIENT_SECRET}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
assert.equal(response.status,200,'OAuth unavailable');const token=(await response.json()).access_token;
const r=await fetch('https://eu.api.blizzard.com/profile/wow/character/eversong/'+encodeURIComponent('элкардия')+'?namespace=profile-eu&locale=en_GB',{headers:{Authorization:`Bearer ${token}`}});
assert.equal(r.status,200,'Profile unavailable');const p=await r.json();
const character={id:p.id,name:p.name,level:p.level,realm:p.realm,playableClass:p.character_class,playableRace:p.race,faction:p.faction,region:'eu',accountId:0,armoryUrl:''};
const armory=await getBattleNetSimulationSnapshot(token,character);
const budgetCopper=Number(process.env.AUCTION_QA_BUDGET_GOLD??10000)*10000;
try{
 const result=await runAuctionGearPlanFromSnapshot({characterSlug:'eu--eversong--элкардия',budgetCopper,scenario:'single-target',locale:'en'},character,armory,token,AbortSignal.timeout(10*60_000),p=>console.log(JSON.stringify({progress:p})));
 assert(result.spentCopper<=budgetCopper);assert.equal(result.remainingCopper,budgetCopper-result.spentCopper);assert(result.engine.startsWith('SimulationCraft'));
 await writeFile(`../../.artifacts/auction-live/plan-result-${budgetCopper/10000}.json`,JSON.stringify({verifiedAt:new Date().toISOString(),character:{name:character.name,realm:character.realm.name,level:character.level},...result},null,2),{mode:0o600});
 await writeFile(`../../.artifacts/auction-live/resolved-variants-${budgetCopper/10000}.json`,JSON.stringify(resolvedVariants,null,2),{mode:0o600});
 await writeFile(`../../.artifacts/auction-live/item-references-${budgetCopper/10000}.json`,JSON.stringify(itemReferences,null,2),{mode:0o600});
 console.log(JSON.stringify({status:'completed',budgetCopper,spentCopper:result.spentCopper,purchases:result.purchases,comparison:result.comparison,engine:result.engine,simulations:result.simulations,coverage:result.coverage},null,2));
}catch(e){console.log(JSON.stringify({status:'failed',error:e.message,character:{name:character.name,realm:character.realm.name,level:character.level},budgetCopper}));process.exitCode=1;}
