import test from 'node:test';
import assert from 'node:assert/strict';
import { validatedAuctionEnhancementMetadata } from '../../../lib/wow/auctionItemVariant.ts';
const verified={status:'verified',socketColors:[14,0,0],socketCount:1,socketBonusId:42,requiredProfessionId:0,requiredProfessionRank:0};
test('native v3 exact socket metadata survives validation and is isolated from caller mutations',()=>{
 const result=validatedAuctionEnhancementMetadata({metadataVersion:3,enhancements:verified});
 assert.deepEqual(result,verified); result.socketColors[0]=0; assert.equal(verified.socketColors[0],14);
});
test('legacy metadata is unknown rather than certifying zero sockets',()=>{
 assert.deepEqual(validatedAuctionEnhancementMetadata({}),{status:'unknown'});
 assert.deepEqual(validatedAuctionEnhancementMetadata({metadataVersion:1,enhancements:verified}),{status:'unknown'});
});
test('malformed or incomplete v3 metadata cannot certify enhancements',()=>{
 for(const enhancements of [undefined,{status:'unknown'},{...verified,socketCount:0},{...verified,socketColors:[14]},
  {...verified,socketColors:[-1,0,0]},{...verified,requiredProfessionRank:undefined}])
  assert.throws(()=>validatedAuctionEnhancementMetadata({metadataVersion:3,enhancements}),/item_variant_unverified/);
});

test('v2 all-zero sockets coexist but old nonzero masks and indices are never reinterpreted',()=>{
 const empty={...verified,socketColors:[0,0,0],socketCount:0,socketBonusId:0};
 assert.deepEqual(validatedAuctionEnhancementMetadata({metadataVersion:2,enhancements:empty}),empty);
 for(const socketColors of [[7,0,0],[14,0,0],[0,1,0]])
  assert.deepEqual(validatedAuctionEnhancementMetadata({metadataVersion:2,enhancements:{...verified,socketColors}}),{status:'unknown'});
});
test('v3 requires known normalized masks and preserves nonprismatic identity',()=>{
 for(const color of [3,7,31,0xffffffff])
  assert.throws(()=>validatedAuctionEnhancementMetadata({metadataVersion:3,enhancements:{...verified,socketColors:[color,0,0]}}),/item_variant_unverified/);
 const fire={...verified,socketColors:[0x1000,0,0]};
 assert.deepEqual(validatedAuctionEnhancementMetadata({metadataVersion:3,enhancements:fire}),fire);
 assert.deepEqual(validatedAuctionEnhancementMetadata({metadataVersion:4,enhancements:verified}),{status:'unknown'});
});
