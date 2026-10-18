import assert from 'node:assert/strict';
import { getAuctionGearRecommendationGroups } from '../../../lib/wow/auctionGearRecommendations.ts';
import { auctionGearVariantSelectionKey } from '../../../lib/wow/auctionGearExclusions.ts';
const make=(id,cost,gain,extra={})=>({optionId:String(id),auctionId:id,itemId:id,name:`Synthetic ${id}`,slotType:'FEET',variantKey:'native-exact',quantity:1,lotCostCopper:cost,evaluation:'upgrade',comparison:{deltaDps:gain,deltaPercent:gain/10,uncertainty:{significant:true}},...extra});
// Real-audit shape: equal 20g lots, the allowed +691 DPS option was dominated by the excluded +735 DPS leader.
const best=make(1,200000,735),next=make(2,200000,691),strong=make(3,5000000,900);
const input=[best,next,strong],before=structuredClone(input);
const blocked={excludedOptionIds:new Set([best.optionId]),excludedVariantKeys:new Set()};
assert.equal(getAuctionGearRecommendationGroups(input,blocked)[0].best.optionId,next.optionId,'Excluded leader must not suppress the next allowed recommendation');
const expensive={...best,optionId:'expensive-copy',auctionId:10,lotCostCopper:300000};
assert.equal(getAuctionGearRecommendationGroups([best,expensive],blocked)[0].best.optionId,expensive.optionId,'Physical-lot exclusion must deduplicate only after filtering; use the allowed lot and its real price');
const variants={excludedOptionIds:new Set(),excludedVariantKeys:new Set([auctionGearVariantSelectionKey(best)])};
assert.equal(getAuctionGearRecommendationGroups([best,expensive,next],variants)[0].best.optionId,next.optionId,'Exact variant exclusion applies across all physical lots');
assert.deepEqual(getAuctionGearRecommendationGroups(input,{excludedOptionIds:new Set(input.map(x=>x.optionId)),excludedVariantKeys:new Set()}),[]);
assert.deepEqual(input,before,'Presentation filtering must preserve the whole native assembly domain');
console.log('PASS recommendation exclusions: rerank allowed pool before dedup/frontier; physical versus variant exclusions; actual allowed prices; original pool unchanged.');
