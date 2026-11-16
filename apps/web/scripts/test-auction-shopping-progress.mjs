/** Isolated browser-storage contract fixtures; no account data. */
import assert from 'node:assert/strict';
import { auctionShoppingProgressKey, parseAuctionShoppingProgress } from '../lib/wow/auctionShoppingProgress.ts';
const allowed=['item:1:exact:1','gem:2:2'];
assert.deepEqual([...parseAuctionShoppingProgress(JSON.stringify({version:1,purchasedKeys:[allowed[0],allowed[0],'item:1:other:1',false]}),allowed)],[allowed[0]]);
for(const raw of [null,'broken','{}','null','[]',JSON.stringify({version:2,purchasedKeys:allowed}),JSON.stringify({version:1,purchasedKeys:'all'})]) assert.equal(parseAuctionShoppingProgress(raw,allowed).size,0);
const key=auctionShoppingProgressKey('character','profile','enhanced:exact');
assert.notEqual(key,auctionShoppingProgressKey('other','profile','enhanced:exact'));
assert.notEqual(key,auctionShoppingProgressKey('character','changed-profile','enhanced:exact'));
assert.notEqual(key,auctionShoppingProgressKey('character','profile','enhanced:other'));
assert.notEqual(auctionShoppingProgressKey('a:b','c','d'),auctionShoppingProgressKey('a','b:c','d'));
console.log('Purchased progress exact variant filtering, malformed storage and character/profile/loadout isolation passed.');
