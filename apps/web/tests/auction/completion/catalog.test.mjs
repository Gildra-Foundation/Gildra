import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import { strip, record, offer, market, context } from "../reliability/market-harness.mjs";
import { normalizeGearCandidate } from "../../../lib/wow/gearCandidates.ts";
import { auctionVariantKey, resolvedAuctionVariant } from "../../../lib/wow/auctionItemVariant.ts";
import { supportedAuctionModifiers } from "../../../lib/wow/gearItemModifiers.ts";
import { AUCTION_ITEM_REFERENCE_TTL_MS, nativeMatchesItemReference } from "../../../lib/wow/auctionItemReference.ts";

// Real discovery + eligibility/variant code, synthetic catalog/native transport.
// A deterministic clock exercises retry bounds without sleeping or network.
async function setup(missing) {
  let now = Date.now();
  class Clock extends Date { static now() { return now; } }
  const state = { repaired: false, lookupCalls: 0, detailCalls: 0, variantCalls: 0 };
  const entity = record();
  const source = await readFile(new URL("../../../lib/wow/auctionGearDiscovery.ts", import.meta.url), "utf8");
  const d = new vm.Script(strip(source) + "\n;({createAuctionGearDiscovery,advanceAuctionGearDiscovery,refreshAuctionGearDiscovery,auctionGearDiscoveryOptions,auctionGearDiscoveryCoverage})")
    .runInNewContext({ Date: Clock, Map, Set, Object, Number, JSON, normalizeGearCandidate, auctionVariantKey,
      resolvedAuctionVariant, supportedAuctionModifiers, AUCTION_ITEM_REFERENCE_TTL_MS, nativeMatchesItemReference,
      lookupGearRecords: async (_ids, _locale, itemClass) => {
        state.lookupCalls++;
        return itemClass === 4 && (missing !== "summary" || state.repaired) ? [entity] : [];
      },
      gearEntityDetails: async () => {
        state.detailCalls++;
        if (missing === "detail" && !state.repaired) return [];
        return missing === "eligibility" && !state.repaired ? [{ ...entity, tooltip: { blocks: [] } }] : [entity];
      },
      getAuctionItemReferences: async () => new Map([[1, { offer: offer(), itemLevel: 100, requiredLevel: 1, stats: [] }]]),
      resolveAuctionVariants: async ({ offers }) => {
        state.variantCalls++;
        return { engine: "SimulationCraft synthetic-retry", variants: new Map(offers.map(({ offer: o }) => [auctionVariantKey(o), {
          key: auctionVariantKey(o), itemId: 1, itemLevel: 100, requiredLevel: 1, inventoryType: 9,
          itemClassId: 4, itemSubclassId: 4, quality: 3, uniqueEquipped: false, setId: 0, stats: {},
        }])) };
      },
    });
  const input = { locale: "en_US", region: "eu", token: "synthetic-no-auth", spec: "fury-warrior", characterLevel: 81,
    selectedSlots: ["WRIST"], context, signal: new AbortController().signal, maxSteps: 100 };
  const discovery = d.createAuctionGearDiscovery(market([offer()], now), 1000);
  return { d, state, discovery, input, advanceClock: ms => { now += ms; },
    refresh: () => d.refreshAuctionGearDiscovery(discovery, market([{ ...offer(), buyoutCopper: 99 }], now)),
    advance: () => d.advanceAuctionGearDiscovery(discovery, input) };
}

for (const missing of ["summary", "detail", "eligibility"]) {
  test(`catalog repair: ${missing} recovers in the retained search after bounded retry`, async () => {
    const h = await setup(missing);
    await h.advance();
    assert.equal(h.d.auctionGearDiscoveryOptions(h.discovery).length, 0);
    assert.equal(h.d.auctionGearDiscoveryCoverage(h.discovery).dataComplete, false);
    const calls = [h.state.lookupCalls, h.state.detailCalls];
    h.state.repaired = true;
    h.refresh(); await h.advance();
    assert.deepEqual([h.state.lookupCalls, h.state.detailCalls], calls, "refreshes before retry deadline must not hammer the catalog");
    h.advanceClock(60_001); h.refresh();
    assert.equal(h.d.auctionGearDiscoveryCoverage(h.discovery).discoveryComplete, false, "retry must reopen discovery");
    await h.advance();
    const options = h.d.auctionGearDiscoveryOptions(h.discovery);
    assert.equal(options.length, 1, "corrected supported gear must join the same retained search");
    assert.equal(options[0].costCopper, 99);
    const coverage = h.d.auctionGearDiscoveryCoverage(h.discovery);
    assert.equal(coverage.dataComplete, true, "successful verification clears missing-data flags");
    assert.equal(coverage.itemsTotal, 1, "retries must not inflate unique item totals");
    assert.equal(h.discovery.itemIds.length, 1, "retry queue must not grow forever");
    assert.equal(h.discovery.queuedItems.size, 1);
  });
}

test("catalog repair: continued missing data retries at most once per retry interval", async () => {
  const h = await setup("summary"); await h.advance();
  for (let attempt = 0; attempt < 4; attempt++) {
    const calls = h.state.lookupCalls;
    h.advanceClock(60_001); h.refresh(); h.refresh(); await h.advance();
    assert.equal(h.state.lookupCalls, calls + 2);
    h.refresh(); await h.advance();
    assert.equal(h.state.lookupCalls, calls + 2);
    assert.equal(h.discovery.itemIds.length, 1);
    assert.equal(h.d.auctionGearDiscoveryCoverage(h.discovery).dataComplete, false);
  }
});

test("catalog repair: already verified candidates retain their native work", async () => {
  const h = await setup("none"); await h.advance();
  const counts = [h.state.lookupCalls, h.state.detailCalls, h.state.variantCalls];
  h.advanceClock(60_001); h.refresh(); await h.advance();
  assert.deepEqual([h.state.lookupCalls, h.state.detailCalls, h.state.variantCalls], counts);
  assert.equal(h.d.auctionGearDiscoveryOptions(h.discovery).length, 1);
});
