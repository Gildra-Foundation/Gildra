import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import { cheapestAuctionEffectSelection } from "../../../lib/wow/auctionGearEffects.ts";

// Synthetic lots only: no market, credentials, HTTP, native process or disk
// checkpoint. Freeze the exact pre-optimization allocator from b38b679f8bae9e6
// so differential tests also run in shallow CI without historical git objects.
const beforeSource = String.raw`type Purchase = { options: AuctionGearOption[]; costCopper: number };
const selectionKey = (options: AuctionGearOption[]) => options.map(option => option.id).sort().join("|");
const preferred = (a: Purchase, b?: Purchase) => !b || a.costCopper < b.costCopper ||
  a.costCopper === b.costCopper && selectionKey(a.options) < selectionKey(b.options);
const bitCount = (value: number) => { let count = 0; for (; value; value &= value - 1) count++; return count; };

/**
 * Allocate actual lots to one effect per slot. An auction can cover several slots
 * up to its quantity and is paid once. Connected components avoid multiplying
 * independent slots; within a component, exact subset DP retains non-greedy lots.
 */
export async function cheapestAuctionEffectSelection(groups: AuctionEffectGroup[], budgetCopper: number,
  signal: AbortSignal): Promise<Purchase | null> {
  signal.throwIfAborted();
  if (groups.length > 16) throw new Error("invalid_equipment_slots");
  const lots = new Map<number, { mask: number; costCopper: number; quantity: number;
    itemId: number; variantKey: string; options: Map<number, AuctionGearOption> }>();
  for (let index = 0; index < groups.length; index++) for (const option of groups[index].options) {
    const lot = lots.get(option.auctionId) ?? { mask: 0, costCopper: option.costCopper, quantity: option.quantity,
      itemId: option.candidate.itemId, variantKey: option.variantKey, options: new Map() };
    if (lot.costCopper !== option.costCopper || lot.quantity !== option.quantity ||
        lot.itemId !== option.candidate.itemId || lot.variantKey !== option.variantKey) throw new Error("invalid_auction_selection");
    lot.mask |= 1 << index;
    const previous = lot.options.get(index);
    if (!previous || option.id < previous.id) lot.options.set(index, option);
    lots.set(option.auctionId, lot);
  }
  const parents = groups.map((_, index) => index);
  const root = (index: number): number => parents[index] === index ? index : (parents[index] = root(parents[index]));
  for (const lot of lots.values()) {
    const indices = groups.map((_, index) => index).filter(index => lot.mask & (1 << index));
    for (const index of indices.slice(1)) parents[root(index)] = root(indices[0]);
  }
  const components = new Map<number, number>();
  for (let index = 0; index < groups.length; index++) components.set(root(index), (components.get(root(index)) ?? 0) | (1 << index));
  const result: Purchase = { options: [], costCopper: 0 };
  let work = 0;
  for (const component of components.values()) {
    signal.throwIfAborted();
    let states = new Map<number, Purchase>([[0, { options: [], costCopper: 0 }]]);
    for (const lot of lots.values()) {
      if (!(lot.mask & component)) continue;
      const next = new Map(states);
      for (const [covered, purchase] of states) {
        const available = lot.mask & component & ~covered;
        for (let subset = available; subset; subset = (subset - 1) & available) {
          if (++work % 256 === 0) { await new Promise<void>(resolve => setImmediate(resolve)); signal.throwIfAborted(); }
          if (bitCount(subset) > lot.quantity) continue;
          const costCopper = purchase.costCopper + lot.costCopper;
          if (!Number.isSafeInteger(costCopper)) throw new Error("invalid_budget");
          if (costCopper > budgetCopper - result.costCopper) continue;
          const options = [...purchase.options, ...[...lot.options].filter(([index]) => subset & (1 << index)).map(([, option]) => option)];
          const candidate = { options, costCopper }, key = covered | subset;
          if (preferred(candidate, next.get(key))) next.set(key, candidate);
        }
      }
      states = next;
    }
    const best = states.get(component);
    if (!best) return null;
    result.options.push(...best.options);
    result.costCopper += best.costCopper;
  }
  result.options.sort((a, b) => a.candidate.slotType.localeCompare(b.candidate.slotType));
  signal.throwIfAborted();
  return result;
}
`;
const compile = (source, MapType = Map) => new Function("Map", stripTypeScriptTypes(source, { mode: "strip" })
  .replace(/^export /gm, "") + "\nreturn cheapestAuctionEffectSelection;")(MapType);
const before = compile(beforeSource);
const currentSource = readFileSync(new URL("../../../lib/wow/auctionGearEffects.ts", import.meta.url), "utf8");
const afterSource = currentSource.slice(currentSource.indexOf("type Purchase ="));
const signal = () => new AbortController().signal;
const slots = ["HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "WRIST", "HANDS", "WAIST", "LEGS", "FEET",
  "FINGER_1", "FINGER_2", "TRINKET_1", "TRINKET_2", "MAIN_HAND", "OFF_HAND"];
const option = (auctionId, index, costCopper, quantity = 1, itemId = 700000) => ({
  id: `${String(auctionId).padStart(6, "0")}:${slots[index]}:base`, auctionId, costCopper, quantity,
  variantKey: "base", candidate: { slotType: slots[index], itemId },
});
const identity = result => result && { costCopper: result.costCopper, ids: result.options.map(row => row.id).sort() };
const key = result => result.options.map(row => row.id).sort().join("|");
async function outcome(fn, groups, budget) {
  try { return { result: await fn(groups, budget, signal()) }; }
  catch (error) { return { error: error.message }; }
}
async function equivalent(groups, budget) {
  const snapshot = structuredClone(groups);
  const expected = await outcome(before, groups, budget), actual = await outcome(cheapestAuctionEffectSelection, groups, budget);
  assert.deepEqual(actual, expected);
  assert.deepEqual(groups, snapshot, "allocator must not mutate offers or caller group order");
  return "result" in actual ? { result: identity(actual.result) } : actual;
}
function random(seed) {
  let state = seed >>> 0;
  return max => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % max; };
}
function market(mixed, count = 40) {
  const groups = slots.map(() => ({ options: [] }));
  let auctionId = 1;
  for (let index = 0; index < groups.length; index++) {
    if (mixed && (index === 11 || index === 15)) continue;
    const indices = mixed && (index === 10 || index === 14) ? [index, index + 1] : [index];
    for (let lot = 0; lot < count; lot++, auctionId++) {
      const quantity = indices.length > 1 && lot % 3 === 0 ? 2 : 1;
      const price = 10000 + (lot * 17 % 97) * 100 + (quantity === 2 ? 3500 : 0);
      for (const slot of indices) groups[slot].options.push(option(auctionId, slot, price, quantity, 700000 + index));
    }
  }
  return groups;
}
// Independent raw slot-assignment oracle, without connected components or DP.
// Each physical lot costs once and can equip only its actual available quantity.
function bruteForce(groups, budget) {
  let best = null;
  function visit(index, options) {
    if (index !== groups.length) {
      for (const row of groups[index].options) visit(index + 1, [...options, row]);
      return;
    }
    const lots = new Map(); let costCopper = 0;
    for (const row of options) {
      const count = (lots.get(row.auctionId) ?? 0) + 1;
      if (count > row.quantity) return;
      if (count === 1) costCopper += row.costCopper;
      lots.set(row.auctionId, count);
    }
    if (costCopper > budget) return;
    const candidate = { options, costCopper };
    if (!best || costCopper < best.costCopper || costCopper === best.costCopper && key(candidate) < key(best)) best = candidate;
  }
  visit(0, []); return identity(best);
}

test("allocation matches frozen DP across 16 slots, hundreds of lots and overlapping rings/weapons", async () => {
  for (const mixed of [false, true]) {
    const groups = market(mixed);
    const expected = await cheapestAuctionEffectSelection(groups, Number.MAX_SAFE_INTEGER, signal());
    assert.equal(expected.options.length, 16);
    for (const budget of [0, expected.costCopper - 1, expected.costCopper, expected.costCopper + 1, Number.MAX_SAFE_INTEGER])
      await equivalent(groups, budget);
    if (mixed) {
      for (const pair of [[10, 11], [14, 15]]) {
        const assigned = expected.options.filter(row => pair.some(index => row.candidate.slotType === slots[index]));
        assert.equal(assigned.length, 2); assert.equal(assigned[0].auctionId, assigned[1].auctionId);
        assert.equal(assigned[0].quantity, 2);
      }
    }
  }
});

test("random disconnected and overlapping lots preserve every cost, tie and quantity decision", async () => {
  const rng = random(0x51a7e);
  for (let sample = 0; sample < 240; sample++) {
    const groups = Array.from({ length: 1 + rng(6) }, () => ({ options: [] }));
    for (let lot = 1; lot <= 2 + rng(20); lot++) {
      const cost = rng(8), quantity = rng(4), mask = 1 + rng((1 << groups.length) - 1);
      for (let index = 0; index < groups.length; index++) if (mask & (1 << index)) {
        const row = option(lot, index, cost, quantity);
        groups[index].options.push(row);
        if (rng(3) === 0) groups[index].options.push({ ...row, id: `z-${row.id}` });
      }
    }
    for (const budget of [0, rng(25), 100]) await equivalent(groups, budget);
  }
});

test("small exact assignments agree with independent enumeration, including stack choices and ties", async () => {
  const rng = random(0xa110ca7e);
  for (let sample = 0; sample < 100; sample++) {
    const groups = Array.from({ length: 1 + rng(4) }, () => ({ options: [] }));
    for (let lot = 1; lot <= 5; lot++) {
      const cost = rng(10), quantity = 1 + rng(3), mask = 1 + rng((1 << groups.length) - 1);
      for (let index = 0; index < groups.length; index++) if (mask & (1 << index)) groups[index].options.push(option(lot, index, cost, quantity));
    }
    const budget = rng(30);
    assert.deepEqual(identity(await cheapestAuctionEffectSelection(groups, budget, signal())), bruteForce(groups, budget));
  }
});

test("singleton tie ordering and duplicate alias choice are unchanged", async () => {
  const rows = [option(11, 0, 7), option(2, 0, 7), option(3, 0, 8)];
  rows.push({ ...rows[1], id: "000000:HEAD:base" });
  rows[0].quantity = 0;
  const groups = [{ options: rows }];
  const result = await equivalent(groups, 7);
  assert.deepEqual(result.result, { costCopper: 7, ids: ["000000:HEAD:base"] });
  await equivalent([{ options: [...rows].reverse() }], 7);
});

test("validation cannot be bypassed by an already cheap lot or an infeasible earlier slot", async () => {
  for (const change of [{ costCopper: 2 }, { quantity: 2 }, { variantKey: "different" }, { candidate: { slotType: "HEAD", itemId: 700001 } }]) {
    const row = option(1, 0, 1), groups = [{ options: [] }, { options: [row, { ...row, ...change }] }];
    assert.deepEqual(await equivalent(groups, 100), { error: "invalid_auction_selection" });
  }
  for (const cost of [Number.MAX_SAFE_INTEGER + 1, 1.5, Infinity]) {
    assert.deepEqual(await equivalent([{ options: [option(1, 0, 1), option(2, 0, cost)] }], 1), { error: "invalid_budget" });
    assert.deepEqual(await equivalent([{ options: [option(1, 0, 1), option(2, 0, cost, 0)] }], 1),
      { result: { costCopper: 1, ids: [option(1, 0, 1).id] } });
  }
  await equivalent([{ options: [option(1, 0, NaN)] }], 100);
  await equivalent([{ options: [option(1, 0, -0)] }], 0);
  await equivalent([{ options: [option(1, 0, -1)] }], -1);
  assert.deepEqual(await equivalent([], -1), { result: { costCopper: 0, ids: [] } });
  assert.deepEqual(await equivalent([{ options: [] }], 100), { result: null });
  assert.deepEqual(await equivalent(Array.from({ length: 17 }, () => ({ options: [] })), 100), { error: "invalid_equipment_slots" });
  // A cost can overflow only when combining lots; the connected DP must retain
  // that rejection even if the enormous budget would otherwise admit it.
  const groups = [0, 1].map(index => ({ options: [option(1, index, Number.MAX_SAFE_INTEGER), option(2, index, Number.MAX_SAFE_INTEGER)] }));
  assert.deepEqual(await equivalent(groups, Infinity), { error: "invalid_budget" });
});

test("pre-cancellation and cancellation at a cooperative yield are preserved for both paths", async () => {
  for (const fn of [before, cheapestAuctionEffectSelection]) {
    const controller = new AbortController(); controller.abort(new Error("synthetic_pre_abort"));
    await assert.rejects(fn(market(false), Infinity, controller.signal), /synthetic_pre_abort/);
    for (const mixed of [false, true]) {
      const active = new AbortController(); const stop = setImmediate(() => active.abort(new Error("synthetic_mid_abort")));
      try { await assert.rejects(fn(market(mixed, 80), Infinity, active.signal), /synthetic_mid_abort/); }
      finally { clearImmediate(stop); }
    }
  }
});

test("optional before/after allocator benchmark keeps identical selections at the same full scope", {
  skip: process.env.AUCTION_EFFECT_ALLOCATION_BENCHMARK !== "1",
}, async () => {
  const median = samples => [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];
  const repeats = 5, calls = 250, samples = [];
  function mapAllocations(source, groups) {
    const counts = { constructed: 0, copied: 0 };
    class CountingMap extends Map {
      constructor(entries) { super(entries); counts.constructed++; if (entries instanceof Map) counts.copied++; }
    }
    return compile(source, CountingMap)(groups, 1000000, signal()).then(() => counts);
  }
  for (const { mixed, count } of [{ mixed: false, count: 40 }, { mixed: true, count: 40 }, { mixed: true, count: 2 }]) {
    const groups = market(mixed, count), expected = identity(await before(groups, 1000000, signal()));
    for (let i = 0; i < 40; i++) { await before(groups, 1000000, signal()); await cheapestAuctionEffectSelection(groups, 1000000, signal()); }
    const times = { before: [], after: [] };
    for (let repeat = 0; repeat < repeats; repeat++) {
      const order = repeat % 2 ? ["after", "before"] : ["before", "after"];
      for (const version of order) {
        const fn = version === "before" ? before : cheapestAuctionEffectSelection;
        const started = performance.now(); let last;
        for (let call = 0; call < calls; call++) last = await fn(groups, 1000000, signal());
        times[version].push(performance.now() - started);
        assert.deepEqual(identity(last), expected);
      }
    }
    samples.push({ fixture: mixed ? "16 slots: 12 independent + overlapping ring/weapon pairs" : "16 independent slots",
      lotsPerSelectedEffect: count,
      slots: groups.length, optionRows: groups.reduce((sum, group) => sum + group.options.length, 0),
      physicalLots: new Set(groups.flatMap(group => group.options.map(row => row.auctionId))).size,
      callsPerSample: calls, samplesMs: times, medianMs: { before: median(times.before), after: median(times.after) },
      mapAllocations: { before: await mapAllocations(beforeSource, groups), after: await mapAllocations(afterSource, groups) },
      medianReductionPercent: 100 * (1 - median(times.after) / median(times.before)) });
  }
  console.log(JSON.stringify({ scope: "Pure allocator only; synthetic identical lots, full exact selection, no native simulation or end-to-end speed claim", samples }));
});
