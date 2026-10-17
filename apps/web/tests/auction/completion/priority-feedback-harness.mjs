import { auctionGearVariantSelectionKey } from "../../../lib/wow/auctionGearExclusions.ts";
import { auctionGearMechanicalKey, createAuctionGearMechanicalCache } from "../../../lib/wow/auctionGearMechanicalCache.ts";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import * as planner from "../../../lib/wow/auctionGearPlanner.ts";
import * as store from "../../../lib/wow/auctionGearSearchStore.ts";
import { normalizeGearCandidate, catalogLoadoutItem, gearSlotCategoryPaths } from "../../../lib/wow/gearCandidates.ts";
import { auctionVariantKey, resolvedAuctionVariant, validAuctionWeapon } from "../../../lib/wow/auctionItemVariant.ts";
import { supportedAuctionModifiers } from "../../../lib/wow/gearItemModifiers.ts";
import { auctionGearProfileFingerprint } from "../../../lib/wow/auctionGearFingerprint.ts";
import { nativeGearSimulationMeasurement } from "../../../lib/wow/gearSimulation.ts";
import { assertFreshMarket } from "../../../lib/wow/auctionMarket.ts";
import { AUCTION_ITEM_REFERENCE_TTL_MS, nativeMatchesItemReference } from "../../../lib/wow/auctionItemReference.ts";

// Current production modules execute unchanged. Only public-data/native
// transports are synthetic, with zero external requests or native processes.
export const strip = code => stripTypeScriptTypes(code, { mode: "strip" })
  .replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
export const record = (id = 1) => ({ id: `offline-${id}`, externalId: id, type: "item", slug: `offline-${id}`,
  name: `Synthetic ${id}`, iconUrl: "https://example.invalid/synthetic.jpg", itemLevel: 100,
  highlights: [{ key: "inventory_type", value: "Wrist" }], payload: { ItemLevel: 100, ExpansionID: 11 },
  tooltip: { blocks: [{ type: "item_registry", class_id: 4, subclass_id: 4, inventory_type: 9 }] } });
export const offer = (bonus = 1, auctionId = 1) => ({ auctionId, itemId: 1, quantity: 1, buyoutCopper: 100,
  contextId: 13, bonusIds: [bonus], modifiers: [] });
export const market = (offers, time = Date.now()) => ({ id: createHash("sha256").update(JSON.stringify(offers)).digest("hex"),
  region: "eu", connectedRealmId: 1, sourceUpdatedAt: new Date(time).toISOString(), fetchedAt: new Date(time).toISOString(), offers });
export const character = { id: 1, name: "Synthetic", level: 81, playableClass: { id: 1 }, playableRace: { id: 1 },
  faction: { type: "ALLIANCE" }, region: "eu", realm: { name: "Synthetic", slug: "synthetic" } };
export const armory = { profile: { id: 1, name: "Synthetic", level: 81, achievement_points: 100,
  last_login_timestamp: 1000, character_class: { id: 1 }, race: { id: 1 } },
  activeSpecializationId: 72, activeTalentLoadout: "synthetic-talents", specializations: {},
  equipment: { equipped_items: [{ item: { id: 99999 }, slot: { type: "WRIST" }, name: "Synthetic baseline" }] } };
export const context = slotType => ({ classId: 1, specId: 72, characterLevel: 81, raceId: 1, faction: "ALLIANCE", slotType,
  currentItemLevel: 0, anchorItemClassId: -1, anchorItemSubclassId: -1,
  season: { id: "synthetic", patch: "synthetic", expansionId: 11, activityNames: [] }, acquisition: { type: "auction", evidence: "auction" } });
let sequence = 0;
export async function harness({ entity = record(), availableReference = true, reference, offers, entities } = {}) {
  const state = { entity, availableReference, armory: structuredClone(armory), market: market(offers ?? [offer()]),
    metadataOrder: [], simulationOrder: [], workerEngine: "SimulationCraft synthetic-v1", referenceCalls: 0, variantCalls: 0, simulationCalls: 0, marketCalls: 0, marketSignals: [], referenceLocales: [], reference: reference ?? { offer: offer(), itemLevel: 100, requiredLevel: 1, stats: [] } };
  const metadata = value => ({ key: auctionVariantKey(value), itemId: value.itemId, itemLevel: 100, requiredLevel: 1,
    inventoryType: 9, itemClassId: 4, itemSubclassId: 4, quality: 3, uniqueEquipped: false, setId: 0, stats: {} });
  const discoverySource = await readFile(new URL("../../../lib/wow/auctionGearDiscovery.ts", import.meta.url), "utf8");
  const discovery = new vm.Script(strip(discoverySource) + "\n;({createAuctionGearDiscovery,advanceAuctionGearDiscovery,refreshAuctionGearDiscovery,auctionGearDiscoveryComplete,auctionGearDiscoveryOptions,auctionGearDiscoveryCoverage})")
    .runInNewContext({ Date, Map, Set, Object, Number, JSON, normalizeGearCandidate, auctionVariantKey, resolvedAuctionVariant,
      supportedAuctionModifiers, AUCTION_ITEM_REFERENCE_TTL_MS, nativeMatchesItemReference,
      lookupGearRecords: async (ids, _locale, itemClass) => itemClass === undefined || itemClass === 4 ? (entities ?? [state.entity]).filter(row=>ids.includes(row.externalId)) : [],
      gearEntityDetails: async records => records,
      getAuctionItemReferences: async (ids, _region, _token, _signal, locale) => {
        state.referenceCalls++; state.referenceLocales.push(locale);
        return state.availableReference ? new Map(ids.map(id => [id, { ...state.reference, offer: { ...state.reference.offer, itemId: id } }])) : new Map();
      },
      resolveAuctionVariants: async ({ offers }) => {
        state.variantCalls++; state.metadataOrder.push(offers.map(({offer})=>offer.itemId));
        return { engine: state.workerEngine, variants: new Map(offers.map(({ offer }) => [auctionVariantKey(offer), metadata(offer)])) };
      },
    });
  const runnerSource = await readFile(new URL("../../../lib/wow/auctionGearRunner.ts", import.meta.url), "utf8");
  const runner = new vm.Script(strip(runnerSource) + "\n;({startAuctionGearSearchFromSnapshot,continueAuctionGearSearch,verifyAuctionGearSearch,assembleAuctionGearSearch})")
    .runInNewContext({ auctionGearVariantSelectionKey, auctionGearMechanicalKey, auctionGearMechanicalCache: createAuctionGearMechanicalCache(), auctionGearProfileFingerprint, nativeGearSimulationMeasurement, validAuctionWeapon, createHash, Date, Map, Set, Object, Number, JSON, AbortSignal, process, ...planner, ...store, ...discovery,
      talentSpecThemes: [{ classId: 1, specId: 72, role: "melee", slug: "fury-warrior" }],
      getCharacterAuctionMarket: async (_character, _token, options) => { state.marketCalls++; state.marketSignals.push(options?.signal); return state.market; },
      getBattleNetSimulationSnapshot: async () => state.armory,
      getAuctionEquippedPresentation: async () => new Map(),
      parseAuctionGearSlots: slots => slots, auctionGearSlots: ["WRIST"], gearSlotCategoryPaths, catalogLoadoutItem, auctionVariantKey,
      lookupGearEntities: async () => [record(99999)], currentGearSeason: () => context("WRIST").season,
      getRotationPreset: async () => ({ defaultRules: ["synthetic-rule"] }), schedulePlannerItemIcons: () => {}, assertFreshMarket,
      prepareGearLoadout: ({ selections }) => ({ equipment: state.armory.equipment,
        changes: selections.map(selection => ({ itemId: selection.candidate.itemId,
          bonusIds: selection.candidate.variants.find(variant => variant.key === selection.variantKey).bonusIds })) }),
      fetch: async (_url, options) => {
        state.simulationCalls++;
        const changes = JSON.parse(options.body).gearChanges ?? []; state.simulationOrder.push(changes.map(c=>c.itemId));
        const dps = 1000 + changes.reduce((sum, change) => sum + (change.itemId === 90000 ? 100 : -100), 0);
        return Response.json({ dps, dpsMean: dps,
          dpsError: 1, confidence: 95, iterations: 1000, engine: state.workerEngine }, { headers: { "x-gildra-engine": "simulationcraft" } });
      } });
  const signal = () => new AbortController().signal;
  const progress = () => {};
  const discoveryInput = { locale: "en_US", region: "eu", token: "unused-synthetic", spec: "fury-warrior", characterLevel: 81,
    selectedSlots: ["WRIST"], context, signal: signal() };
  async function start() {
    const owner = `priority-feedback-offline-${++sequence}`;
    const result = await runner.startAuctionGearSearchFromSnapshot({ characterSlug: "synthetic", budgetCopper: 1000,
      scenario: "single-target", locale: "en", selectedSlots: ["WRIST"] }, character, state.armory, owner,
      "unused-synthetic", signal(), progress);
    return { owner, result, entry: store.getAuctionGearSearch(owner, result.searchId) };
  }
  return { state, discovery, runner, signal, progress, discoveryInput, start,
    sourceHashes: { discovery: createHash("sha256").update(discoverySource).digest("hex"),
      runner: createHash("sha256").update(runnerSource).digest("hex") } };
}
