import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAuctionGearScenarios } from '../../../lib/wow/auctionGearScenarioExecution.ts';
const scenarios = [{scenario:'single-target',fightLengthSeconds:60,targets:1}, {scenario:'aoe',fightLengthSeconds:60,targets:5}];
const measure = dps => ({dps,dpsError:1,confidence:95,iterations:750,engine:'SimulationCraft synthetic'});
test('scenario budget yields with durable baseline and completes without duplicating measurements', async () => {
  const cache = new Map(); let now=0, calls=0, yielded=false;
  const simulate = async (key, encounter) => {
    const identity=JSON.stringify([key,encounter]);
    if(cache.has(identity)) return cache.get(identity);
    calls++; now+=11000;
    const result=measure(key===null?100:120); cache.set(identity,result); return result;
  };
  let result;
  for(let turn=0;turn<5;turn++) {
    const start=now; yielded=false;
    result=await evaluateAuctionGearScenarios(['best'],scenarios,new AbortController().signal,simulate,
      {shouldYield:()=>now-start>=10000,onYield:()=>{yielded=true;}});
    assert(now-start<=11000, 'At most the already running slow call overruns this step');
    if(!yielded) break;
  }
  assert.equal(yielded,false); assert.equal(calls,4);
  assert.equal(result.length,2); assert(result.every(row=>row.candidates.length===1));
});
test('first completed scenario candidate is published while later candidate is blocked', async () => {
  let release, started; const held=new Promise(resolve=>{release=resolve;});
  const entered=new Promise(resolve=>{started=resolve;}); const updates=[];
  const pending=evaluateAuctionGearScenarios(['first','second'],scenarios.slice(0,1),new AbortController().signal,
    async key=>{if(key==='second'){started();await held;}return measure(key===null?100:120);},
    {onProgress:rows=>updates.push(rows)});
  await entered; assert.equal(updates.length,1); assert.equal(updates[0][0].candidates.length,1);
  release(); await pending; assert.equal(updates.length,2);
  assert.equal(updates[0][0].candidates.length,1,'Later work cannot mutate already published rows');
});
