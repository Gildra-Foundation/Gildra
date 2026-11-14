import assert from 'node:assert/strict';
import test from 'node:test';
import { harness, record, offer } from './priority-feedback-harness.mjs';

async function fixture() {
  const lot = { ...offer(), itemId: 90000 };
  const h = await harness({ entity: record(90000), offers: [lot], reference: { offer: lot, itemLevel: 100, requiredLevel: 1, stats: [] } });
  h.state.measure = request => request.fightLengthSeconds * 10 + request.targets * 100 + (request.gearChanges?.length ? request.targets * 50 : 0);
  return h;
}
async function complete(h, entry) {
  let result;
  for (let step = 0; step < 20; step++) {
    result = await h.runner.assembleAuctionGearSearch(entry, undefined, h.signal(), h.progress, 'unused-synthetic');
    if (result.exhaustiveComplete) return result;
  }
  assert.fail('Small fixture must finish bounded assembly');
}

test('custom encounter reaches worker and finalists use each scenario baseline with isolated warm caches', async () => {
  const h = await fixture();
  const compareScenarios = [
    { scenario: 'single-target', fightLengthSeconds: 60, targets: 1 },
    { scenario: 'aoe', fightLengthSeconds: 180, targets: 3 },
  ];
  const { entry } = await h.start({ scenario: 'aoe', fightLengthSeconds: 150, targets: 4, compareScenarios });
  assert(h.state.simulationRequests.length >= 2);
  assert(h.state.simulationRequests.every(request => request.fightLengthSeconds === 150 && request.targets === 4));
  const result = await complete(h, entry);
  assert.equal(result.scenarioComparisons.length, 2);
  for (const row of result.scenarioComparisons) {
    assert.equal(row.baseline.dps, row.encounter.fightLengthSeconds * 10 + row.encounter.targets * 100);
    assert(row.candidates.length > 0 && row.candidates.length <= 3);
    for (const candidate of row.candidates) {
      assert.equal(candidate.comparison.deltaDps, row.encounter.targets * 50);
      assert.equal(candidate.comparison.uncertainty.significant, true);
    }
  }
  const calls = h.state.simulationRequests.length;
  await complete(h, entry);
  assert.equal(h.state.simulationRequests.length, calls, 'Repeated finalist comparisons must reuse scenario-specific measurements');
});

test('absent comparison scenarios performs no finalist simulations', async () => {
  const h = await fixture();
  const { entry } = await h.start({ fightLengthSeconds: 90 });
  const result = await complete(h, entry);
  assert.equal(result.scenarioComparisons, undefined);
  assert(h.state.simulationRequests.every(request => request.fightLengthSeconds === 90 && request.targets === 1));
  assert.equal(h.state.simulationRequests.length, 2, 'Only the baseline and one unique candidate effect need native work');
});

test('slow additional scenarios retain partial progress and resume without repeating native calls', async t => {
  const h=await fixture();
  const {entry}=await h.start({compareScenarios:[{scenario:'aoe',fightLengthSeconds:180,targets:3}]});
  let now=Date.now(); t.mock.method(Date,'now',()=>now);
  h.state.measure=request=>{if(request.targets===3)now+=11000; return 1000+(request.gearChanges?.length?100:0);};
  const updates=[];
  let result=await h.runner.assembleAuctionGearSearch(entry,undefined,h.signal(),h.progress,'unused-synthetic',r=>updates.push(r));
  assert.equal(result.exhaustiveComplete,true);
  assert.equal(result.scenarioComparisonsComplete,false,'Completed main search does not mean scenarios completed');
  assert.equal(h.state.simulationRequests.filter(r=>r.targets===3).length,1,'No second native call after a slow baseline exhausted the step');
  result=await h.runner.assembleAuctionGearSearch(entry,undefined,h.signal(),h.progress,'unused-synthetic',r=>updates.push(r));
  if(!result.scenarioComparisonsComplete) result=await h.runner.assembleAuctionGearSearch(entry,undefined,h.signal(),h.progress,'unused-synthetic',r=>updates.push(r));
  assert.equal(result.scenarioComparisonsComplete,true);
  assert.equal(h.state.simulationRequests.filter(r=>r.targets===3).length,2,'Scenario baseline and identical finalist effects are retained');
  assert(updates.some(r=>r.scenarioComparisons?.some(row=>row.candidates.length>0)));
});
