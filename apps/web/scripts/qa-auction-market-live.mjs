import {writeFile} from 'node:fs/promises';
import {getCharacterAuctionMarket} from '../lib/wow/auctionMarketProvider.ts';
import {getBattleNetSimulationSnapshot} from '../lib/wow/battleNetCharacterDetails.ts';
const response=await fetch('https://oauth.battle.net/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${process.env.BATTLENET_CLIENT_ID}:${process.env.BATTLENET_CLIENT_SECRET}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
if(!response.ok)throw new Error(`oauth_status_${response.status}`);
const token=(await response.json()).access_token;
const r=await fetch('https://eu.api.blizzard.com/profile/wow/character/eversong/'+encodeURIComponent('элкардия')+'?namespace=profile-eu&locale=en_GB',{headers:{Authorization:`Bearer ${token}`}});
if(!r.ok)throw new Error(`profile_status_${r.status}`);
const p=await r.json();const character={id:p.id,name:p.name,level:p.level,realm:p.realm,playableClass:p.character_class,playableRace:p.race,faction:p.faction,region:'eu',accountId:0,armoryUrl:''};
const armory=await getBattleNetSimulationSnapshot(token,character);
const market=await getCharacterAuctionMarket(character,token);
await writeFile('../../.artifacts/auction-live/real-data.json',JSON.stringify({character,armory,market},null,2),{mode:0o600});
console.log(JSON.stringify({character:{name:character.name,realm:character.realm.name,level:character.level,specId:armory.activeSpecializationId},equipped:armory.equipment.equipped_items.length,market:{connectedRealmId:market.connectedRealmId,sourceUpdatedAt:market.sourceUpdatedAt,offers:market.offers.length,withoutModifiers:market.offers.filter(o=>!o.modifiers.length).length,modifierTypes:[...new Set(market.offers.flatMap(o=>o.modifiers.map(m=>m.type)))]}},null,2));

const spellResponse=await fetch("https://eu.api.blizzard.com/data/wow/spell/46917?namespace=static-eu&locale=en_GB",{headers:{Authorization:`Bearer ${token}`}});if(spellResponse.ok){const spell=await spellResponse.json();console.log(JSON.stringify({titanGrip:{name:spell.name,description:spell.description}}));}
