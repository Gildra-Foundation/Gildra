import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTierSnapshot, currentWowSeason } from '../../lib/platform/games/tierSnapshot.ts';
const snapshot = () => ({game:'wow',activity:'raid',role:'tank',status:'live',seasonId:currentWowSeason,updatedAt:new Date().toISOString(),sources:[{slug:'tierlist-wowhead',status:'live',seasonId:currentWowSeason,updatedAt:new Date().toISOString()}],entries:[{classSlug:'warrior',specSlug:'protection',role:'tank',tier:'A',score:93}]});
test('unknown or mismatched season and unverified slice dates cannot be published',()=>{
 for(const seasonId of ['',undefined,'midnight-season-1']) assert.equal(normalizeTierSnapshot({...snapshot(),seasonId},'raid','tank'),null);
 for(const date of ['',undefined,'invalid',new Date(Date.now()+600_000).toISOString()]) {
  const s=snapshot(); s.sources[0].updatedAt=date as string; assert.equal(normalizeTierSnapshot(s,'raid','tank'),null);
 }
 const s=snapshot();s.sources[0].seasonId='midnight-season-1';assert.equal(normalizeTierSnapshot(s,'raid','tank'),null);
});
test('same-season stale ratings remain dated and missing metrics stay absent',()=>{
 const s=snapshot();s.sources[0].updatedAt=new Date(Date.now()-37*60*60_000).toISOString();
 const result=normalizeTierSnapshot(s,'raid','tank');assert.equal(result?.status,'stale');assert.equal(result?.updatedAt,s.sources[0].updatedAt);assert.equal(result?.entries[0].score,undefined);assert.equal(result?.entries[0].maxKey,undefined);
 assert.equal(normalizeTierSnapshot(s,'mythic_plus','tank'),null);
});
