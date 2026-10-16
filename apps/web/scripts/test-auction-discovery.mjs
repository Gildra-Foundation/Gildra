import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import * as planner from "../lib/wow/auctionGearPlanner.ts";
import * as searchStore from "../lib/wow/auctionGearSearchStore.ts";
import { normalizeGearCandidate, catalogLoadoutItem, gearSlotCategoryPaths } from "../lib/wow/gearCandidates.ts";
import { auctionVariantKey, resolvedAuctionVariant } from "../lib/wow/auctionItemVariant.ts";
import { supportedAuctionModifiers } from "../lib/wow/gearItemModifiers.ts";
import { assertFreshMarket } from "../lib/wow/auctionMarket.ts";
import { nativeMatchesItemReference } from "../lib/wow/auctionItemReference.ts";

// All item data and measurements below are synthetic offline guard cases.
// Execute unchanged discovery/runner code with fixed transport dependencies;
// no credentials, Blizzard requests, database or native worker are involved.
const strip = source => stripTypeScriptTypes(source, { mode: "strip" })
  .replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
let fixture, batches, nativeCalls;
const engine = "SimulationCraft offline-discovery-test";
const record = (id, { compatible = true, slot = "Wrist" } = {}) => ({ id: `synthetic-${id}`, externalId: id,
  type: "item", slug: `synthetic-${id}`, name: `Synthetic item ${id}`, iconUrl: "https://example.invalid/synthetic.jpg",
  highlights: [{ key: "inventory_type", value: slot }], itemLevel: 100,
  payload: { ItemLevel: 100, ExpansionID: 11 }, tooltip: { blocks: [{ type: "item_registry", class_id: 4,
    subclass_id: compatible ? 4 : 1, inventory_type: slot === "Head" ? 1 : 9 }] } });
const offer = (id, bonus = 1, price = 10, auctionId = id * 1000 + bonus) => ({ auctionId, itemId: id,
  quantity: 1, buyoutCopper: price, contextId: 13, bonusIds: [bonus], modifiers: [] });
const market = offers => ({ id: createHash("sha256").update(JSON.stringify(offers)).digest("hex"), region: "eu",
  connectedRealmId: 1, sourceUpdatedAt: new Date().toISOString(), fetchedAt: new Date().toISOString(), offers });
const character = { id: 1, level: 81, playableClass: { id: 1 }, playableRace: { id: 1 }, faction: { type: "ALLIANCE" },
  region: "eu", realm: { name: "Synthetic", slug: "synthetic" } };
const armory = { activeSpecializationId: 72, equipment: { equipped_items: [{ item: { id: 999999 }, slot: { type: "WRIST" }, name: "Synthetic baseline" }] } };
const lookupGearRecords = async (ids, _locale, itemClass, maxRequiredLevel) => {
  assert.equal(maxRequiredLevel, undefined, "Do not filter actual auction variants using catalog base required level");
  assert(ids.length <= 100, "Catalog work must be batched");
  batches.catalog++;
  return itemClass === 4 ? fixture.records.filter(record => ids.includes(record.externalId)) : [];
};
const gearEntityDetails = async records => {
  assert(records.length <= 8, "Expensive entity details must be batched");
  batches.details++;
  return records;
};
const getAuctionItemReferences = async ids => new Map(ids.map(id => [id, { offer: offer(id), requiredLevel: 1, itemLevel: 100, stats: [] }]));
const resolveAuctionVariants = async ({ offers }) => {
  assert(offers.length <= 8, "At most four exact variants and four control references per work batch");
  batches.variants++;
  for (const { offer } of offers) batches.keys.add(auctionVariantKey(offer));
  return { engine, variants: new Map(offers.map(({ offer }) => [auctionVariantKey(offer), {
    key: auctionVariantKey(offer), itemId: offer.itemId, itemLevel: 100, requiredLevel: 1, inventoryType: 9,
    itemClassId: 4, itemSubclassId: 4, quality: 3, uniqueEquipped: false, setId: 0, stats: {},
    ...(fixture.reject?.has(auctionVariantKey(offer)) ? { error: "synthetic_unresolved_variant" } : {}),
  }])) };
};
const discoverySource = await readFile(new URL("../lib/wow/auctionGearDiscovery.ts", import.meta.url), "utf8");
const discovery = new vm.Script(strip(discoverySource) + "\n;({createAuctionGearDiscovery,advanceAuctionGearDiscovery,refreshAuctionGearDiscovery,auctionGearDiscoveryComplete,auctionGearDiscoveryOptions,auctionGearDiscoveryCoverage})")
  .runInNewContext({ Map, Set, Object, Number, JSON, normalizeGearCandidate, auctionVariantKey, resolvedAuctionVariant,
    supportedAuctionModifiers, nativeMatchesItemReference, lookupGearRecords, gearEntityDetails, getAuctionItemReferences, resolveAuctionVariants });
const runnerSource = await readFile(new URL("../lib/wow/auctionGearRunner.ts", import.meta.url), "utf8");
const runner = new vm.Script(strip(runnerSource) + "\n;({startAuctionGearSearchFromSnapshot,continueAuctionGearSearch,verifyAuctionGearSearch,assembleAuctionGearSearch,selectedAuctionGearAssemblyOptions})")
  .runInNewContext({ createHash, Date, Map, Set, Object, Number, JSON, AbortSignal, process, ...planner, ...searchStore, ...discovery,
    talentSpecThemes: [{ classId: 1, specId: 72, role: "melee", slug: "fury-warrior" }],
    getCharacterAuctionMarket: async () => fixture.market,
    getBattleNetSimulationSnapshot: async () => armory,
    getAuctionEquippedPresentation: async () => new Map(),
    parseAuctionGearSlots: slots => slots, auctionGearSlots: ["WRIST"], gearSlotCategoryPaths, catalogLoadoutItem,
    lookupGearEntities: async () => [record(999999)],
    currentGearSeason: () => ({ id: "synthetic", patch: "synthetic", expansionId: 11, activityNames: [] }),
    getRotationPreset: async () => ({ defaultRules: ["synthetic-rule"] }),
    addPlannerItemIcons: async () => {}, assertFreshMarket, auctionVariantKey,
    prepareGearLoadout: ({ selections }) => ({ equipment: armory.equipment,
      changes: selections.map(selection => ({ itemId: selection.candidate.itemId,
        bonusIds: selection.candidate.variants.find(variant => variant.key === selection.variantKey).bonusIds })) }),
    fetch: async (_url, options) => {
      const changes = JSON.parse(options.body).gearChanges ?? [];
      const key = JSON.stringify(changes);
      nativeCalls.set(key, (nativeCalls.get(key) ?? 0) + 1);
      return Response.json({ dps: 1000 + changes.reduce((sum, change) => sum + change.bonusIds[0] * 10, 0),
        dpsError: 1, confidence: 95, iterations: 1000, engine }, { headers: { "x-gildra-engine": "simulationcraft" } });
    } });
const signal = () => new AbortController().signal;
const progress = () => {};
let sequence = 0;
async function start(records, offers, reject) {
  fixture = { records, market: market(offers), reject };
  batches = { catalog: 0, details: 0, variants: 0, keys: new Set() };
  nativeCalls = new Map();
  const owner = `offline-discovery-${++sequence}`;
  const result = await runner.startAuctionGearSearchFromSnapshot({ characterSlug: "synthetic", budgetCopper: 1000,
    scenario: "single-target", locale: "en", selectedSlots: ["WRIST"] }, character, armory, owner, "synthetic-unused-token", signal(), progress);
  const entry = searchStore.getAuctionGearSearch(owner, result.searchId);
  assert(entry);
  return { result, entry, owner, chunks: 1 };
}
async function finish(run) {
  while (!run.result.searchComplete) {
    assert(run.chunks++ < 100, "Discovery cursor did not converge");
    run.result = await runner.continueAuctionGearSearch(run.entry, signal(), progress, "synthetic-unused-token");
  }
  assert.equal(nativeCalls.get("[]"), 1, "Continuations must retain the baseline");
  return run;
}

// The 240th record is no longer a permanent boundary; actual compatibility
// rejects cloth before any native probe and eventually reaches plate.
let run = await start([...Array.from({ length: 241 }, (_, i) => record(i + 1, { compatible: false })), record(242)],
  Array.from({ length: 242 }, (_, i) => offer(i + 1)));
assert.equal(run.result.discoveryComplete, false);
await finish(run);
assert.equal(run.result.items.length, 1);
assert.equal(run.result.items[0].itemId, 242);
assert.equal(run.result.coverage.itemsDetailed, 242);
assert.equal(batches.variants, 1, "Incompatible cloth must not consume native variant work");

// More than 6,000 market IDs remain resumable; summary slot filtering avoids
// thousands of expensive details for unrelated slots.
run = await start([...Array.from({ length: 6001 }, (_, i) => record(i + 1, { slot: "Head" })), record(6002)],
  Array.from({ length: 6002 }, (_, i) => offer(i + 1)));
await finish(run);
assert.equal(run.result.coverage.itemsScanned, 6002);
assert.equal(run.result.coverage.itemsDetailed, 1);
assert.equal(run.result.items[0].itemId, 6002);
assert(run.chunks > 1);

// All exact variants, including fourth and >256th, eventually enter the pool.
run = await start([record(1)], Array.from({ length: 300 }, (_, i) => offer(1, i + 1)));
assert.equal(run.result.discoveryComplete, false);
assert(run.result.items.length < 300, "One continuation must remain bounded");
await finish(run);
assert.equal(run.result.items.length, 300);
assert(batches.keys.has(auctionVariantKey(offer(1, 4))));
assert(batches.keys.has(auctionVariantKey(offer(1, 300))));
assert.equal(run.result.dataComplete, true);
assert.equal(run.result.searchLimited, false);

// Cancellation does not consume work; disappearing and returning effects are
// re-queued even when their original queued batch was skipped as unavailable.
const discoveryInput = { locale: "en_US", region: "eu", token: "synthetic-unused-token", spec: "fury-warrior", characterLevel: 81,
  selectedSlots: ["WRIST"], context: run.entry.context.discoveryContext, signal: signal(), maxSteps: 1 };
fixture = { records: [record(1)], market: market([offer(1)]) };
const paused = discovery.createAuctionGearDiscovery(fixture.market, 1000);
await discovery.advanceAuctionGearDiscovery(paused, discoveryInput); // catalog
await discovery.advanceAuctionGearDiscovery(paused, discoveryInput); // details
discovery.refreshAuctionGearDiscovery(paused, market([]));
await discovery.advanceAuctionGearDiscovery(paused, discoveryInput); // skipped sold key
assert.equal(discovery.auctionGearDiscoveryOptions(paused).length, 0);
discovery.refreshAuctionGearDiscovery(paused, market([offer(1)]));
assert.equal(discovery.auctionGearDiscoveryComplete(paused), false);
await discovery.advanceAuctionGearDiscovery(paused, discoveryInput);
assert.equal(discovery.auctionGearDiscoveryOptions(paused).length, 1);
const cancelled = new AbortController(); cancelled.abort();
const untouched = discovery.createAuctionGearDiscovery(fixture.market, 1000);
await assert.rejects(discovery.advanceAuctionGearDiscovery(untouched, { ...discoveryInput, signal: cancelled.signal }), /aborted/i);
assert.equal(untouched.itemCursor, 0);

// Financial facts change independently from native effects. The cheapest lot
// changes, old cursors are discarded, measured DPS and baseline are retained.
run = await finish(await start([record(1)], [offer(1, 1, 10, 1001), offer(1, 1, 20, 1002)]));
let assembly = await runner.assembleAuctionGearSearch(run.entry, undefined, signal(), progress, "synthetic-unused-token");
assert.equal(assembly.purchases[0].auctionId, 1001);
const measuredBefore = JSON.stringify([...nativeCalls]);
fixture.market = market([offer(1, 1, 30, 1001), offer(1, 1, 20, 1002)]);
await runner.verifyAuctionGearSearch(run.entry, "synthetic-unused-token", signal(), false);
assembly = await runner.assembleAuctionGearSearch(run.entry, { excludedOptionIds: [] }, signal(), progress, "synthetic-unused-token");
assert.equal(assembly.purchases[0].auctionId, 1002);
assert.equal(assembly.spentCopper, 20);
assert.equal(assembly.marketChange.repricedLots, 1);
assert.equal(JSON.stringify([...nativeCalls]), measuredBefore, "Repricing must reuse effect simulations");
const soldOptionId = run.entry.context.options.find(option => option.auctionId === 1001).id;
fixture.market = market([offer(1, 1, 20, 1002)]);
await runner.verifyAuctionGearSearch(run.entry, "synthetic-unused-token", signal(), false);
assembly = await runner.assembleAuctionGearSearch(run.entry, { excludedOptionIds: [soldOptionId] }, signal(), progress, "synthetic-unused-token");
assert.equal(assembly.purchases[0].auctionId, 1002);
assert.equal(assembly.updatedSearch.items.length, 1, "Sold rows must not survive the refreshed result");
assert.equal(assembly.marketChange.removedLots, 1);
assert.equal(JSON.stringify([...nativeCalls]), measuredBefore);
assert.throws(() => runner.selectedAuctionGearAssemblyOptions(run.entry, { excludedOptionIds: ["foreign-option"] }), /invalid_auction_selection/);
assert.throws(() => runner.selectedAuctionGearAssemblyOptions(run.entry, { excludedOptionIds: undefined }), /invalid_auction_selection/);

// New item effects are discovered after refresh; the returned shopping list
// never preserves a sold, changed-variant or now over-budget old purchase.
fixture.market = market([offer(1, 1, 20, 1002), offer(1, 4, 40, 1004)]);
await runner.verifyAuctionGearSearch(run.entry, "synthetic-unused-token", signal(), false);
assembly = await runner.assembleAuctionGearSearch(run.entry, undefined, signal(), progress, "synthetic-unused-token");
assert.equal(assembly.purchases[0].auctionId, 1004);
assert.equal(assembly.updatedSearch.items.length, 2);
assert.equal(assembly.discoveryComplete, true);
fixture.market = market([offer(1, 1, 2000, 1002)]);
await runner.verifyAuctionGearSearch(run.entry, "synthetic-unused-token", signal(), false);
assembly = await runner.assembleAuctionGearSearch(run.entry, undefined, signal(), progress, "synthetic-unused-token");
assert.equal(assembly.purchases.length, 0);
assert.equal(assembly.spentCopper, 0);
assert.equal(assembly.updatedSearch.items.length, 0);
assert.equal(nativeCalls.get("[]"), 1);

// Finished discovery does not imply verified data coverage. Missing metadata,
// unsupported modifiers and unmatched catalog IDs stay explicit unknowns.
run = await finish(await start([record(1)], [offer(1)], new Set([auctionVariantKey(offer(1))])));
assert.equal(run.result.items.length, 0);
assert.equal(run.result.discoveryComplete, true);
assert.equal(run.result.dataComplete, false);
assert.equal(run.result.searchLimited, true);
assert.equal(run.result.coverage.variantsRejected, 1);
run = await finish(await start([], [offer(1)]));
assert.equal(run.result.coverage.catalogUnmatchedItemIds, 1);
assert.equal(run.result.dataComplete, false);
run = await finish(await start([record(1)], [{ ...offer(1), modifiers: [{ type: 1000, value: 1 }] }]));
assert.equal(run.result.coverage.unsupportedModifierLots, 1);
assert.equal(run.result.dataComplete, false);

console.log("Auction discovery checks passed: bounded resumable catalog >6,000 IDs, compatibility before native work, all 300 exact variants, retained baseline/effect cache, refreshed prices/availability/new variants, safe historical selections and explicit unknown coverage (synthetic offline inputs only).");
