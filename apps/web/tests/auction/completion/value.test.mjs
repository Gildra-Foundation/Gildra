import assert from 'node:assert/strict';
import { getAuctionGearRecommendationGroups } from '../../../lib/wow/auctionGearRecommendations.ts';
// Synthetic offline choices: price alone and total DPS alone both choose wrong.
const item=(id,price,gain,extra={})=>({optionId:String(id),auctionId:id,itemId:id,name:`Synthetic ${id}`,slotType:'WRIST',variantKey:'base',quantity:1,lotCostCopper:price,evaluation:'upgrade',comparison:{deltaDps:gain,deltaPercent:gain/10,uncertainty:{significant:true}},...extra});
const cheap=item(1,100,1),value=item(2,400,20),strong=item(3,1000,30);
const duplicate={...value,optionId:'expensive-copy',auctionId:20,lotCostCopper:600};
const input=[cheap,strong,duplicate,value,item(4,700,10),item(5,1,-10),item(6,1,100,{evaluation:'pending'}),item(7,1,100,{comparison:{deltaDps:100,uncertainty:{significant:false}}})];
const before=structuredClone(input);
const groups=getAuctionGearRecommendationGroups(input);
assert.equal(groups.length,1);
assert.equal(groups[0].best.optionId,value.optionId,'Best value must use price per DPS gain, not cheapest lot or highest total DPS');
assert.deepEqual(new Set(groups[0].alternatives.map(x=>x.optionId)),new Set([cheap.optionId,strong.optionId]));
assert.equal(groups[0].alternatives.length,2);
assert.deepEqual(input,before);
assert.deepEqual(getAuctionGearRecommendationGroups([]),[]);
assert.equal(getAuctionGearRecommendationGroups([value,duplicate])[0].alternatives.length,0,'Duplicate lots are not alternatives');
assert.equal(getAuctionGearRecommendationGroups([value,{...strong,slotType:'HEAD'},cheap]).length,2,'Each slot keeps a separate recommendation');
for(const gain of [NaN,Infinity,0,-1])assert.deepEqual(getAuctionGearRecommendationGroups([item(9,10,gain)]),[]);
for(const price of [NaN,Infinity,0,-1])assert.deepEqual(getAuctionGearRecommendationGroups([item(9,price,10)]),[]);
assert.equal(getAuctionGearRecommendationGroups([value,{...cheap,lotCostCopper:20}])[0].best.optionId,value.optionId,'Equal efficiency prefers greater confirmed gain');
console.log('PASS value: price per positive confirmed DPS, two distinct useful alternatives, per-slot grouping, stable ties, finite data, unchanged inputs.');
// Independent exhaustive ratio oracle across shuffled, duplicate and dominated choices.
let seed=17;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
for(let trial=0;trial<250;trial++){
  const rows=Array.from({length:40},(_,i)=>item(i+1,1+random()%1_000_000,1+random()%10000));
  const grouped=getAuctionGearRecommendationGroups(rows);
  const minimum=Math.min(...rows.map(x=>x.lotCostCopper/x.comparison.deltaDps));
  assert.equal(grouped[0].best.lotCostCopper/grouped[0].best.comparison.deltaDps,minimum);
  assert.deepEqual(getAuctionGearRecommendationGroups([...rows].reverse()).map(g=>g.best.optionId),grouped.map(g=>g.best.optionId));
  for(const alt of grouped[0].alternatives) assert(!rows.some(x=>x.lotCostCopper<=alt.lotCostCopper&&x.comparison.deltaDps>=alt.comparison.deltaDps&&(x.lotCostCopper<alt.lotCostCopper||x.comparison.deltaDps>alt.comparison.deltaDps)));
}
console.log('PASS value oracle: 250 independent pools, minimum whole-lot cost per DPS and no dominated alternatives.');
