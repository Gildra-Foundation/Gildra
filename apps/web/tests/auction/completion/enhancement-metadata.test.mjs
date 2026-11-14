import test from 'node:test';
import assert from 'node:assert/strict';
import { validatedAuctionEnhancementMetadata } from '../../../lib/wow/auctionItemVariant.ts';
const verified={status:'verified',socketColors:[14,0,0],socketCount:1,socketBonusId:42,requiredProfessionId:0,requiredProfessionRank:0};
test('native v2 exact socket metadata survives validation and is isolated from caller mutations',()=>{
 const result=validatedAuctionEnhancementMetadata({metadataVersion:2,enhancements:verified});
 assert.deepEqual(result,verified); result.socketColors[0]=0; assert.equal(verified.socketColors[0],14);
});
test('legacy metadata is unknown rather than certifying zero sockets',()=>{
 assert.deepEqual(validatedAuctionEnhancementMetadata({}),{status:'unknown'});
 assert.deepEqual(validatedAuctionEnhancementMetadata({metadataVersion:1,enhancements:verified}),{status:'unknown'});
});
test('malformed or incomplete v2 metadata cannot certify enhancements',()=>{
 for(const enhancements of [undefined,{status:'unknown'},{...verified,socketCount:0},{...verified,socketColors:[14]},
  {...verified,socketColors:[-1,0,0]},{...verified,requiredProfessionRank:undefined}])
  assert.throws(()=>validatedAuctionEnhancementMetadata({metadataVersion:2,enhancements}),/item_variant_unverified/);
});
