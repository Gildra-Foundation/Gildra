import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assemblyRunnerFixture,independentOptimum,assemblyOption,fixtureDps} from './postdeploy-assembly-support.mjs';

test('every assembly response, including continuation, caps new native work at eight effects',async()=>{
 const h=await assemblyRunnerFixture();
 const first=await h.step();assert.equal(first.newCalls,8);assert.equal(first.result.exhaustiveComplete,false);
 assert(first.result.bestConfirmed,'First bounded response retains its confirmed incumbent');
 const checkpoint=structuredClone(h.entry.assemblyCheckpoint);
 const next=await h.step();
 assert(next.newCalls<=8,`Continuation must publish after at most eight effects; received ${next.newCalls}`);
 assert.equal(h.entry.context.options.length,8);assert.equal(next.result.exhaustiveComplete,false);
 assert.notDeepEqual(h.entry.assemblyCheckpoint,checkpoint,'Continuation advances its saved cursor');
 assert(h.state.saves>0&&h.state.flushes===2,'Both responses checkpoint and await publication barrier');
});

test('three-second native calls yield before another call once the ten-second assembly budget is reached',async()=>{
 const h=await assemblyRunnerFixture({nativeMs:3000});
 for(let index=0;index<2;index++){
  const step=await h.step();
  assert(step.newCalls>0&&step.newCalls<=4,`Soft deadline should stop before a fifth three-second call; received ${step.newCalls}`);
  assert(step.elapsed<=12000,'One already-started call may cross the soft ten-second budget');
  assert(step.result.bestConfirmed);assert.equal(step.result.exhaustiveComplete,false);
 }
});

test('discovery time consumes the same assembly budget before native evaluation',async()=>{
 const h=await assemblyRunnerFixture({nativeMs:3000,discoveryMs:9000});
 const step=await h.step();
 assert.equal(h.state.discoveryCalls,1);assert.equal(step.newCalls,1,'Nine seconds of metadata work leaves time to start only one native request');
 assert.equal(step.elapsed,12000);assert.equal(step.result.exhaustiveComplete,false);assert(step.result.bestConfirmed);
});

test('one slow upstream call may cross the soft deadline but no second call starts',async()=>{
 const h=await assemblyRunnerFixture({nativeMs:50000});
 const step=await h.step();
 assert.equal(step.newCalls,1);assert.equal(step.elapsed,50000);
 assert(step.result.bestConfirmed);assert.equal(step.result.exhaustiveComplete,false);
});

test('many short cloned-checkpoint resumes retain exact global value optimum, quantity and all-negative-single synergy',async()=>{
 const h=await assemblyRunnerFixture({nativeMs:3000}),expected=independentOptimum(h.state.pool);
 assert(h.state.pool.every(o=>fixtureDps([o])<1000));
 let result,steps=0;
 do{
  assert(steps++<100,'The full original effect domain must eventually finish');
  const step=await h.step();result=step.result;
  assert(step.newCalls<=4);assert(h.entry.context.options.length===8);
  // Model checkpoint rehydration without relying on object identity.
  h.entry.assemblyCheckpoint=structuredClone(h.entry.assemblyCheckpoint);
  h.entry.searchCheckpoint=structuredClone(h.entry.searchCheckpoint);
  h.entry.retainedSimulationCache=structuredClone(h.entry.retainedSimulationCache);
 }while(!result.exhaustiveComplete);
 assert(steps>8,'The fixture requires many bounded responses');
 assert.deepEqual(result.bestConfirmed.purchases.map(p=>`${p.auctionId}:${p.slotType}:base`).sort(),expected.ids);
 assert.equal(result.bestConfirmed.spentCopper,expected.cost);assert.equal(result.bestConfirmed.comparison.deltaDps,expected.delta);
 assert.equal(result.bestConfirmed.purchases.filter(p=>p.auctionId===100).length,2,'Quantity-two physical lot covers both rings');
 assert.equal(result.bestConfirmed.spentCopper,60,'Shared lot is paid once');
 assert.equal(h.calls.length,127,'All 128 feasible mechanical assignments are retained; baseline is already cached');
 assert.equal(result.searchLimited,false);
});

test('repricing, exclusions and newly arrived physical copies reuse measured effects without narrowing the domain',async()=>{
 const h=await assemblyRunnerFixture();let result,steps=0;
 do{assert(steps++<100);result=(await h.step()).result;}while(!result.exhaustiveComplete);
 const before=h.calls.length;
 const copy=assemblyOption(300,100,'FINGER_1',3,2),alias={...copy,id:'300:FINGER_2:base',candidate:{...copy.candidate,slotType:'FINGER_2'}};
 h.state.pool=[...h.state.pool.map(o=>o.auctionId===100?{...o,costCopper:30}:o),copy,alias];
 const exclusion={excludedOptionIds:[],excludedVariantKeys:[]};
 do{assert(steps++<150);result=(await h.step(exclusion)).result;}while(!result.exhaustiveComplete);
 assert.equal(h.calls.length,before,'Changed prices and same-effect physical copies require no new native measurement');
 const refreshedExpected=independentOptimum(h.state.pool);
 assert.equal(result.bestConfirmed.spentCopper,refreshedExpected.cost);assert.equal(h.context.options.length,10);
 assert.equal(refreshedExpected.cost,3,'Global value may prefer the newly cheap two-ring set');
 const excluded={excludedOptionIds:[copy.id,alias.id],excludedVariantKeys:[]};
 do{assert(steps++<200);result=(await h.step(excluded)).result;}while(!result.exhaustiveComplete);
 assert.equal(h.calls.length,before);assert.equal(result.bestConfirmed.spentCopper,70,'Excluding cheap physical copy retains older lot across both slots');
 assert(!result.bestConfirmed.purchases.some(p=>p.auctionId===300));
 const resumed=(await h.step(exclusion)).result;
 assert.equal(h.calls.length,before);assert.equal(resumed.bestConfirmed.spentCopper,refreshedExpected.cost);
});
