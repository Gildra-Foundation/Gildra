import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import { assertFreshMarket } from "../../../lib/wow/auctionMarket.ts";
import * as simulation from "../../../lib/wow/gearSimulation.ts";
import * as compatibility from "../../../lib/wow/gearCompatibility.ts";
import * as effects from "../../../lib/wow/auctionGearEffects.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { harness, record, offer } from "./priority-feedback-harness.mjs";
import { searchAuctionGearOptions } from "../../../lib/wow/auctionGearPlanner.ts";

// Actual runner/discovery/planner, synthetic public-data/native transports only.
// Every fixture receives an empty mechanical cache; counts are not timing claims.
const ids = [90000, ...Array.from({ length: 80 }, (_, index) => index + 1)];
const entities = ids.map(id => ({ ...record(id), itemLevel: id === 90000 ? 500 : 10,
  highlights: [{ key: "inventory_type", value: "Wrist" }, { key: "required_level", value: "Requires level 81" }] }));
async function exercise(priorityAuctionId) {
  const offers = ids.map(id => ({ ...offer(1, id === 90000 ? priorityAuctionId : id + 100), itemId: id }));
  const fixture = await harness({ offers, entities });
  const run = await fixture.start();
  let result = run.result, firstUpgradeChunk = result.items.some(item => item.evaluation === "upgrade") ? 1 : null;
  for (let chunk = 2; !result.searchComplete; chunk++) {
    assert(chunk < 20, "All pending items must converge without dropping the domain");
    result = await fixture.runner.continueAuctionGearSearch(run.entry, fixture.signal(), fixture.progress, "synthetic");
    if (firstUpgradeChunk === null && result.items.some(item => item.evaluation === "upgrade")) firstUpgradeChunk = chunk;
  }
  return { fixture, run, result, firstUpgradeChunk };
}

test("discovery-priority upgrade appears in the first response regardless of physical auction ID", async () => {
  const high = await exercise(900000), low = await exercise(1);
  assert.equal(high.fixture.state.metadataOrder[0][0], 90000);
  assert.equal(low.fixture.state.metadataOrder[0][0], 90000);
  assert.equal(high.firstUpgradeChunk, 1, "The catalog-priority item must not wait behind 80 lower auction IDs");
  assert.equal(low.firstUpgradeChunk, 1);
  for (const value of [high, low]) {
    assert.equal(value.run.result.items.find(item => item.itemId === 90000).evaluation, "upgrade");
    assert.equal(value.fixture.state.simulationOrder[1][0], 90000);
    assert.equal(value.result.items.length, ids.length);
    assert.equal(value.result.pendingItems, 0);
    assert.equal(value.fixture.state.simulationCalls, ids.length + 1);
    assert.equal(value.result.items.filter(item => item.evaluation === "upgrade").length, 1);
  }
});

const mechanics = id => ({ ...offer(), id: `${id}:WRIST`, auctionId: id, quantity: 1, costCopper: 1,
  variantKey: "base", candidate: {
    entityId: `priority-${id}`, itemId: id, name: `Priority ${id}`, slotType: "WRIST", inventoryType: 9,
    itemClassId: 4, itemSubclassId: 4, eligible: true, constraints: { uniqueEquipped: false, requiredLevel: 1 },
    compatibility: { specId: 72 }, variants: [{ key: "base", itemLevel: 100, contextId: 0, bonusIds: [] }],
  } });
function plannerFixture(options) {
  const calls = [];
  return { calls, input: { searchId: "priority-cursor", options, selectedSlots: ["WRIST"], budgetCopper: 100,
    loadout: [], specId: 72, market: { sourceUpdatedAt: new Date().toISOString() }, signal: new AbortController().signal,
    simulate: async selections => {
      calls.push(selections.map(option => option.candidate.itemId));
      return { dps: 1000 + selections.reduce((sum, option) => sum + option.candidate.itemId, 0),
        dpsError: .1, confidence: 95, iterations: 1000, engine: "SimulationCraft synthetic-priority" };
    } } };
}

test("priority cursor remains stable when caller reorders an identical canonical pool", async () => {
  const options = [mechanics(9000), mechanics(20), mechanics(1)];
  const fixture = plannerFixture(options);
  const first = await searchAuctionGearOptions({ ...fixture.input, maxNewSimulations: 2 });
  assert.deepEqual(fixture.calls, [[], [9000]]);
  assert.deepEqual(first.checkpoint.optionOrder, options.map(option => option.id));
  assert.equal(first.result.items.find(item => item.itemId === 9000).evaluation, "upgrade");
  assert.equal(first.result.items.find(item => item.itemId === 1).evaluation, "pending");
  const next = await searchAuctionGearOptions({ ...fixture.input, options: [...options].reverse(),
    checkpoint: first.checkpoint, maxNewSimulations: 1 });
  assert.equal(next.checkpoint.inputKey, first.checkpoint.inputKey);
  assert.deepEqual(fixture.calls, [[], [9000], [20]], "Resumption uses saved priority, never a new arrival order");
  const complete = await searchAuctionGearOptions({ ...fixture.input, checkpoint: next.checkpoint, maxNewSimulations: 1 });
  assert.equal(complete.result.searchComplete, true);
  assert.equal(complete.result.pendingItems, 0);
  assert.deepEqual(fixture.calls, [[], [9000], [20], [1]]);
});

test("legacy version-1 cursor resumes canonical order and retains its measured cache", async () => {
  const options = [mechanics(9000), mechanics(20), mechanics(1)];
  const canonical = [...options].sort((left, right) => left.id.localeCompare(right.id));
  const fixture = plannerFixture(canonical);
  const first = await searchAuctionGearOptions({ ...fixture.input, maxNewSimulations: 2 });
  delete first.checkpoint.optionOrder; // Exact previous version-1 storage shape.
  first.checkpoint.version = 1;
  const complete = await searchAuctionGearOptions({ ...fixture.input, options, checkpoint: first.checkpoint });
  assert.equal(complete.result.searchComplete, true);
  assert.equal(complete.checkpoint.inputKey, first.checkpoint.inputKey);
  assert.deepEqual(fixture.calls, [[], ...canonical.map(option => [option.candidate.itemId])]);
});

test("growing pool prioritizes new input while reusing previous baseline and exact effect cache", async () => {
  const options = [mechanics(20), mechanics(1)];
  const fixture = plannerFixture(options);
  const initial = await searchAuctionGearOptions(fixture.input);
  const complete = await searchAuctionGearOptions({ ...fixture.input, options: [mechanics(9000), ...options],
    baseline: initial.checkpoint.baseline, simulationCache: initial.checkpoint.simulationCache, maxNewSimulations: 1 });
  assert.deepEqual(fixture.calls, [[], [20], [1], [9000]]);
  assert.equal(complete.result.searchComplete, true);
  assert.equal(complete.result.items.length, 3);
  assert.notEqual(complete.checkpoint.inputKey, initial.checkpoint.inputKey);
});

test("malformed persisted priority orders are rejected instead of skipping candidate work", async () => {
  const fixture = plannerFixture([mechanics(20), mechanics(1)]);
  const initial = await searchAuctionGearOptions({ ...fixture.input, maxNewSimulations: 1 });
  for (const optionOrder of [[], ["unknown", "1:WRIST"], ["1:WRIST", "1:WRIST"], "wrong"]) {
    await assert.rejects(() => searchAuctionGearOptions({ ...fixture.input,
      checkpoint: { ...initial.checkpoint, optionOrder } }), /invalid_search_checkpoint/);
  }
});

// Pin the actual deployed reader, not a reconstruction of its version check.
// Plain text keeps this historical source outside the application's build graph
// and makes this rollback guard work in shallow CI checkouts without git history.
async function legacyPlanner() {
  const source = await readFile(new URL("./fixtures/auctionGearPlanner-358a14e.ts.txt", import.meta.url), "utf8");
  assert.equal(createHash("sha256").update(source).digest("hex"), "f7a67c66d729790dfd9a58b7b415109c746d9d0833f52434c4d09e30fc1d3221");
  const code = stripTypeScriptTypes(source, { mode: "strip" }).replace(/^import .*;\s*$/gm, "")
    .replace(/^export \{.*\} from .*;\s*$/gm, "").replace(/^export /gm, "");
  return new vm.Script(code + "\n;searchAuctionGearOptions").runInNewContext({ createHash, assertFreshMarket,
    ...simulation, ...compatibility, ...effects, structuredClone, setImmediate });
}

test("actual deployed legacy reader rejects a new priority checkpoint during rollback", async () => {
  const oldSearch = await legacyPlanner();
  const fixture = plannerFixture([mechanics(9000), mechanics(20), mechanics(1)]);
  const first = await searchAuctionGearOptions({ ...fixture.input, maxNewSimulations: 2 });
  const before = structuredClone(fixture.calls);
  await assert.rejects(() => oldSearch({ ...fixture.input, checkpoint: first.checkpoint }), /auction_search_changed/);
  assert.deepEqual(fixture.calls, before, "Rollback cannot skip canonical pending items or claim completion");
});

test("version-2 priority checkpoints require the saved evaluation order", async () => {
  const fixture = plannerFixture([mechanics(20), mechanics(1)]);
  const first = await searchAuctionGearOptions({ ...fixture.input, maxNewSimulations: 1 });
  assert.equal(first.checkpoint.version, 2);
  delete first.checkpoint.optionOrder;
  await assert.rejects(() => searchAuctionGearOptions({ ...fixture.input, checkpoint: first.checkpoint }), /invalid_search_checkpoint/);
});


test("predeployment v1 priority cursor is readable but only re-emitted as version 2", async () => {
  const fixture = plannerFixture([mechanics(9000), mechanics(20), mechanics(1)]);
  const first = await searchAuctionGearOptions({ ...fixture.input, maxNewSimulations: 2 });
  first.checkpoint.version = 1;
  const resumed = await searchAuctionGearOptions({ ...fixture.input, checkpoint: first.checkpoint, maxNewSimulations: 1 });
  assert.equal(resumed.checkpoint.version, 2);
  assert.deepEqual(fixture.calls, [[], [9000], [20]]);
});
