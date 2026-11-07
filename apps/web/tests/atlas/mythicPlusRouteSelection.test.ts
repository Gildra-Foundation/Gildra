import assert from 'node:assert/strict';
import { it } from 'node:test';
import { rankSimilarRuns, stepPull } from '../../lib/games/wow/mythicPlusRouteSelection.ts';
it('ranks nearest key then clear time, excludes self, preserves input', () => {
 const run={id:1,level:24,clearMs:1000};
 const candidates=[run,{id:2,level:24,clearMs:100},{id:3,level:24,clearMs:1100},{id:4,level:25,clearMs:1000}];
 assert.deepEqual(rankSimilarRuns(run,candidates).map(x=>x.id),[3,2,4]); assert.equal(candidates[0],run);
});
it('prefers matching specs on equal distance, counting duplicate specs once',()=>{
 const run={id:1,level:24,clearMs:1000,specs:[1,2,3]};
 assert.equal(rankSimilarRuns(run,[{id:2,level:24,clearMs:1000,specs:[1,1,1]},{id:3,level:24,clearMs:1000,specs:[1,2,3]}])[0].id,3);
});
it('steps through actual pull numbers and clamps both ends',()=>{
 assert.equal(stepPull([1,3,7],3,1),7); assert.equal(stepPull([1,3,7],7,1),7);
 assert.equal(stepPull([1,3,7],1,-1),1); assert.equal(stepPull([],1,1),1);
});
