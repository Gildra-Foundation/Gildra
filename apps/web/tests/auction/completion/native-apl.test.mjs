import { auctionGearMechanicalKey, createAuctionGearMechanicalCache } from "../../../lib/wow/auctionGearMechanicalCache.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import { auctionGearProfileFingerprint } from "../../../lib/wow/auctionGearFingerprint.ts";
import { nativeGearSimulationMeasurement, prepareGearLoadout } from "../../../lib/wow/gearSimulation.ts";
import { assertFreshMarket } from "../../../lib/wow/auctionMarket.ts";

test("auction baseline and exact candidate request the native maintained APL", async () => {
  const source = readFileSync(new URL("../../../lib/wow/auctionGearRunner.ts", import.meta.url), "utf8");
  const body = stripTypeScriptTypes(source.slice(source.indexOf("function createAuctionSimulator(")), { mode: "strip" });
  const captured = [];
  const createSimulator = new vm.Script(body + "\n;createAuctionSimulator").runInNewContext({
    auctionGearMechanicalKey, auctionGearMechanicalCache: createAuctionGearMechanicalCache(), auctionGearProfileFingerprint, nativeGearSimulationMeasurement, prepareGearLoadout, assertFreshMarket, process, AbortSignal, Number, Error, JSON,
    fetch: async (_url, request) => {
      captured.push(JSON.parse(request.body));
      return { ok: true, headers: { get: () => "simulationcraft" }, json: async () => ({
        dps: 123456, dpsMean: 123456.125, dpsError: 1, confidence: 95, iterations: 750, engine: "SimulationCraft native-contract",
      }) };
    },
  });
  const simulate = createSimulator({
    armory: { equipment: { equipped_items: [] }, profile: { id: 1 }, specializations: {}, activeTalentLoadout: "ActualTalentIdentity" },
    loadout: [], specId: 72, specSlug: "fury-warrior", scenario: "single-target",
    encounter: { fightLengthSeconds: 120, targets: 1 }, rules: ["rampage", "bloodthirst"],
    market: { sourceUpdatedAt: new Date().toISOString() }, engine: () => "SimulationCraft native-contract",
  });
  const signal = new AbortController().signal;
  await simulate([], signal);
  const candidate = { itemId: 194872, slotType: "TRINKET_1", inventoryType: 12, itemSubclassId: 0,
    eligible: true, constraints: {}, compatibility: { specId: 72 }, variants: [{ key: "exact", bonusIds: [6652], contextId: 0 }] };
  await simulate([{ candidate, variantKey: "exact" }], signal);
  for (const request of captured) {
    assert.equal(request.actionListMode, "native", "equipment ranking must retain native item actions and conditions");
    assert.equal(Object.hasOwn(request, "rules"), false, "the editor priority cannot override gear-ranking APL");
    assert.equal(Object.hasOwn(request, "aplRules"), false);
    assert.equal(request.talentLoadout, "ActualTalentIdentity");
  }
  assert.equal(captured[0].gearChanges, undefined);
  assert.deepEqual(captured[1].gearChanges, [{ slot: "trinket1", itemId: 194872, bonusIds: [6652] }]);
});
