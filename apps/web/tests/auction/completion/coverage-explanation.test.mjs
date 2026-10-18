import assert from 'node:assert/strict';
import { auctionGearCoverageReasons } from '../../../lib/wow/auctionGearCoverage.ts';
const keys=['unsupportedModifierLots','variantsRejected','referenceItemsRejected','catalogItemsMissing','catalogUnmatchedItemIds','eligibilityUnverifiedItems'];
for(const locale of ['en','ru']) {
 for(const key of keys){const reasons=auctionGearCoverageReasons({[key]:7},false,locale);assert.equal(reasons.length,1,key);assert.match(reasons[0].text,/7/);assert.equal(reasons[0].key,key);assert(reasons[0].text.trim().length>10);}
 const generic=auctionGearCoverageReasons({},false,locale);assert.equal(generic.length,1);assert.equal(generic[0].key,'dataIncomplete');
 assert.deepEqual(auctionGearCoverageReasons({},true,locale),[]);
 const all=auctionGearCoverageReasons(Object.fromEntries(keys.map(key=>[key,2])),false,locale);assert.equal(all.length,keys.length);assert.equal(new Set(all.map(x=>x.key)).size,keys.length);
 assert.deepEqual(auctionGearCoverageReasons({variantsRejected:NaN,unsupportedModifierLots:-1},true,locale),[]);
}
console.log('PASS coverage explanations: every trigger has localized nonempty count/copy, generic incomplete-data fallback, no unrelated incompatible/profession warning.');
