import assert from 'node:assert/strict';
import test from 'node:test';
import {quickAuctionStatChoices} from '../../../lib/wow/auctionGearStatChoices.ts';

function armor(id, strength, costCopper, extras = {}) {
  return {id, costCopper, variantKey:id, candidate:{slotType:'CHEST',itemClassId:4,itemSubclassId:4,inventoryType:5,
    constraints:{}, variants:[{key:id,resolution:{nativeNoItemEffects:true,engine:'simc',stats:{strength,crit_rating:20,...extras},
      enhancements:{status:'verified',socketCount:0,socketBonusId:0,requiredProfessionId:0}}}]}};
}
const ids = options => quickAuctionStatChoices(options).map(o => o.id);
test('bounded gear selection keeps price and stat trade-offs', () => {
  assert.deepEqual(ids([armor('a',90,100),armor('b',110,100)]),['b']);
  assert.deepEqual(ids([armor('a',90,80),armor('b',110,100)]),['a','b']);
  assert.deepEqual(ids([armor('a',90,100,{crit_rating:30}),armor('b',110,100)]),['a','b']);
  assert.deepEqual(ids([armor('a',90,100),armor('b',90,90,{crit_rating:30})]),['b']);
});
test('protected equipment and unknown native facts are kept on either side', () => {
  for (const mutate of [
    c=>{delete c.variants[0].resolution.nativeNoItemEffects;}, c=>{c.variants[0].resolution.effects=['proc'];},
    c=>{c.variants[0].resolution.enhancements.socketCount=1;}, c=>{c.constraints.setId=2;},
    c=>{c.constraints.uniqueEquipped=true;}, c=>{c.constraints.crafted=true;}, c=>{c.slotType='FINGER_1';},
    c=>{c.itemSubclassId=1;}, c=>{c.variants[0].resolution.enhancements.status='unknown';},
  ]) for(const side of [0,1]) {
    const choices=[armor('a',90,100),armor('b',110,100)]; mutate(choices[side].candidate);
    assert.deepEqual(ids(choices),['a','b']);
  }
});

test('a measured upgrade needs a measured replacement at least as strong', () => {
  const pair = [armor('a',90,100),armor('b',110,100)];
  for (const measurements of [{a:100,b:99},{a:100}]) {
    assert.deepEqual(quickAuctionStatChoices(pair,o=>measurements[o.id]),pair);
  }
  assert.deepEqual(quickAuctionStatChoices(pair,o=>({a:100,b:101})[o.id]),[pair[1]]);
});
