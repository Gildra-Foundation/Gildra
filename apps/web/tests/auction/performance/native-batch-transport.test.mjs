import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getEventListeners } from 'node:events';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import { createAuctionGearDiagnostics } from '../../../lib/wow/auctionGearDiagnostics.ts';
import { auctionAppliedStatsKey } from '../../../lib/wow/auctionGearEffects.ts';
import { applyOwnedAuctionGearChanges } from '../../../lib/wow/auctionGearEnhancedConfiguration.ts';
import { auctionGearProfileFingerprint } from '../../../lib/wow/auctionGearFingerprint.ts';
import { auctionGearMechanicalKey, purchasedRingScoreChanges, createAuctionGearMechanicalCache } from '../../../lib/wow/auctionGearMechanicalCache.ts';
import { assertFreshMarket } from '../../../lib/wow/auctionMarket.ts';
import { nativeGearSimulationMeasurement, prepareGearLoadout } from '../../../lib/wow/gearSimulation.ts';

const source = readFileSync(new URL('../../../lib/wow/auctionGearRunner.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(source.slice(source.indexOf('function createAuctionSimulator('))) + ';createAuctionSimulator';
const engine = 'SimulationCraft batch transport fixture';
const tick = () => new Promise(resolve => setImmediate(resolve));
const signal = () => new AbortController().signal;

function option(itemId, slotType = 'WRIST') {
  return { candidate: { itemId, slotType, inventoryType: slotType === 'WRIST' ? 9 : 6,
    itemClassId: 4, itemSubclassId: 4, eligible: true, constraints: {}, compatibility: { specId: 72 },
    variants: [{ key: 'base', bonusIds: [] }] }, variantKey: 'base' };
}

function fixture({ cache = createAuctionGearMechanicalCache(), freshMetadata = true, ownedBatch = false, workerEngine = engine, metadataEngine = workerEngine,
  equipment = {equipped_items:[{item:{id:10},slot:{type:'HEAD'}}]} } = {}) {
  const state = { capacity: '2', batch: '25', ownedBatch, mixedSlots:false, requests: [], active: 0, peak: 0 };
  const fetch = async (url, request) => {
    const path = new URL(url).pathname;
    if (path === '/healthz') return Response.json({}, { headers: { 'x-gildra-simulation-concurrency': state.capacity, 'x-gildra-simulation-batch': state.batch, ...(state.ownedBatch ? {'x-gildra-simulation-owned-batch': '1'} : {}), ...(state.mixedSlots ? {'x-gildra-simulation-mixed-slots':'1'} : {}) } });
    const body = JSON.parse(request.body), batch = path.endsWith('/batch');
    const base = batch ? body.base : body, rows = batch ? body.candidates : [body];
    const ids = rows.map(row => row.gearChanges?.[0]?.itemId ?? row.ownedChanges?.[0].gems[0]?.itemId
      ?? row.ownedChanges?.[0].enchantId ?? base.armory.equipment.equipped_items[0]?.sockets?.[1]?.item?.id
      ?? base.armory.equipment.equipped_items[0]?.enchantments?.find(entry=>entry.enchantment_slot?.id===0)?.enchantment_id ?? 1);
    const results = ids.map(id => ({ dps: id, dpsMean: id + 0.25, dpsError: 0.12, confidence: 95, iterations: base.precision === 'auction-finalist' ? 750 : 100, engine: workerEngine }));
    state.active++;
    state.peak = Math.max(state.active, state.peak);
    try {
      return await new Promise((resolve, reject) => {
        state.requests.push({ base, rows, ids, batch, mixed:body.mixedSlots, signal: request.signal, finish(payload = batch ? {results} : results[0], status = 201, echo = state.ownedBatch) {
          resolve(Response.json(payload, { status, headers: { 'x-gildra-engine': 'simulationcraft',
            ...(echo ? {'x-gildra-simulation-owned-batch': '1'} : {}), ...(body.mixedSlots && state.mixedSlots ? {'x-gildra-simulation-mixed-slots':'1'} : {}) } }));
        } });
        request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true });
      });
    } finally { state.active--; }
  };
  const create = vm.runInNewContext(code, { fetch, process, AbortSignal, AbortController, prepareGearLoadout, nativeGearSimulationMeasurement,
    assertFreshMarket, auctionAppliedStatsKey, auctionGearMechanicalKey, purchasedRingScoreChanges, auctionGearMechanicalCache: cache, applyOwnedAuctionGearChanges,
    auctionGearProfileFingerprint, metricsFor: () => createAuctionGearDiagnostics() });
  const armory = { profile: {}, specializations: {}, activeTalentLoadout: 'fixture', equipment };
  const run = create({ armory, freshMetadata, specSlug: 'fury-warrior', specId: 72, scenario: 'single-target', loadout: [], market: { sourceUpdatedAt: new Date().toISOString() },
    encounter: {fightLengthSeconds: 120, targets: 1}, engine: () => metadataEngine });
  async function finishFrom(start) {
    for (let i = start; i < state.requests.length; i++) { state.requests[i].finish(); await tick(); }
  }
  return { state, run, finishFrom };
}

function armor(reagent, enchantId = 5250, workerEngine = engine) {
  const row = option(120);
  row.id = `lot-${reagent}`;
  row.variantKey = `variant-${reagent}`;
  row.customization = { enchantId };
  row.candidate.constraints = { uniqueEquipped: false, crafted: false };
  Object.assign(row.candidate.variants[0], { key: row.variantKey, itemLevel: 100,
    modifiers: [{ type: 39, value: reagent }], resolution: { engine: workerEngine, metadataVersion: 3,
      nativeNoItemEffects: true, effectsVerified: true, effects: [], appliedStatsV1: Array(46).fill(2),
      enhancements: { status: 'verified', socketCount: 0, socketColors: [0, 0, 0],
        socketBonusId: 0, requiredProfessionId: 0, requiredProfessionRank: 0 } } });
  return row;
}

test('full enhanced candidates share certified native measurements and keep changed enhancements and finalist precision separate', async () => {
  const { state, run } = fixture();
  async function measure(row, { precision, owned = [], native }) {
    const before = state.requests.length;
    const result = run([row], signal(), owned, precision);
    await tick();
    assert.equal(state.requests.length - before, Number(native));
    if (native) state.requests.at(-1).finish();
    return result;
  }
  const full = 'certified-candidate';
  const first = armor(1), second = armor(2);
  assert.deepEqual(await measure(first, { precision: full, native: true }), await measure(second, { precision: full, native: false }));
  await measure(armor(2, 5251), { precision: full, native: true });
  const owned = [{ slotType: 'HEAD', itemId: 10, enchantId: 5250, gems: [] }];
  await measure(first, { precision: full, native: true, owned });
  await measure(second, { precision: full, native: false, owned });
  await measure(second, { native: true });
  assert.equal((await measure(first, { precision: 'finalist', native: true })).iterations, 750);
  assert.equal((await measure(second, { precision: 'finalist', native: true })).iterations, 750);
  const missing = armor(4);
  delete missing.candidate.variants[0].resolution.nativeNoItemEffects;
  await measure(missing, { precision: full, native: true });
  const invalid = armor(5);
  invalid.candidate.variants[0].modifiers[0].value = -1;
  await assert.rejects(run([invalid], signal(), [], full), /unsupported_item_modifiers/);
});

test('concurrent certified candidates share one successful measurement in either order while the finalist runs independently', async () => {
  for (const order of [[1, 2], [2, 1]]) {
    const { state, run, finishFrom } = fixture(), shared = signal();
    await run.concurrency(shared);
    const [first, second] = order.map(reagent => armor(reagent));
    const results = Promise.all([run([first], shared, [], 'certified-candidate'),
      run([second], shared, [], 'certified-candidate'), run([second], shared, [], 'finalist')]);
    await tick();
    assert.deepEqual(state.requests.map(r => r.base.precision), ['auction-candidate', 'auction-finalist']);
    await finishFrom(0);
    const [a, b, finalist] = await results;
    assert.deepEqual({ ...a }, { ...b });
    assert.notEqual(a, b);
    assert.equal(a.iterations, 100);
    assert.equal(finalist.iterations, 750);
    assert.deepEqual(await run([armor(3)], shared, [], 'certified-candidate'), a);
    assert.equal(state.requests.length, 2);
  }
});

test('concurrent worn ring permutations reuse a fight when a purchased armor proof has a different key', async () => {
  const pinned = 'SimulationCraft 1210-01 · 18428cd';
  const rings = ['FINGER_1','FINGER_2'].map((slot, i) => ({
    slot: {type:slot}, item: {id:500+i}, inventory_type: {type:'FINGER'}, level: {value:150},
  }));
  const { run, state, finishFrom } = fixture({workerEngine:pinned, equipment:{equipped_items:rings}, ownedBatch:true});
  const shared = signal();
  await run.concurrency(shared);
  const submit = (enchants, mode='certified-candidate') => run([armor(1,5250,pinned)], shared,
    rings.map((r,i) => ({slotType:r.slot.type,itemId:r.item.id,enchantId:enchants[i],gems:[]})), mode);
  const results = Promise.all([submit([8022,7964]),submit([7964,8022]),submit([7965,8022]),submit([7964,8022],'finalist')]);
  await tick();
  await finishFrom(0);
  const [a,b,,precise] = await results;
  assert.deepEqual({...a},{...b});
  assert.equal(precise.iterations,750);
  assert.equal(state.requests.flatMap(request => request.rows).length,3);
});

test('ordinary discovery candidates with the same mechanical key share a pending fight', async () => {
  const { state, run, finishFrom } = fixture(), shared = signal();
  await run.concurrency(shared);
  const first = option(121), second = { ...option(121), id: 'another-listing' };
  const results = Promise.all([run([first], shared), run([second], shared), run([option(122)], shared)]);
  await tick();
  assert.deepEqual(state.requests.flatMap(request => request.ids), [121, 122]);
  await finishFrom(0);
  const [a, b, c] = await results;
  assert.deepEqual({ ...a }, { ...b });
  assert.notEqual(a.dps, c.dps);
});

test('failed shared measurements reach both callers and retry with one new request', async () => {
  const { state, run } = fixture(), shared = signal();
  const submit = () => [1, 2].map(reagent => run([armor(reagent)], shared, [], 'certified-candidate'));
  const failed = Promise.allSettled(submit());
  await tick();
  assert.equal(state.requests.length, 1);
  state.requests[0].finish({}, 503);
  assert.deepEqual((await failed).map(row => row.reason.message), ['simulation_unavailable', 'simulation_unavailable']);
  const retried = Promise.all(submit());
  await tick();
  assert.equal(state.requests.length, 2);
  state.requests[1].finish();
  const [a, b] = await retried;
  assert.deepEqual({ ...a }, { ...b });
});

test('separate cancellation scopes run equivalent candidates independently, and historical metadata cannot authorize sharing', async () => {
  const { state, run } = fixture(), first = new AbortController(), second = signal();
  await run.concurrency(second);
  const results = Promise.allSettled([run([armor(1)], first.signal, [], 'certified-candidate'),
    run([armor(2)], second, [], 'certified-candidate')]);
  await tick();
  assert.equal(state.requests.length, 2);
  first.abort();
  assert.equal(state.requests[1].signal.aborted, false);
  state.requests[1].finish();
  const [cancelled, finished] = await results;
  assert.equal(cancelled.reason.name, 'AbortError');
  assert.equal(finished.value.iterations, 100);

  const restored = fixture({ freshMetadata: false });
  await restored.run.concurrency(second);
  const measurements = Promise.all([1, 2].map(id => restored.run([armor(id)], second, [], 'certified-candidate')));
  await tick();
  assert.equal(restored.state.requests.length, 2);
  await restored.finishFrom(0);
  await measurements;
});

test('an enchanted piece shares item context only when the engine ignores it and preserves its raw scaling modifiers', async () => {
  for (const pinned of [false, true]) {
    const workerEngine = pinned ? 'SimulationCraft batch transport fixture · 18428cd' : engine;
    const { state, run } = fixture({ workerEngine });
    for (const [contextId, drop, expectedCalls] of [[13, 80, 1], [17, 80, pinned ? 1 : 2], [17, 81, pinned ? 2 : 3]]) {
      const row = armor(1, 5250, workerEngine);
      const variant = row.candidate.variants[0];
      variant.contextId = contextId;
      variant.modifiers.push({type: 9, value: drop});
      variant.resolution.nativeScalingInputsV1 = [0, 0, 0, 0];
      const before = state.requests.length;
      const result = run([row], signal(), [], 'certified-candidate');
      await tick();
      assert.equal(state.requests.length, expectedCalls);
      if (state.requests.length > before) state.requests.at(-1).finish();
      assert.equal((await result).engine, workerEngine);
    }
  }
});

test('first native candidate starts immediately, then two lanes share profilesets and return exact cached rows', async () => {
  const { state, run, finishFrom } = fixture();
  assert.equal(run.batchSize, 0);
  await run.concurrency(signal());
  assert.equal(run.batchSize, 25);
  const shared = signal();
  const all = Array.from({ length: 73 }, (_, i) => run([option(100 + i)], shared));
  assert.equal(getEventListeners(shared, 'abort').length, 1);
  assert.equal(state.requests.length, 1);
  assert.deepEqual(state.requests[0].ids, [100]);
  await tick();
  assert.equal(state.requests.length, 2);
  assert.equal(state.requests[1].ids.length, 25);
  state.requests[0].finish();
  assert.equal((await all[0]).dps, 100.25);
  await tick();
  assert.equal(state.requests[2].ids.length, 25);
  assert.equal(state.peak, 2);
  await finishFrom(1);
  const results = await Promise.all(all);
  assert.equal(getEventListeners(shared, 'abort').length, 0);
  assert.deepEqual(results.map(row => row.dps), Array.from({length:73}, (_, i) => 100.25 + i));
  assert.deepEqual(state.requests.map(request => request.ids.length), [1,25,25,22]);
  assert.equal((await run([option(110)], signal())).dpsError, 0.12);
  assert.equal(state.requests.length, 4);
});

test('one idle lane starts a sparse tail without a fill timer and a small backlog is split across both lanes', async () => {
  const { state, run, finishFrom } = fixture();
  await run.concurrency(signal());
  const one = run([option(100)], signal()), two = run([option(101)], signal());
  await tick();
  assert.deepEqual(state.requests.map(request => request.ids), [[100], [101]]);
  const later = Array.from({length:8}, (_, i) => run([option(102 + i)], signal()));
  state.requests[0].finish();
  await tick();
  state.requests[1].finish();
  await tick();
  assert.deepEqual(state.requests.map(request => request.ids.length), [1, 1, 5, 3]);
  await finishFrom(2);
  await Promise.all([one, two, ...later]);
});

test('one incompatible row cannot put the whole compatible group on one core',async()=>{
  const {state,run,finishFrom}=fixture(), shared=signal();
  await run.concurrency(shared);
  const rows=Array.from({length:10},(_,i)=>option(300+i));
  rows.push(option(310,'WAIST'));
  const all=Promise.all(rows.map(row=>run([row],shared)));
  await tick();
  assert.deepEqual(state.requests.map(req=>req.ids.length),[1,6]);
  state.requests[0].finish();
  await tick();
  assert(state.requests[2].ids.length<=4);
  await finishFrom(1);
  assert.equal((await all).length,11);
  assert.equal(state.requests.flatMap(req=>req.ids).length,11);
});

test('distinct signals cancel queued and running callers independently and abort the request when its last caller cancels', async () => {
  const { state, run } = fixture();
  await run.concurrency(signal());
  const controllers = Array.from({length:9}, () => new AbortController());
  const all = Promise.allSettled(controllers.map((controller, i) => run([option(100 + i)], controller.signal)));
  await tick();
  assert.deepEqual(state.requests[1].ids, [101, 102, 103, 104, 105]);
  controllers[8].abort();
  controllers[1].abort();
  assert.equal(state.requests[1].signal.aborted, false);
  for (const i of [2,3,4,5]) controllers[i].abort();
  assert.equal(state.requests[1].signal.aborted, true);
  await tick();
  assert.deepEqual(state.requests[2].ids, [106,107]);
  controllers[6].abort();
  assert.equal(state.requests[2].signal.aborted, false);
  state.requests[0].finish();
  state.requests[2].finish();
  const results = await all;
  assert.deepEqual(results.map(row => row.status === 'fulfilled' ? row.value.dps : row.reason.name),
    [100.25,'AbortError','AbortError','AbortError','AbortError','AbortError','AbortError',107.25,'AbortError']);
});

test('an owned-only market validates its engine before sharing glove candidate scores', async () => {
  const cache = createAuctionGearMechanicalCache();
  const equipment = {equipped_items:[{item:{id:10},slot:{type:'HANDS'}}]};
  for (const freshMetadata of [true,false]) {
    const {run,state,finishFrom} = fixture({cache,equipment,freshMetadata,metadataEngine:'',workerEngine:'SimulationCraft 1210-01 · 18428cd'});
    const initial = run([],signal());
    await tick();
    assert.equal(state.requests.length,1);
    await finishFrom(0);
    const baseline = await initial;
    const edit = id => [{slotType:'HANDS',itemId:10,gems:[],enchantId:id}];
    // The first measurement was made before an engine was known. A later
    // check can safely reuse a score only after it matches the native revision.
    const first = run([],signal(),edit(3238),'certified-candidate');
    await tick();
    await finishFrom(1);
    assert.equal((await first).dps,baseline.dps);
    const nativeCalls = state.requests.length;
    assert.equal((await run([],signal(),edit(5937),'certified-candidate')).dps,baseline.dps);
    assert.equal(state.requests.length,nativeCalls);
  }
});

test('mixed-slot candidates share only an advertised worker and retry on rollback', async () => {
  for (const rollback of [null, "missing-header", "unsupported-revision"]) {
    const {state,run,finishFrom} = fixture();
    state.mixedSlots = true;
    await run.concurrency(signal());
    const calls = ['WRIST','WAIST','WRIST','WAIST','WRIST','WAIST','WRIST'].map((slot,i) =>
      run([option(200+i,slot)],signal()));
    await tick();
    const group = state.requests.find(request => request.mixed);
    assert(group && new Set(group.rows.map(row=>row.gearChanges[0].slot)).size>1);
    if (rollback === "missing-header") state.mixedSlots = false;
    if (rollback === "unsupported-revision") group.finish({code:"unsupported_mixed_slots"},422);
    await finishFrom(0);
    assert.deepEqual((await Promise.all(calls)).map(row=>row.dps),[200.25,201.25,202.25,203.25,204.25,205.25,206.25]);
    if (rollback) assert(group.ids.every(id=>state.requests.some(request=>!request.batch&&request.ids.includes(id))));
  }
});

test('transport groups by effective equipment, changed slots and native precision', async () => {
  const { state, run, finishFrom } = fixture();
  await run.concurrency(signal());
  const owned = [{ slotType:'HEAD', itemId:10, enchantId:1234, gems:[] }];
  const requests = [
    [110,'WRIST'], [111,'WRIST',owned], [112,'WAIST'], [113,'WRIST',[], 'finalist'], [114,'WRIST',owned],
    [115,'WAIST'], [116,'WRIST',[], 'finalist'], [117,'WRIST'],
  ];
  const all = requests.map(([id, slot, changes, precision]) => run([option(id, slot)], signal(), changes, precision));
  await tick();
  await finishFrom(0);
  await Promise.all(all);
  const batches = state.requests.filter(request => request.batch);
  assert.deepEqual(batches.map(request => request.ids), [[111,114], [112,115], [113,116]]);
  assert.equal(batches[0].base.armory.equipment.equipped_items[0].enchantments[0].enchantment_id, 1234);
  assert.equal(batches[1].rows[0].gearChanges[0].slot, 'waist');
  assert.equal(batches[2].base.precision, 'auction-finalist');
  assert(batches.every(request => !Object.hasOwn(request.base, 'gearChanges')));
});

test('missing batch endpoint falls back to bounded single calls and health resets stale capabilities', async () => {
  const { state, run, finishFrom } = fixture();
  for (const [capacity,batch,expected] of [['2','invalid',0],['1','25',0],['2','1',0],['2','99',25],['2','3',3]]) {
    Object.assign(state, {capacity,batch});
    await run.concurrency(signal());
    assert.equal(run.batchSize,expected);
  }
  const all = Array.from({length:7}, (_, i) => run([option(100 + i)], signal()));
  await tick();
  assert.equal(state.requests[1].ids.length, 3);
  state.requests[1].finish({}, 404);
  await tick();
  assert.equal(run.batchSize, 0);
  assert.equal(state.requests.length, 2);
  state.requests[0].finish();
  await tick();
  await finishFrom(2);
  assert.deepEqual((await Promise.all(all)).map(row => row.dps), Array.from({length:7}, (_, i) => 100.25 + i));
  assert(state.requests.slice(2).every(request => !request.batch));
});

test('incorrect batch length rejects every submitted row without caching its measurements', async () => {
  const { state, run } = fixture();
  await run.concurrency(signal());
  const all = Promise.allSettled(Array.from({length:4}, (_, i) => run([option(100 + i)], signal())));
  await tick();
  state.requests[1].finish({results:[]});
  state.requests[0].finish();
  await tick();
  state.requests[2].finish();
  const rows = await all;
  assert.deepEqual(rows.map(row => row.status === 'fulfilled' ? row.value.dps : row.reason.message),
    [100.25, 'invalid_simulation_result', 'invalid_simulation_result', 103.25]);
  const retry = run([option(101)], signal());
  await tick();
  state.requests[3].finish();
  assert.equal((await retry).dps,101.25);
});

test('health checks do not authorize cached results from a restored engine before native verification', async () => {
  const cache = createAuctionGearMechanicalCache();
  const initial = fixture({cache});
  const measured = initial.run([option(111)], signal());
  initial.state.requests[0].finish();
  assert.equal((await measured).engine, engine);

  const restored = fixture({cache, freshMetadata:false});
  await restored.run.concurrency(signal());
  const stale = restored.run([option(111)], signal());
  assert.equal(restored.state.requests.length, 1);
  restored.state.requests[0].finish({dps:111,dpsMean:111.25,dpsError:0.1,confidence:95,iterations:100,engine:'SimulationCraft replacement'});
  await assert.rejects(stale, /simulation_version_changed/);
  const valid = restored.run([option(111)], signal());
  await tick();
  assert.equal(restored.state.requests.length, 2);
  restored.state.requests[1].finish();
  assert.equal((await valid).dps, 111.25);
  assert.equal((await restored.run([option(111)], signal())).engine, engine);
  assert.equal(restored.state.requests.length, 2);
});


const ownedEquipment = {equipped_items:[{item:{id:10},slot:{type:'HEAD'},bonus_list:[41,90],timewalker_level:78,
  modified_crafting_stat:[{id:32},{id:36}],sockets:[{socket_type:{type:'PRISMATIC'},item:{id:73},bonus_list:[91]},
    {socket_type:{type:'PRISMATIC'},item:{id:74},bonus_list:[92]}],
  enchantments:[{enchantment_slot:{id:0},enchantment_id:80},{enchantment_slot:{id:1},enchantment_id:81}]}]};
const edit = (id) => [{slotType:'HEAD',itemId:10,enchantId:200 + id,gems:[{index:1,itemId:id}]}];

test('owned-only profilesets share the complete original instance and distinguish each gem, enchant and precision', async () => {
  const {state, run, finishFrom} = fixture({ownedBatch:true, equipment:ownedEquipment});
  await run.concurrency(signal());
  assert.equal(run.ownedBatch,true);
  const requests = Array.from({length:12}, (_,i) => run([], signal(), edit(100+i), i >= 8 ? 'finalist' : undefined));
  await tick();
  assert.equal(state.requests[0].batch,false);
  const single = state.requests[0].base.armory.equipment.equipped_items[0];
  assert.deepEqual(single.sockets[1],{socket_type:{type:'PRISMATIC'},item:{id:100}});
  assert.deepEqual(single.sockets[0],ownedEquipment.equipped_items[0].sockets[0]);
  assert.deepEqual(single.modified_crafting_stat,ownedEquipment.equipped_items[0].modified_crafting_stat);
  await finishFrom(0);
  const results = await Promise.all(requests);
  assert.deepEqual(results.map(row=>[row.dps,row.iterations]), requests.map((_,i)=>[100.25+i,i >= 8 ? 750 : 100]));
  const batches = state.requests.filter(request=>request.batch);
  assert.deepEqual(batches.map(request=>request.rows.length),[7,4]);
  for (const {rows,ids,base} of batches) {
    assert.deepEqual(base.armory.equipment,ownedEquipment);
    assert.deepEqual(rows,ids.map(id=>({gearChanges:[],ownedChanges:edit(id)})));
  }
  const issued = state.requests.length;
  assert.equal((await run([],signal(),edit(103))).dps,103.25);
  assert.equal(state.requests.length,issued);
});

test('mixed purchased and owned candidates retain independent overrides for every changed item', async () => {
  const equipment = {equipped_items:[...ownedEquipment.equipped_items,{slot:{type:'LEGS'},item:{id:20},bonus_list:[70]}]};
  const {state, run, finishFrom} = fixture({ownedBatch:true,equipment});
  await run.concurrency(signal());
  const changes = id => [...edit(id),{slotType:'LEGS',itemId:20,enchantId:300+id,gems:[]}];
  const requests = Array.from({length:7},(_,i)=>run([option(101+i)],signal(),changes(101+i)));
  await tick();
  await finishFrom(0);
  await Promise.all(requests);
  for (const request of state.requests.filter(request=>request.batch)) {
    assert.deepEqual(request.base.armory.equipment,equipment);
    for (const row of request.rows) assert.deepEqual(row.ownedChanges,changes(row.gearChanges[0].itemId));
  }
  assert(state.requests.some(request=>request.batch));
});

test('unacknowledged and unsupported owned batches retry exact patched singles before caching', async () => {
  for (const [status,code,stillSupported] of [[201,undefined,false],[400,'invalid_request',false],[422,'unsupported_owned_batch',true]]) {
    const {state,run,finishFrom} = fixture({ownedBatch:true,equipment:ownedEquipment});
    await run.concurrency(signal());
    const requests = [100,101,102].map(id=>run([],signal(),edit(id)));
    await tick();
    const batch = state.requests[1];
    assert.equal(batch.batch,true);
    batch.finish(code ? {code} : {results:[]},status,false);
    await tick();
    assert.equal(run.ownedBatch,stillSupported);
    await finishFrom(0);
    assert.deepEqual((await Promise.all(requests)).map(row=>row.dps),[100.25,101.25,102.25]);
    assert.deepEqual(state.requests.slice(2).map(request=>request.base.armory.equipment.equipped_items[0].sockets[1].item.id),[101,102]);
    assert(state.requests.slice(2).every(request=>!request.batch));
  }
});

test('an older worker receives distinct owned-only edits as complete armory singles', async () => {
  const {state,run,finishFrom} = fixture({equipment:ownedEquipment});
  await run.concurrency(signal());
  const requests = [100,101,102,103].map(id=>run([],signal(),edit(id)));
  await tick();
  await finishFrom(0);
  assert.deepEqual((await Promise.all(requests)).map(row=>row.dps),[100.25,101.25,102.25,103.25]);
  assert(state.requests.every(request=>!request.batch && !Object.hasOwn(request.rows[0],'ownedChanges')));
});


test('enchant-only edits on the same owned item share a batch and keep separate measurements', async () => {
  const equipment = {equipped_items:[{slot:{type:'HEAD'},item:{id:10},
    enchantments:[{enchantment_slot:{id:0},enchantment_id:80},{enchantment_slot:{id:1},enchantment_id:81}]}]};
  const {state,run,finishFrom} = fixture({ownedBatch:true,equipment});
  await run.concurrency(signal());
  const changes = enchantId => [{slotType:'HEAD',itemId:10,enchantId,gems:[]}];
  const enchants = [801,802,803,804,805,806];
  const requests = enchants.map(id=>run([],signal(),changes(id)));
  await tick();
  await finishFrom(0);
  assert.deepEqual((await Promise.all(requests)).map(row=>row.dps),enchants.map(id=>id+0.25));
  assert.deepEqual(state.requests[1].rows.map(row=>row.ownedChanges[0].enchantId),[802,803,804]);
  assert.deepEqual(state.requests[1].base.armory.equipment,equipment);
  const count = state.requests.length;
  await Promise.all(enchants.map(id=>run([],signal(),changes(id))));
  assert.equal(state.requests.length,count);
});

test('ordinary auction measurements reuse parsed item inputs across lots on the pinned engine', async () => {
  const {state, run} = fixture({workerEngine: 'SimulationCraft 1210-01 · 18428cd'});
  const first = option(240948, 'NECK');
  const variant = first.candidate.variants[0];
  variant.bonusIds = [9042];
  variant.contextId = 13;
  variant.modifiers = [{type: 28, value: 1218}, {type: 40, value: 123}];
  const second = structuredClone(first);
  second.candidate.variants[0].contextId = 2;
  second.candidate.variants[0].modifiers[1].value = 456;
  const job = run([first], signal());
  await tick();
  state.requests[0].finish();
  const score = await job;
  assert.deepEqual(await run([second], signal()), score);
  assert.equal(state.requests.length, 1);
  second.candidate.variants[0].modifiers[0].value++;
  const changed = run([second], signal());
  await tick();
  assert.equal(state.requests.length, 2);
  state.requests[1].finish();
  await changed;
});

test('a direct chest enchant preserves rounded suffix equivalence only for proved candidate fights', async () => {
  const pinned = 'SimulationCraft 1210-01 · 18428cd';
  function chest(suffix, enchantId, workerEngine) {
    const o = armor(suffix, enchantId, workerEngine);
    Object.assign(o.candidate, { itemId: 116427, inventoryType: 5, slotType: 'CHEST' });
    const v = o.candidate.variants[0];
    Object.assign(v, { itemLevel: 16, modifiers: [{ type: 28, value: 1218 }], bonusIds: [suffix] });
    Object.assign(v.resolution, { nativeScalingInputsV1: [0, 0, 0, 0], nativeSuffixProgramV1: (suffix === 47 ? 'a' : 'b').repeat(64) });
    return o;
  }
  for (const [name, enchant, worker, edit, shouldShare] of [
    ['direct stat', 6623, pinned, () => {}, true],
    ['direct resistance', 15, pinned, () => {}, true],
    ['another enchant', 6623, pinned, o => { o.customization.enchantId = 6624; }, false],
    ['spell effect', 2661, pinned, () => {}, false],
    ['different final rating', 6623, pinned, (_, v) => { v.resolution.appliedStatsV1[27]++; }, false],
    ['missing proof', 6623, pinned, (_, v) => { delete v.resolution.nativeSuffixProgramV1; }, false],
    ['a gem was added', 6623, pinned, (o, v) => { o.customization.gemIds = [22459]; Object.assign(v.resolution.enhancements, { socketColors: [14, 0, 0], socketCount: 1 }); }, false],
    ['uncertified engine', 6623, engine, () => {}, false],
  ]) {
    const { state, run } = fixture({ workerEngine: worker });
    const first = chest(47, enchant, worker), second = chest(70, enchant, worker);
    edit(second, second.candidate.variants[0]);
    for (const [o, mode, expected] of [[first, 'certified-candidate', true], [second, 'certified-candidate', !shouldShare],
      [first, 'finalist', true], [second, 'finalist', true]]) {
      const before = state.requests.length;
      const result = run([o], signal(), [], mode);
      await tick();
      assert.equal(state.requests.length - before, Number(expected), name);
      if (expected) state.requests.at(-1).finish();
      assert.equal((await result).iterations, mode === 'finalist' ? 750 : 100);
    }
  }
});

test('purchased rings share only direct enchant transfers, preserving item slots, gems and independent finalists', async () => {
  const pinned = 'SimulationCraft 1210-01 · 18428cd';
  function ring(itemId, slot, enchantId, gemId) {
    const row = option(itemId, slot);
    row.candidate.inventoryType = 11;
    row.candidate.itemSubclassId = 0;
    Object.assign(row.candidate.variants[0], { itemLevel: 125, resolution: { engine: pinned,
      nativeNoItemEffects: true, enhancements: { status: 'verified', socketCount: 1, socketColors: [14,0,0] } } });
    row.customization = { enchantId, gemIds: [gemId] };
    return row;
  }
  for (const [label, change, aliases] of [
    ['same two items', () => {}, true],
    ['different gem', o => { o.customization.gemIds = [240877]; }, false],
    ['another host item', o => { o.candidate.itemId++; }, false],
    ['lower level', o => { o.candidate.variants[0].itemLevel = 119; }, false],
    ['unverified effect', o => { delete o.candidate.variants[0].resolution.nativeNoItemEffects; }, false],
    ['proc enchant', o => { o.customization.enchantId = 6550; }, false],
  ]) {
    const {run,state} = fixture({workerEngine:pinned});
    const first = [ring(258908,'FINGER_1',7964,240869),ring(240947,'FINGER_2',8022,115804)];
    const reverse = [ring(240947,'FINGER_2',7964,115804),ring(258908,'FINGER_1',8022,240869)];
    change(reverse[1]);
    for (const [rows, mode, native] of [[first,'certified-candidate',true],[reverse,'certified-candidate',!aliases],
      [first,'finalist',true],[reverse,'finalist',true]]) {
      const before = state.requests.length;
      const result = run(rows,signal(),[],mode);
      await tick();
      assert.equal(state.requests.length - before, Number(native), label);
      if (native) {
        const request = state.requests.at(-1);
        // The worker receives the caller's exact paid enhancements.
        assert.deepEqual(request.base.gearChanges.map(c => c.enchantId), rows.map(o => o.customization.enchantId));
        request.finish();
      }
      assert.equal((await result).iterations, mode === 'finalist' ? 750 : 100);
    }
  }
});

test('single prismatic rings reuse certified direct gem permutations only for candidate combat',async()=>{
  const pinned='SimulationCraft 1210-01 · 18428cd';
  const ring=(id,slot,gems,enchantId)=>{
    const row=option(id,slot);row.candidate.inventoryType=11;
    Object.assign(row.candidate.variants[0],{itemLevel:150,resolution:{engine:pinned,nativeNoItemEffects:true,
      enhancements:{status:'verified',socketColors:[14,0,0],socketCount:1,socketBonusId:0,requiredProfessionId:0}}});
    row.customization={gemIds:gems,enchantId};return row;
  };
  for(const [name,mutate,shared] of [
    ['direct',()=>{},true],
    ['socket bonus',r=>{r.candidate.variants[0].resolution.enhancements.socketBonusId=123;},false],
    ['second socket',r=>{r.candidate.variants[0].resolution.enhancements.socketCount=2;},false],
    ['intrinsic effect',r=>{r.candidate.variants[0].resolution.nativeNoItemEffects=false;},false],
    ['unverified gem',r=>{r.customization.gemIds=[240870];},false],
    ['low-level host',r=>{r.candidate.variants[0].itemLevel=9;},false],
    ['proc enchant',r=>{r.customization.enchantId=6550;},false],
  ]){
    const {run,state,finishFrom}=fixture({workerEngine:pinned});
    const first=[ring(501,'FINGER_1',[153710],7964),ring(502,'FINGER_2',[130216],8022)];
    const other=[ring(502,'FINGER_2',[130215],7964),ring(501,'FINGER_1',[153711],8022)];
    mutate(other[1]);
    const sig=signal();await run.concurrency(sig);
    const pending=Promise.all([run(first,sig,[],'certified-candidate'),run(other,sig,[],'certified-candidate')]);
    await tick();await finishFrom(0);await pending;
    const rows=state.requests.flatMap(request=>request.rows);
    assert.equal(rows.length,shared?1:2,name);
    assert.deepEqual(rows[0].gearChanges.map(c=>c.gemIds),[[153710],[130216]]);
    const before=state.requests.length;
    const final=run(other,sig,[],'finalist');await tick();
    assert.equal(state.requests.length,before+1);
    assert.deepEqual(state.requests.at(-1).base.gearChanges.map(c=>c.gemIds),other.map(o=>o.customization.gemIds));
    await finishFrom(before);assert.equal((await final).iterations,750);
  }
});

test('direct enchant transfers between a purchased ring and an explicitly edited worn ring preserve both receipts', async () => {
  const pinned = 'SimulationCraft 1210-01 · 18428cd';
  const equipment = {equipped_items: ['FINGER_1','FINGER_2'].map((slot,index) => ({
    slot:{type:slot}, item:{id:500+index}, inventory_type:{type:'FINGER'}, level:{value:150},
    sockets:[{socket_type:{type:'PRISMATIC'}}],
  }))};
  for (const purchasedSlot of ['FINGER_1','FINGER_2']) {
    const wornSlot = purchasedSlot === 'FINGER_1' ? 'FINGER_2' : 'FINGER_1';
    const worn = equipment.equipped_items.find(i=>i.slot.type===wornSlot);
    const {run,state} = fixture({workerEngine:pinned,equipment});
    const offer = option(258908,purchasedSlot);
    offer.candidate.inventoryType = 11;
    Object.assign(offer.candidate.variants[0],{itemLevel:130,resolution:{engine:pinned,nativeNoItemEffects:true,
      enhancements:{status:'verified',socketColors:[14,0,0],socketCount:1}}});
    async function measure(a,b,gem,mode,native) {
      const before = state.requests.length;
      const owned = [{slotType:wornSlot,itemId:worn.item.id,enchantId:b,gems:[{index:0,itemId:gem}]}];
      const selection = {...offer,customization:{enchantId:a,gemIds:[115804]}};
      const result = run([selection],signal(),owned,mode);
      await tick();
      assert.equal(state.requests.length - before, Number(native));
      if (native) {
        const request = state.requests.at(-1);
        assert.equal(request.base.gearChanges[0].enchantId,a);
        const equipped = request.base.armory.equipment.equipped_items.find(i=>i.slot.type===wornSlot);
        assert.equal(equipped.enchantments[0].enchantment_id,b);
        assert.equal(equipped.sockets[0].item.id,gem);
        request.finish();
      }
      return result;
    }
    const first = await measure(8022,7964,240869,'certified-candidate',true);
    assert.deepEqual(first,await measure(7964,8022,240869,'certified-candidate',false));
    await measure(7964,8022,240870,'certified-candidate',true);
    await measure(6550,8022,240869,'certified-candidate',true);
    assert.equal((await measure(8022,7964,240869,'finalist',true)).iterations,750);
    assert.equal((await measure(7964,8022,240869,'finalist',true)).iterations,750);
  }
});
