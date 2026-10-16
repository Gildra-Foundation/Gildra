import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import { strip, record, offer, market, context } from "../reliability/market-harness.mjs";
import { normalizeGearCandidate } from "../../../lib/wow/gearCandidates.ts";
import { auctionVariantKey, resolvedAuctionVariant } from "../../../lib/wow/auctionItemVariant.ts";
import { supportedAuctionModifiers } from "../../../lib/wow/gearItemModifiers.ts";
import { AUCTION_ITEM_REFERENCE_TTL_MS, nativeMatchesItemReference } from "../../../lib/wow/auctionItemReference.ts";
import { planAuctionGear } from "../../../lib/wow/auctionGearPlanner.ts";

// Actual discovery, eligibility, native-reference validation and exhaustive planner;
// only catalog/reference/native transports use deterministic synthetic facts.
async function setup(rows, locale = "en_US", characterLevel = 81) {
  const facts = new Map(rows.map(row => [row.id, row]));
  const makeRecord = row => ({ ...record(row.id), itemLevel: row.level,
    highlights: [{ key: "inventory_type", value: locale === "ru_RU" ? "Запястья" : "Wrist" },
      ...(row.required ? [{ key: "required_level", value: `${locale === "ru_RU" ? "Требуется уровень" : "Requires level"} ${row.required}` }] : [])],
  });
  const makeOffer = id => ({ ...offer(1, id), itemId: id });
  const state = { events: [], scanned: new Set(), hold: null, fail: false, checkpoints: 0 };
  const source = await readFile(new URL("../../../lib/wow/auctionGearDiscovery.ts", import.meta.url), "utf8");
  const d = new vm.Script(strip(source) + "\n;({createAuctionGearDiscovery,advanceAuctionGearDiscovery,refreshAuctionGearDiscovery,auctionGearDiscoveryComplete,auctionGearDiscoveryOptions})")
    .runInNewContext({ Date, Map, Set, Object, Number, JSON, normalizeGearCandidate, auctionVariantKey,
      resolvedAuctionVariant, supportedAuctionModifiers, AUCTION_ITEM_REFERENCE_TTL_MS, nativeMatchesItemReference,
      lookupGearRecords: async (ids, _locale, itemClass, maxRequiredLevel, signal) => {
        assert.equal(maxRequiredLevel, undefined, "Base required level must never filter scaled variants");
        assert(ids.length <= 500, "Summary work remains bounded; repository pages stay at 100");
        state.events.push({ type: "catalog", ids: [...ids] });
        if (state.hold) await state.hold;
        signal.throwIfAborted();
        if (state.fail) throw new Error("synthetic_catalog_failure");
        if (itemClass !== 4) return [];
        for (const id of ids) state.scanned.add(id);
        return ids.flatMap(id => facts.has(id) ? [makeRecord(facts.get(id))] : []);
      },
      gearEntityDetails: async records => {
        state.events.push({ type: "details", ids: records.map(row => row.externalId), scanned: state.scanned.size });
        return records;
      },
      getAuctionItemReferences: async ids => new Map(ids.map(id => [id, {
        offer: makeOffer(id), itemLevel: facts.get(id).native ?? 100, requiredLevel: 1, stats: [],
      }])),
      resolveAuctionVariants: async ({ offers }) => {
        state.events.push({ type: "native", ids: [...new Set(offers.map(({ offer }) => offer.itemId))], scanned: state.scanned.size });
        return { engine: "SimulationCraft synthetic-priority", variants: new Map(offers.map(({ offer: o }) => [auctionVariantKey(o), {
          key: auctionVariantKey(o), itemId: o.itemId, itemLevel: facts.get(o.itemId).native ?? 100, requiredLevel: 1,
          inventoryType: 9, itemClassId: 4, itemSubclassId: 4, quality: 3, uniqueEquipped: false, setId: 0, stats: {},
        }])) };
      },
    });
  const discovery = d.createAuctionGearDiscovery(market(rows.map(row => makeOffer(row.id))), 10000);
  const input = { locale, region: "eu", token: "synthetic-no-auth", spec: "fury-warrior", characterLevel,
    selectedSlots: ["WRIST"], context: slot => ({ ...context(slot), characterLevel }), signal: new AbortController().signal, maxSteps: 1,
    onCheckpoint: () => state.checkpoints++ };
  const advance = overrides => d.advanceAuctionGearDiscovery(discovery, { ...input, ...overrides });
  const finish = async () => {
    for (let steps = 0; !d.auctionGearDiscoveryComplete(discovery); steps++) {
      assert(steps < 3000, "Every retained lot must remain reachable"); await advance();
    }
    return d.auctionGearDiscoveryOptions(discovery);
  };
  return { d, state, facts, discovery, input, advance, finish, makeOffer };
}

test("all summary batches precede native work; actual item-level hints beat ascending or descending IDs", async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({ id: 1000 + index, level: 10, required: 80 }));
  rows[800].level = 400; rows[100].level = 350;
  const h = await setup(rows);
  for (let steps = 0; !h.state.events.some(event => event.type === "native"); steps++) {
    assert(steps < 20); await h.advance();
  }
  const first = h.state.events.find(event => event.type === "native");
  assert.equal(first.scanned, 1001, "Old early batches must not monopolize native work while useful summaries remain unseen");
  assert.equal(first.ids[0], 1800, "First native candidate follows known item level, not numeric ID");
  assert.equal(h.state.events.find(event => event.type === "details").ids[0], 1800);
  assert(h.state.events.filter(event => event.type === "catalog").length <= 6, "500 summaries per discovery batch use three bounded batches for 1001 IDs");
});

test("EN/RU hints only reorder: unknown, malformed and scaled base requirements retain the same completed optimum", async () => {
  const rows = [{ id: 50, level: 300, required: 80, native: 100 }, { id: 2, level: 200, required: 80, native: 110 },
    { id: 99, level: undefined, native: 500 }, { id: 1, level: 0, native: 120 },
    { id: 3, level: Number.NaN, native: 130 }, { id: 4, level: 600, required: 90, native: 140 }];
  const orders = [];
  for (const locale of ["en_US", "ru_RU"]) {
    const h = await setup(rows, locale), options = await h.finish();
    assert.deepEqual(Array.from(options, option => option.candidate.itemId).sort((a, b) => a - b), rows.map(row => row.id).sort((a, b) => a - b));
    orders.push(h.state.events.filter(event => event.type === "details").flatMap(event => event.ids));
    assert.equal(orders.at(-1)[0], 50, "Known wearable high-level summaries get an early turn");
    const simulate = async selection => ({ dps: 1000 + selection.reduce((sum, option) => sum + h.facts.get(option.candidate.itemId).native, 0),
      dpsError: 1, confidence: 95, iterations: 1000, engine: "SimulationCraft synthetic-priority" });
    const input = { budgetCopper: 10000, options, selectedSlots: ["WRIST"], loadout: [], specId: 72,
      market: market(rows.map(row => h.makeOffer(row.id))), signal: h.input.signal, simulate, maxSimulations: 100 };
    const prioritized = await planAuctionGear(input);
    const originalOrder = await planAuctionGear({ ...input, options: [...options].sort((a, b) => a.candidate.itemId - b.candidate.itemId) });
    assert.deepEqual(Array.from(prioritized.purchases, row => row.itemId), [99], "Native measurements can make an unknown hint the optimum");
    assert.equal(prioritized.comparison.deltaDps, originalOrder.comparison.deltaDps);
    assert.deepEqual(prioritized.purchases.map(row => row.variantKey), originalOrder.purchases.map(row => row.variantKey));
  }
  assert.deepEqual(orders[0], orders[1]);
});

test("cross-squish base levels use known wearable level fit first, then base level; no hints discard candidates", async () => {
  // Mirrors the actual failure shape (catalog610 resolves natively98/99), using
  // unrelated synthetic IDs and multiple character levels rather than an item list.
  for (const characterLevel of [81, 90]) for (const locale of ["en_US", "ru_RU"]) {
    const rows = [{ id: 900, level: 610, required: characterLevel - 1, native: 98 },
      { id: 40, level: 197, required: characterLevel, native: 140 },
      { id: 500, level: 180, required: characterLevel, native: 130 },
      { id: 3, level: 1000, required: 0, native: 200 },
      { id: 2, level: 999, required: "unknown", native: 190 },
      { id: 20, level: 900, required: characterLevel + 1, native: 150 }];
    const h = await setup(rows, locale, characterLevel);
    const options = await h.finish();
    const details = h.state.events.find(event => event.type === "details");
    assert.equal(details.ids[0], 40, "Comparable character-level fit must precede incomparable raw cross-squish item levels");
    assert.equal(details.ids[1], 500, "Base item level breaks ties among equally fitting requirements");
    assert.equal(h.state.events.find(event => event.type === "native").ids[0], 40);
    assert.deepEqual(Array.from(options, option => option.candidate.itemId).sort((a, b) => a - b), rows.map(row => row.id).sort((a, b) => a - b));
    assert(options.some(option => option.candidate.itemId === 20), "Above-character base requirements may scale to eligible native requirements");
    assert(options.some(option => option.candidate.itemId === 2), "Malformed hints are retained as unknown");
    assert(options.some(option => option.candidate.itemId === 3), "Zero/unknown requirements are retained");
  }
});

test("cancelled or failed summary batches preserve their cursor/checkpoint and retry successfully", async () => {
  const h = await setup(Array.from({ length: 501 }, (_, index) => ({ id: index + 1, level: 10 })));
  let release; h.state.hold = new Promise(resolve => { release = resolve; });
  const controller = new AbortController(), pending = h.advance({ signal: controller.signal });
  controller.abort(); release();
  await assert.rejects(pending, /abort/i);
  assert.equal(h.discovery.itemCursor, 0); assert.equal(h.discovery.records.length, 0); assert.equal(h.state.checkpoints, 0);
  h.state.hold = null; await h.advance();
  assert.equal(h.discovery.itemCursor, 500);
  const records = h.discovery.records.length, checkpoints = h.state.checkpoints;
  h.state.fail = true; await assert.rejects(h.advance(), /synthetic_catalog_failure/);
  assert.equal(h.discovery.itemCursor, 500); assert.equal(h.discovery.records.length, records); assert.equal(h.state.checkpoints, checkpoints);
  h.state.fail = false; assert.equal((await h.finish()).length, 501);
});

test("old checkpoints and refreshed IDs preserve processed native work while promoting newly known strong hints", async () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, level: 10 }));
  const h = await setup(rows);
  await h.advance(); await h.advance(); await h.advance(); // catalog, details, one native batch
  const cursor = h.discovery.variantCursor, processed = h.discovery.variantKeys.slice(0, cursor);
  delete h.discovery.catalogHints; // pre-priority persisted checkpoint has no hint map
  const added = { id: 20, level: 400 }; h.facts.set(added.id, added);
  h.d.refreshAuctionGearDiscovery(h.discovery, market([...rows, added].map(row => h.makeOffer(row.id))));
  const nativeBefore = h.state.events.filter(event => event.type === "native").length;
  const options = await h.finish();
  assert.deepEqual(h.discovery.variantKeys.slice(0, cursor), processed, "Processed cursor positions are never reordered");
  const subsequent = h.state.events.filter(event => event.type === "native").slice(nativeBefore);
  assert.equal(subsequent[0].ids[0], 20, "New high-priority summaries can pass old pending variants without replaying consumed work");
  assert.equal(options.length, 11);
  for (const key of processed) assert(!subsequent.some(event => event.ids.some(id => auctionVariantKey(h.makeOffer(id)) === key)));
  assert.equal(h.discovery.queuedItems.size, 11);
});
