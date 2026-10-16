import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";
import * as gear from "../../../lib/wow/gearSimulation.ts";

const rules = ["rampage", "bloodthirst", "raging-blow", "execute", "odyns-fury", "whirlwind"];
const engine = "SimulationCraft native-contract-test";
const character = { id: 1, level: 90, name: "Synthetic", playableClass: { id: 1 }, playableRace: { id: 1 }, faction: { type: "ALLIANCE" } };
const equipment = { equipped_items: [{ item: { id: 1001 }, slot: { type: "HEAD" }, level: { value: 100 } }] };
const armory = { profile: { id: 1, level: 90, equipped_item_level: 100 }, equipment, specializations: {}, activeSpecializationId: 72, activeTalentLoadout: "actual-explicit-talents" };
const loadoutItem = { itemId: 1001, slotType: "HEAD", inventoryType: 1, itemSubclassId: 4 };
const candidate = {
  entityId: "synthetic-candidate", itemId: 2001, name: "Synthetic replacement", slotType: "HEAD", inventoryType: 1,
  itemClassId: 4, itemSubclassId: 4, eligible: true, constraints: {}, compatibility: { specId: 72 },
  variants: [{ key: "exact", itemLevel: 200, bonusIds: [6652], contextId: 16 }], provenance: {}, source: {},
};
const theme = { slug: "fury-warrior", classId: 1, specId: 72, specName: "Fury", specNameRu: "Неистовство", role: "melee" };
const expectedChange = { slot: "head", itemId: 2001, bonusIds: [6652], contextId: 16 };

function sourceModule(path, bindings, expose) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
  return new vm.Script(stripTypeScriptTypes(source, { mode: "strip" }) + `\n;({${expose}})`).runInNewContext(bindings);
}
function transport(captured) {
  return async (_url, request) => {
    captured.push(JSON.parse(request.body));
    return { ok: true, headers: { get: () => "simulationcraft" }, json: async () => ({ dps: 10000, dpsError: 10, confidence: 95, iterations: 750, engine }) };
  };
}
function assertNative(request) {
  assert.equal(request.actionListMode, "native", "automatic gear ranking must retain maintained item actions and conditions");
  assert.equal(Object.hasOwn(request, "rules"), false, "published editor priorities must not override equipment ranking");
  assert.equal(Object.hasOwn(request, "aplRules"), false);
  assert.equal(request.talentLoadout, armory.activeTalentLoadout);
  assert.deepEqual(request.armory.profile, armory.profile);
  assert.deepEqual(request.armory.specializations, armory.specializations);
}
function routeFixture() {
  const captured = [], fingerprints = [];
  let presetRequests = 0;
  const bindings = {
    createHash, ...gear, process, AbortSignal, Number, Error, JSON, Map, Set, Date, Boolean, String, URL,
    NextResponse: { json: (body, init) => ({ body, ...init }) },
    auth: async () => ({ battleNetAccessToken: "synthetic-never-sent-to-worker" }),
    getBattleNetCharacterBySlug: async () => character,
    getBattleNetCharacterDetails: async () => ({ activeSpec: "Fury", equipment: [{ id: 1001, slotType: "HEAD", name: "Old", itemLevel: 100 }] }),
    getBattleNetSimulationSnapshot: async () => armory,
    getGearCandidatesForEquippedItem: async () => ({ candidates: [candidate] }),
    lookupGearEntities: async () => [{ externalId: 1001 }],
    catalogLoadoutItem: () => loadoutItem, gearSlotCategoryPaths: { HEAD: [] }, talentSpecThemes: [theme],
    // The old implementation uses this flat published priority. Native mode
    // must work without requesting an editor preset at all.
    getRotationPreset: async () => { presetRequests++; return { defaultRules: rules }; },
    fetch: transport(captured),
    gearComparisonFingerprint: input => { fingerprints.push(structuredClone(input)); return gear.gearComparisonFingerprint(input); },
  };
  const route = sourceModule("../../../app/api/wow/gear-simulation/route.ts", bindings, "POST,cache");
  const request = () => ({ headers: new Headers(), signal: new AbortController().signal,
    json: async () => ({ characterSlug: "synthetic", slotType: "HEAD", candidateEntityId: candidate.entityId, candidateItemId: candidate.itemId, variantKey: "exact" }) });
  return { route, request, captured, fingerprints, presetRequests: () => presetRequests };
}

test("farm baseline and independent reward use native APL without an editor preset", async () => {
  const captured = [];
  let presetRequests = 0;
  const { runGearFarmFromSnapshot } = sourceModule("../../../lib/wow/gearFarm/runner.ts", {
    createHash, process, AbortSignal, Number, Error, JSON, Map, Set, Date, Math,
    currentGearSeason: () => ({ id: "midnight-season-2" }), gearSlotCategoryPaths: { HEAD: [] },
    lookupGearEntities: async () => [{ externalId: 1001 }], catalogLoadoutItem: () => loadoutItem,
    equippedFarmItemPresentation: () => ({}), farmRules: [], endgameFarmRules: [], talentSpecThemes: [theme],
    resolveFarmRewards: async () => ({ options: [{}], exactVariants: 1, searchLimited: false }),
    getRotationPreset: async () => { presetRequests++; return { defaultRules: rules }; },
    confirmFarmImprovements: async input => {
      await input.simulate({ equipment, changes: [] }, input.signal);
      await input.simulate(gear.prepareGearLoadout({ selections: [{ candidate, variantKey: "exact" }], equipment, loadout: [loadoutItem], specId: 72 }), input.signal);
      return { engine, baselineDps: 10000, simulations: 2, searchLimited: false };
    },
    farmSimulationScenario: "single-target", sortFarmActivities: activities => activities, addPlannerItemIcons: async () => {},
    fetch: transport(captured),
  }, "runGearFarmFromSnapshot");
  await runGearFarmFromSnapshot({ locale: "en" }, character, armory, "synthetic-private-token", new AbortController().signal, () => {});
  assert.equal(captured.length, 2);
  captured.forEach(assertNative);
  assert.equal(presetRequests, 0, "automatic gear ranking has no dependency on the editor preset service");
  assert.equal(captured[0].gearChanges, undefined);
  assert.deepEqual(captured[1].gearChanges, [expectedChange]);
});

test("single-item baseline and exact replacement use native APL and reuse native cache entries", async () => {
  const { route, request, captured, fingerprints, presetRequests } = routeFixture();
  assert.equal((await route.POST(request())).status, 200);
  assert.equal(captured.length, 2);
  captured.forEach(assertNative);
  assert.equal(presetRequests(), 0);
  assert.deepEqual(captured[1].gearChanges, [expectedChange]);
  assert.equal((await route.POST(request())).status, 200);
  assert.equal(captured.length, 2, "a repeated identical native comparison must reuse its own cached simulations");
  fingerprints.forEach(input => {
    assert.equal(input.actionListMode, "native");
    assert.equal(Object.hasOwn(input, "rules"), false);
  });
});

test("native gear cache is versioned and cannot reuse a legacy custom-priority entry", async () => {
  const { route, request, captured } = routeFixture();
  const profileFingerprint = createHash("sha256").update(JSON.stringify(armory)).digest("hex");
  const common = { profileFingerprint, talentLoadout: armory.activeTalentLoadout, scenario: "single-target", duration: 120, targets: 1 };
  const legacy = { ...common, rules };
  const oldValue = { dps: 1, dpsError: 0, confidence: 95, iterations: 750, engine };
  route.cache.set(gear.gearComparisonFingerprint(legacy), { expires: Date.now() + 60000, value: oldValue });
  route.cache.set(gear.gearComparisonFingerprint({ ...legacy, change: expectedChange }), { expires: Date.now() + 60000, value: oldValue });
  const result = await route.POST(request());
  assert.equal(result.status, 200);
  assert.equal(captured.length, 2, "native simulations must bypass both legacy cache entries");
  assert.equal(result.body.baselineDps, 10000);
  const native = { ...common, actionListMode: "native" };
  assert.equal(gear.nativeGearSimulationContract, "native-apl-v1");
  const expected = createHash("sha256").update(JSON.stringify({ ...native, simulationContract: "native-apl-v1" })).digest("hex");
  assert.equal(gear.gearComparisonFingerprint(native), expected, "native cache keys must include the explicit simulation semantics version");
  assert.notEqual(gear.gearComparisonFingerprint(native), gear.gearComparisonFingerprint(legacy));
  assert.notEqual(gear.gearComparisonFingerprint(native), gear.gearComparisonFingerprint({ ...native, talentLoadout: "other-talents" }));
  assert.notEqual(gear.gearComparisonFingerprint(native), gear.gearComparisonFingerprint({ ...native, change: expectedChange }));
  const oldKey = createHash("sha256").update(JSON.stringify(legacy)).digest("hex");
  assert.equal(gear.gearComparisonFingerprint(legacy), oldKey, "custom/editor fingerprint behavior remains compatible");
});
