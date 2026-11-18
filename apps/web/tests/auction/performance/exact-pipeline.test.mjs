import assert from 'node:assert/strict';
import test from 'node:test';
import { exactPipeline } from './exact-pipeline-fixture.mjs';

const nativeKey=request=>JSON.stringify([request.scenario,request.targets,request.fightLengthSeconds,request.gearChanges??[],request.precision??'ordinary']);

test('full exact pipeline persists every slice once and keeps the completed result and all native precision facts',async()=>{
  const enhancedPerTurn=new Map();
  const run=await exactPipeline({items:1,onPublication:({result,counts})=>{
    if(result.enhancementOptimization)enhancedPerTurn.set(counts.turns,(enhancedPerTurn.get(counts.turns)??0)+1);
  }});
  assert.equal(run.final.status,'completed',run.summary.taskError);
  assert.equal(run.final.result.enhancementOptimization.complete,true);
  assert.equal(run.summary.equipmentChecked,2,'Both retained equipment and the purchasable replacement were exhaustively evaluated');
  assert.equal(run.summary.counts.stage,431);
  assert.equal(run.summary.counts.native,434,'The 431 ordinary requests and three high-precision rechecks each run once');
  assert.equal(new Set(run.requests.map(nativeKey)).size,run.requests.length);
  assert.equal(run.summary.counts.searchWrites,548);
  assert.equal(run.summary.counts.jobWrites,660);
  assert.equal(run.summary.counts.ownership,run.summary.counts.turns-1);
  assert.equal(run.summary.counts.armory,run.summary.counts.ownership);
  assert.equal(run.summary.counts.market,run.summary.counts.ownership+1);
  assert([...enhancedPerTurn.values()].every(count=>count<=8),'No ninth duplicate publication after eight durable slices');
  assert.deepEqual(structuredClone(run.diskEntry.data.latestAssemblyResult.enhancementOptimization),structuredClone(run.final.result.enhancementOptimization));
  assert.equal(run.diskEntry.data.exhaustiveEnhancementState.cursor.exhausted,true);
  const stage = run.final.result.enhancementOptimization;
  assert.equal(run.requests.filter(request=>request.precision==='finalist').length,3);
  assert.equal(stage.finalistRecheck.significant,false);
  for(const row of stage.recommendations){
    assert.equal(row.simulation.iterations,stage.finalistRecheck.keys.includes(row.configuration.key)?3000:750);
    assert.equal(row.simulation.confidence,95);
  }
});

test('failed exact checkpoint write never publishes that unsaved result and retains retryable state',async()=>{
  let failed=false;
  const run=await exactPipeline({items:1,onWrite:({kind,data})=>{
    if(!failed&&kind==='search'&&data.exhaustiveEnhancementState?.currentOptionIds?.length&&data.latestAssemblyResult?.enhancementOptimization){failed=true;throw Error('auction_storage_unavailable');}
  }});
  assert(failed);
  assert.equal(run.final.status,'failed');
  assert.equal(run.final.error,'auction_storage_unavailable');
  assert.equal(run.publications.filter(row=>row.enhancementOptimization).length,1,'Only the preceding durable baseline slice was published');
  assert(run.publications.at(-1).enhancementOptimization.recommendations.every(row=>row.optionIds.length===0));
  assert(run.diskEntry.data.exhaustiveEnhancementState.currentOptionIds.length>0);
  assert.equal(run.diskEntry.data.exhaustiveEnhancementState.equipmentChecked,1,'The enclosing failure path preserves mutated cursor state');
  assert.equal(run.diskEntry.data.exhaustiveEnhancementState.cursor.exhausted,true,'Last equipment assignment selected; its enhancement domain is still pending');
  assert.equal(run.diskEntry.data.latestAssemblyResult.enhancementOptimization.complete,false);
});

test('cancelling after a durable exact update stops later native work and keeps the published checkpoint',async()=>{
  let nativeAtCancel;
  const run=await exactPipeline({items:1,onPublication:({result,entry,jobs,owner,counts})=>{
    if(result.enhancementOptimization?.recommendations.some(row=>row.optionIds.length)&&nativeAtCancel===undefined){nativeAtCancel=counts.native;
      jobs.cancelAuctionGearJob(owner,jobs.getActiveAuctionGearJob(owner,entry.id).id);}
  }});
  assert.equal(run.final.status,'cancelled');
  assert.equal(run.summary.counts.native,nativeAtCancel);
  assert.equal(run.publications.filter(row=>row.enhancementOptimization).length,2);
  assert.deepEqual(run.diskEntry.data.latestAssemblyResult.enhancementOptimization,run.publications.at(-1).enhancementOptimization);
  assert.equal(run.entry.busy,false);
});

test('the next full turn still validates the profile before any additional native or assembly work',async()=>{
  let nativeBeforeChange;
  const run=await exactPipeline({items:1,beforeTurn:({entry,fixture,counts})=>{
    if(entry.exhaustiveEnhancementState&&nativeBeforeChange===undefined){nativeBeforeChange=counts.native;fixture.state.armory.activeTalentLoadout='synthetic-changed-talents';}
  }});
  assert.equal(run.final.status,'failed');
  assert.equal(run.final.error,'character_snapshot_changed');
  assert.equal(run.summary.counts.native,nativeBeforeChange);
  assert.equal(run.final.result.enhancementOptimization.complete,false);
});
