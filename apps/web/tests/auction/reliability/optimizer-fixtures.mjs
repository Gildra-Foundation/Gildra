import { auctionGearVariantSelectionKey } from "../../../lib/wow/auctionGearExclusions.ts";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import * as planner from "../../../lib/wow/auctionGearPlanner.ts";
import { auctionVariantKey } from "../../../lib/wow/auctionItemVariant.ts";
import { supportedAuctionModifiers } from "../../../lib/wow/gearItemModifiers.ts";
import { equipmentCompatibility } from "../../../lib/wow/gearCompatibility.ts";
import { auctionGearProfileFingerprint } from "../../../lib/wow/auctionGearFingerprint.ts";

// Synthetic offline fixtures. Market, armory and native transports never run.
export const slots = ["HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "WRIST", "HANDS", "WAIST", "LEGS", "FEET",
  "FINGER_1", "FINGER_2", "TRINKET_1", "TRINKET_2", "MAIN_HAND", "OFF_HAND"];
export function candidate(slot, itemId, constraints = {}) {
  const inventoryType = { HEAD: 1, NECK: 2, SHOULDER: 3, BACK: 16, CHEST: 5, WRIST: 9, HANDS: 10,
    WAIST: 6, LEGS: 7, FEET: 8, FINGER_1: 11, FINGER_2: 11, TRINKET_1: 12, TRINKET_2: 12,
    MAIN_HAND: 13, OFF_HAND: 13 }[slot];
  const itemClassId = slot.endsWith("HAND") ? 2 : 4;
  const itemSubclassId = itemClassId === 2 || [2, 11, 12, 16].includes(inventoryType) ? 0 : 4;
  const value = { entityId: `synthetic-${itemId}`, itemId, name: `Synthetic ${itemId}`, slotType: slot,
    itemLevel: 100, inventoryType, itemClassId, itemSubclassId,
    constraints: { uniqueEquipped: false, requiredLevel: 1, ...constraints },
    compatibility: { specId: 72, method: "specialization" }, eligible: true, rejectionReasons: [],
    variants: [{ key: "base", itemLevel: 100, contextId: 0, bonusIds: [] }] };
  assert.equal(equipmentCompatibility({ classId: 1, specId: 72, ...value }), null, `invalid_fixture:${slot}`);
  return value;
}
export const option = (id, slot, itemId = id, extra = {}) => ({ id: `${id}:${slot}`, auctionId: id,
  quantity: 1, costCopper: 1, candidate: candidate(slot, itemId), variantKey: "base", ...extra });
export const simulation = (dps, dpsError = .1) => ({ dps, dpsError, confidence: 95, iterations: 750,
  engine: "SimulationCraft synthetic-auction-reliability" });
export const input = (options, extra = {}) => ({ searchId: "synthetic-reliability", budgetCopper: 100,
  options, selectedSlots: [...new Set(options.map(value => value.candidate.slotType))], loadout: [], specId: 72,
  market: { sourceUpdatedAt: new Date().toISOString() }, signal: new AbortController().signal,
  simulate: async selections => simulation(1000 + selections.length * 10), ...extra });

const readProduct = path => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const executable = source => stripTypeScriptTypes(source, { mode: "strip" })
  .replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");

/** Executes unchanged production function bodies; only external dependencies are injected. */
export async function growingMarketRunner() {
  const discovery = new vm.Script(executable(readProduct("lib/wow/auctionGearDiscovery.ts")) +
    "\n;({createAuctionGearDiscovery,refreshAuctionGearDiscovery,auctionGearDiscoveryCoverage,auctionGearDiscoveryOptions})")
    .runInNewContext({ Map, Set, Object, Number, JSON, auctionVariantKey, supportedAuctionModifiers });
  const offers = slots.map((_, index) => ({ auctionId: 1000 + index, itemId: 2000 + index, quantity: 1,
    buyoutCopper: 1, contextId: 0, bonusIds: [], modifiers: [] }));
  const snapshot = values => ({ id: createHash("sha256").update(JSON.stringify(values)).digest("hex"), region: "eu",
    connectedRealmId: 1, sourceUpdatedAt: new Date().toISOString(), fetchedAt: new Date().toISOString(), offers: values });
  let market = snapshot(offers.slice(0, 3));
  const state = discovery.createAuctionGearDiscovery(market, 100);
  // All metadata was resolved in previous snapshots. Thirteen absent offers
  // later return; this fixture does not bypass new-item metadata resolution.
  state.itemIds = offers.map(value => value.itemId); state.queuedItems = new Set(state.itemIds);
  state.itemCursor = state.itemIds.length; state.engine = simulation(1000).engine;
  for (const [index, offer] of offers.entries()) {
    const key = auctionVariantKey(offer), value = candidate(slots[index], offer.itemId);
    value.variants[0].key = key;
    state.entities.set(offer.itemId, { id: value.entityId, externalId: offer.itemId });
    state.candidates.set(key, [value]); state.queuedVariants.add(key); state.variantKeys.push(key);
    state.scannedItems.add(offer.itemId); state.detailedItems.add(offer.itemId); state.verifiedReferences.add(offer.itemId);
  }
  state.variantCursor = state.variantKeys.length;
  const armory = { synthetic: true, equipment: { equipped_items: [] } };
  let calls = 0;
  const context = { input: { budgetCopper: 100, selectedSlots: slots, locale: "en", scenario: "single-target" },
    character: { id: 1, region: "eu", realm: { slug: "synthetic", name: "Synthetic" } }, armory,
    loadout: [], specId: 72, specSlug: "fury-warrior", options: discovery.auctionGearDiscoveryOptions(state),
    currentBySlot: new Map(), simulate: async selections => { calls++;
      return simulation(selections.filter(value => value.candidate.itemId >= 2000 && value.candidate.itemId <= 2002).length === 3
        ? 1500 : selections.length ? 990 : 1000); },
    discovery: state, coverage: discovery.auctionGearDiscoveryCoverage(state), searchLimited: false,
    publicMarket: { snapshotId: market.id, region: "eu", realm: "Synthetic", connectedRealmId: 1,
      updatedAt: market.sourceUpdatedAt, validatedAt: market.fetchedAt }, market: { ...market, offers: [] },
    profileFingerprint: auctionGearProfileFingerprint(armory), scenario: "single-target",
    marketChange: { removedLots: 0, repricedLots: 0, quantityChangedLots: 0, variantsChangedLots: 0 } };
  const signal = new AbortController().signal;
  const searched = await planner.searchAuctionGearOptions(input(context.options, { searchId: "synthetic-runner-entry",
    selectedSlots: slots, simulate: context.simulate }));
  const entry = { id: "synthetic-runner-entry", owner: "synthetic-owner", context,
    searchCheckpoint: searched.checkpoint, latestSearchResult: searched.result, busy: false };
  const runner = new vm.Script(executable(readProduct("lib/wow/auctionGearRunner.ts")) +
    "\n;({verifyAuctionGearSearch,assembleAuctionGearSearch})").runInNewContext({ createHash, Date, Map, Set, Object,
    Number, JSON, AbortSignal, process, auctionGearVariantSelectionKey, ...planner, ...discovery, auctionGearProfileFingerprint, touchAuctionGearSearch: () => {},
    // This domain fixture uses a virtual entry; real disk checkpoints have separate process tests.
    saveAuctionGearSearch: () => {}, scheduleAuctionGearSearchSave: () => {}, flushAuctionGearSearch: async () => {},
    getBattleNetSimulationSnapshot: async () => armory, getCharacterAuctionMarket: async () => market,
    schedulePlannerItemIcons: () => {}, auctionVariantKey,
    advanceAuctionGearDiscovery: async () => { throw Error("unexpected_native_metadata_discovery"); } });
  return { entry, runner, signal, get calls() { return calls; }, grow() { market = snapshot(offers); },
    assemble: selection => runner.assembleAuctionGearSearch(entry, selection, signal, () => {}, "synthetic-token"),
    refresh: () => runner.verifyAuctionGearSearch(entry, "synthetic-token", signal, false) };
}
