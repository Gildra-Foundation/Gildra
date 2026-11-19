import assert from 'node:assert/strict';
import test from 'node:test';
import { exactPipeline } from './exact-pipeline-fixture.mjs';
import { readAuctionState } from '../../../lib/wow/auctionGearPersistence.ts';

const nativeKey=request=>JSON.stringify([request.scenario,request.targets,request.fightLengthSeconds,request.gearChanges??[],request.precision??'ordinary']);

test('full exact pipeline publishes every distinct enhancement result in order and checkpoints its terminal cursor',async()=>{
  const expected=[],published=[];
  const run=await exactPipeline({items:1,
    onEnhancementSlice:({result,counts})=>{
      const payload=JSON.stringify([counts.turns,result]);
      if(expected.at(-1)!==payload)expected.push(payload);
    },
    onPublication:({result,counts,entry})=>{
      if(!result.enhancementOptimization)return;
      const payload=JSON.stringify([counts.turns,result.enhancementOptimization]);
      published.push(payload);
      const disk=readAuctionState('search',entry.id).data.latestAssemblyResult.enhancementOptimization;
      assert.equal(JSON.stringify([counts.turns,disk]),payload);
    },
  });
  assert.equal(run.final.status,'completed',run.summary.taskError);
  assert.equal(run.final.result.enhancementOptimization.complete,true);
  assert.equal(run.summary.equipmentChecked,2,'Both retained equipment and the purchasable replacement were exhaustively evaluated');
  const ordinary=run.requests.filter(request=>request.precision!=='finalist');
  assert.equal(ordinary.length,1+21*21,'Owned baseline plus every combination of 20 or no gem and 20 or no scroll');
  assert.equal(run.summary.counts.native,ordinary.length+3);
  assert.equal(new Set(run.requests.map(nativeKey)).size,run.requests.length);
  assert.deepEqual(published,expected);
  assert(run.summary.counts.searchWrites<run.summary.counts.stage,'The full job writes fewer search snapshots than enhancement evaluations');
  assert(run.summary.counts.jobWrites<run.summary.counts.stage+3*run.summary.counts.turns,'Unchanged enhancement slices must not each write the job');
  assert.equal(run.summary.counts.ownership,run.summary.counts.turns-1);
  assert.equal(run.summary.counts.armory,run.summary.counts.ownership);
  assert.equal(run.summary.counts.market,run.summary.counts.ownership+1);
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


test('cancelling a slice with an unchanged public result commits its newer private cursor',async()=>{
  let beforeCancel,prior;
  const run=await exactPipeline({items:1,onEnhancementSlice:({result,entry,jobs,owner,counts,writesBefore})=>{
    if(!beforeCancel && counts.searchWrites===writesBefore && !result.complete) {
      const ordinal=state=>Object.values(state.stage.checkpoints)[0]?.exactNextConfiguration;
      prior=ordinal(readAuctionState('search',entry.id).data.exhaustiveEnhancementState);
      beforeCancel=ordinal(entry.exhaustiveEnhancementState);
      assert(BigInt(beforeCancel)>BigInt(prior));
      jobs.cancelAuctionGearJob(owner,jobs.getActiveAuctionGearJob(owner,entry.id).id);
    }
  }});
  assert(beforeCancel);
  assert.equal(run.final.status,'cancelled');
  const [checkpoint]=Object.values(run.diskEntry.data.exhaustiveEnhancementState.stage.checkpoints);
  assert.equal(checkpoint.exactNextConfiguration,beforeCancel);
  assert(checkpoint.cache[checkpoint.bestMeasuredDps.configuration.key]);
  assert.deepEqual(run.diskEntry.data.latestAssemblyResult.enhancementOptimization,run.publications.at(-1).enhancementOptimization);
});

test('an enhancement turn resumes from the last on-disk cursor when a newer private slice was lost',async()=>{
  const cursor=state=>Object.values(state.stage.checkpoints)[0]?.exactNextConfiguration;
  let disk,target,restarted=false,recovered=false;
  const run=await exactPipeline({items:1,
    onEnhancementSlice:({entry,jobs,owner,counts,writesBefore})=>{
      const current=entry.exhaustiveEnhancementState;
      if(!disk && writesBefore===counts.searchWrites && current.currentOptionIds?.length) {
        // This is the file a replacement process would read if killed here.
        disk=readAuctionState('search',entry.id).data;
        target=cursor(current);
        assert(BigInt(cursor(disk.exhaustiveEnhancementState))<BigInt(target));
      } else if(restarted && cursor(current)===target) {
        recovered=true;
        jobs.cancelAuctionGearJob(owner,jobs.getActiveAuctionGearJob(owner,entry.id).id);
      }
    },
    beforeTurn:({entry})=>{
      if(!disk||restarted)return;
      entry.exhaustiveEnhancementState=disk.exhaustiveEnhancementState;
      entry.latestAssemblyResult=disk.latestAssemblyResult;
      restarted=true;
    },
  });
  assert(restarted&&recovered);
  assert.equal(run.final.status,'cancelled');
  assert.equal(cursor(run.diskEntry.data.exhaustiveEnhancementState),target);
  assert.deepEqual(run.diskEntry.data.latestAssemblyResult.enhancementOptimization,disk.latestAssemblyResult.enhancementOptimization);
});
