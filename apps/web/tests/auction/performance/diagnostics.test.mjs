import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuctionGearDiagnostics, logAuctionGearDiagnostics } from '../../../lib/wow/auctionGearDiagnostics.ts';
test('diagnostics separate queue/compute, retain first comparison and count failures', async () => {
 let now=10; const d=createAuctionGearDiagnostics(()=>now);
 await d.measure('queue',async()=>{now+=7;});
 await d.measure('compute',async()=>{now+=11;});
 d.comparison(); d.step(); d.cacheHit(); now+=3; d.comparison();
 await assert.rejects(d.measure('discovery',async()=>{now+=2;throw new Error('offline');}),/offline/);
 assert.deepEqual(d.snapshot(),{discovery:2,queue:7,compute:11,workerQueue:null,simulation:0,candidates:0,simulations:0,task:0,aborts:0,timeouts:0,steps:1,cacheHits:1,errors:1,comparisons:2,firstComparisonMs:18,totalMs:23,activeStepMs:0,stepDurations:[]});
});

test('step lifetime excludes idle, includes an active step and finishes idempotently', () => {
 let now=0; const d=createAuctionGearDiagnostics(()=>now);
 const finishSearch=d.beginStep('search'); now=7;
 assert.equal(d.snapshot().activeStepMs,7);
 finishSearch(); now=30; finishSearch();
 const finishAssembly=d.beginStep('assembly'); now=35; finishAssembly();
 assert.equal(d.snapshot().steps,2);
 assert.equal(d.snapshot().totalMs,35);
 assert.equal(d.snapshot().activeStepMs,12);
 assert.deepEqual(d.snapshot().stepDurations,[{kind:'search',durationMs:7},{kind:'assembly',durationMs:5}]);
});

test('step history is bounded and snapshots do not share mutable records', () => {
 let now=0; const d=createAuctionGearDiagnostics(()=>now);
 for(let i=1;i<=70;i++) { const finish=d.beginStep('search'); now+=i; finish(); }
 const snapshot=d.snapshot();
 assert.equal(snapshot.steps,70); assert.equal(snapshot.stepDurations.length,64);
 assert.equal(snapshot.stepDurations[0].durationMs,7);
 assert.equal(snapshot.activeStepMs,2485);
 snapshot.stepDurations[0].durationMs=999; snapshot.stepDurations.push({kind:'assembly',durationMs:999});
 assert.equal(d.snapshot().stepDurations.length,64);
 assert.equal(d.snapshot().stepDurations[0].durationMs,7);
});

test('production diagnostics are opt-in and omit attached identity and error details', t => {
 const original=process.env.AUCTION_GEAR_DIAGNOSTICS;
 t.after(()=>{if(original===undefined) delete process.env.AUCTION_GEAR_DIAGNOSTICS;else process.env.AUCTION_GEAR_DIAGNOSTICS=original;});
 const messages=[]; t.mock.method(console,'info',message=>messages.push(message));
 const snapshot=createAuctionGearDiagnostics(()=>0).snapshot();
 for(const setting of [undefined,'0','true']) {
   if(setting===undefined) delete process.env.AUCTION_GEAR_DIAGNOSTICS;else process.env.AUCTION_GEAR_DIAGNOSTICS=setting;
   logAuctionGearDiagnostics(snapshot);
 }
 assert.equal(messages.length,0);
 process.env.AUCTION_GEAR_DIAGNOSTICS='1';
 logAuctionGearDiagnostics({...snapshot,owner:'secret-owner',token:'secret-token',error:'secret-error',
   stepDurations:[{kind:'search',durationMs:2,token:'secret-step-token'}]});
 assert.equal(messages.length,1); assert.equal(messages[0].includes('secret'),false);
 const logged=JSON.parse(messages[0]);
 assert.equal(logged.event,'auction_gear_diagnostics');
 assert.deepEqual(logged.stepDurations,[{kind:'search',durationMs:2}]);
});

test('trusted worker timing separates unknown from measured zero', () => {
 const d=createAuctionGearDiagnostics();
 assert.equal(d.snapshot().compute,null);
 d.workerTiming('junk, native;dur=-2'); assert.equal(d.snapshot().compute,null);
 d.workerTiming('queue;dur=2.125, native;dur=0.000');
 assert.equal(d.snapshot().compute,0); assert.equal(d.snapshot().workerQueue,2.125);
 d.workerTiming('native;dur=3.500'); assert.equal(d.snapshot().compute,3.5);
});
test('timeouts, cancellation and ordinary errors remain distinct', () => {
 const d=createAuctionGearDiagnostics();
 d.failure(new DOMException('deadline','TimeoutError'));
 d.failure(new DOMException('cancelled','AbortError'));
 d.failure(new Error('upstream'));
 assert.equal(d.snapshot().timeouts,1);
 assert.equal(d.snapshot().aborts,1);
 assert.equal(d.snapshot().errors,1);
});
