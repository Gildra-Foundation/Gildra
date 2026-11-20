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
import { auctionGearMechanicalKey, createAuctionGearMechanicalCache } from '../../../lib/wow/auctionGearMechanicalCache.ts';
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

function fixture({ cache = createAuctionGearMechanicalCache(), freshMetadata = true, ownedBatch = false, workerEngine = engine,
  equipment = {equipped_items:[{item:{id:10},slot:{type:'HEAD'}}]} } = {}) {
  const state = { capacity: '2', batch: '25', ownedBatch, requests: [], active: 0, peak: 0 };
  const fetch = async (url, request) => {
    const path = new URL(url).pathname;
    if (path === '/healthz') return Response.json({}, { headers: { 'x-gildra-simulation-concurrency': state.capacity, 'x-gildra-simulation-batch': state.batch, ...(state.ownedBatch ? {'x-gildra-simulation-owned-batch': '1'} : {}) } });
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
        state.requests.push({ base, rows, ids, batch, signal: request.signal, finish(payload = batch ? {results} : results[0], status = 201, echo = state.ownedBatch) {
          resolve(Response.json(payload, { status, headers: { 'x-gildra-engine': 'simulationcraft',
            ...(echo ? {'x-gildra-simulation-owned-batch': '1'} : {}) } }));
        } });
        request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true });
      });
    } finally { state.active--; }
  };
  const create = vm.runInNewContext(code, { fetch, process, AbortSignal, AbortController, prepareGearLoadout, nativeGearSimulationMeasurement,
    assertFreshMarket, auctionAppliedStatsKey, auctionGearMechanicalKey, auctionGearMechanicalCache: cache, applyOwnedAuctionGearChanges,
    auctionGearProfileFingerprint, metricsFor: () => createAuctionGearDiagnostics() });
  const armory = { profile: {}, specializations: {}, activeTalentLoadout: 'fixture', equipment };
  const run = create({ armory, freshMetadata, specSlug: 'fury-warrior', specId: 72, scenario: 'single-target', loadout: [], market: { sourceUpdatedAt: new Date().toISOString() },
    encounter: {fightLengthSeconds: 120, targets: 1}, engine: () => workerEngine });
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
