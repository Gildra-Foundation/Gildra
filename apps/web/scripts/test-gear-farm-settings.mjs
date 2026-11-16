import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeFarmSettings } from "../lib/wow/gearFarm/settings.ts";
import { farmRules, endgameFarmRules, requestedFarmRules, farmAccess, farmLootDifficultyMembership } from "../lib/wow/gearFarm/rules.ts";
import { contextFor, farmRewardCapability, farmSourceCoverageComplete, resolveFarmRewards } from "../lib/wow/gearFarm/rewards.ts";
import { defaultFarmPreferences, farmPreferencesKey, readFarmPreferences, subscribeFarmPreferences, writeFarmPreferences } from "../lib/wow/gearFarm/preferences.ts";

const data = JSON.parse(readFileSync(new URL("../data/wow/gear-farm-rewards.json", import.meta.url), "utf8"));
const tables = data.tables;
const spireEncounters = new Set(tables.JournalEncounter.filter(row => row.JournalInstanceID === 1299).map(row => row.ID));
const spireLoot = tables.JournalEncounterItem.filter(row => spireEncounters.has(row.JournalEncounterID))
  .map(row => ({ encounterId: row.JournalEncounterID, entity: { externalId: row.ItemID } }));
assert.equal(farmSourceCoverageComplete(1299, spireLoot), true);
assert.equal(farmSourceCoverageComplete(1299, spireLoot.slice(1)), false, "A missing localized item keeps source coverage partial");
assert.equal(farmSourceCoverageComplete(undefined, spireLoot), false);
assert.equal(farmSourceCoverageComplete(1299, spireLoot.map(row => ({ ...row, encounterId: 999 }))), false,
  "Matching item counts cannot replace the exact encounter acquisition proof");
assert.deepEqual(normalizeFarmSettings({}), { dungeonDifficulty: "normal", raidDifficulty: "raid-finder" });
for (const difficultyId of [1, 8, 14, 15, 16, 17]) {
  assert.equal(farmLootDifficultyMembership(-1, difficultyId), "included");
  for (const mask of [undefined, null, "-1", 0, 1, 2, 16, NaN]) assert.equal(farmLootDifficultyMembership(mask, difficultyId), "unknown");
}
assert.equal(farmLootDifficultyMembership(-1, undefined), "unknown");
assert.deepEqual(requestedFarmRules().map(rule => rule.id), [...farmRules, ...endgameFarmRules].map(rule => rule.id),
  "Omitted settings preserve the original source scope");
for (const invalid of [
  { dungeonDifficulty: "raid-finder" }, { dungeonDifficulty: null }, { raidDifficulty: "mythic-plus" },
  { raidDifficulty: "Normal" }, { mythicKeyLevel: 2 }, { dungeonDifficulty: "normal", mythicKeyLevel: null },
  ...[undefined, null, "2", 0, 1, -2, 2.5, 100, NaN, Infinity, {}, []].map(mythicKeyLevel => ({ dungeonDifficulty: "mythic-plus", mythicKeyLevel })),
]) assert.throws(() => normalizeFarmSettings(invalid), /invalid_farm_settings/);
for (const key of [2, 10, 11, 99]) {
  assert.equal(normalizeFarmSettings({ dungeonDifficulty: "mythic-plus", mythicKeyLevel: key }).mythicKeyLevel, key);
  const rules = requestedFarmRules({ dungeonDifficulty: "mythic-plus", raidDifficulty: "heroic", mythicKeyLevel: key });
  const dungeons = rules.filter(rule => rule.group === "dungeon");
  assert.equal(dungeons.length, 8);
  assert.equal(new Set(dungeons.map(rule => rule.slug)).size, 8);
  assert(dungeons.every(rule => rule.difficulty === "mythic-plus" && rule.mythicKeyLevel === key && rule.id.endsWith(`:${key}`)));
  assert(!dungeons.some(rule => rule.slug === "windrunner-spire"), "A previous-season map is not silently included in the M+ roster");
  for (const rule of dungeons) {
    const instance = tables.JournalInstance.find(row => row.Name_lang === rule.name);
    assert(instance, `Verified journal for ${rule.name}`);
    assert(tables.MapChallengeMode.some(row => row.MapID === instance.MapID));
    const map = tables.MapDifficulty.find(row => row.MapID === instance.MapID && row.DifficultyID === rule.difficultyId);
    assert(map, `Verified difficulty for ${rule.name}`);
    assert.equal(contextFor(map, 90), 16, "Mythic+ reward context is 16, not raid Mythic's 6 or difficulty ID 8");
    assert.deepEqual(farmRewardCapability({ ...rule, journalInstanceId: instance.ID }, 90),
      { supported: false, reason: "reward_sequence_unverified", contextId: 16 });
  }
}
for (const [difficulty, expectedId, expectedContext] of [["raid-finder", 17, 4], ["normal", 14, 3], ["heroic", 15, 5], ["mythic", 16, 6]]) {
  const raid = requestedFarmRules({ raidDifficulty: difficulty }).find(rule => rule.group === "raid" && rule.difficulty !== "world");
  assert.equal(raid.difficulty, difficulty);
  assert.equal(raid.difficultyId, expectedId);
  assert.equal(farmAccess(raid, 81, 500), "level_locked");
  assert.equal(farmAccess(raid, 90, 120), difficulty === "raid-finder" ? "gear_locked" : "level_condition_met",
    "Manual raids must not inherit the LFR queue gate");
  const map = tables.MapDifficulty.find(row => row.MapID === 3004 && row.DifficultyID === expectedId);
  assert.equal(contextFor(map, 90), expectedContext);
  assert.deepEqual(farmRewardCapability({ ...raid, journalInstanceId: 1320 }, 90),
    { supported: false, reason: "reward_sequence_unverified", contextId: expectedContext });
}
const normal = { group: "dungeon", difficulty: "normal", journalInstanceId: 1299 };
assert.deepEqual(farmRewardCapability(normal, 81), { supported: true, contextId: 17 });
assert.deepEqual(farmRewardCapability(normal, 90), { supported: false, reason: "reward_sequence_unverified", contextId: 1 });
assert.equal(farmRewardCapability({ ...normal, difficultyId: 14 }, 81).reason, "difficulty_unverified");
assert.equal(farmRewardCapability({ ...normal, journalInstanceId: 99999 }, 81).reason, "source_unavailable");
for (const difficulty of ["heroic", "mythic"]) {
  const dungeons = requestedFarmRules({ dungeonDifficulty: difficulty }).filter(rule => rule.group === "dungeon");
  assert(dungeons.every(rule => rule.difficulty === difficulty && rule.unsupportedReason === "difficulty_unverified" && rule.difficultyId === undefined));
  assert(dungeons.every(rule => farmAccess(rule, 81, 500) === "level_locked"));
}

// Unsupported requested rewards must stay unpriced/unmeasured, even if a
// catalog item has attractive base metadata; no Normal fallback or worker call.
const targets = [{ itemId: 268196, verification: "scaling_unverified" }];
const activities = [{ group: "raid", difficulty: "normal", difficultyId: 14, journalInstanceId: 1320,
  id: "raid:normal", access: "level_condition_met", targets }];
let calls = 0;
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => { calls++; throw new Error("Unsupported variants must not reach remote resolution"); };
  const result = await resolveFarmRewards({ activities, lootByActivity: new Map(), equipment: [], loadout: [],
    character: { level: 90, playableClass: { id: 1 } }, armory: { activeSpecializationId: 72 },
    token: "isolated-test", signal: new AbortController().signal });
  assert.deepEqual(result, { options: [], exactVariants: 0, searchLimited: true });
  assert.equal(calls, 0);
  assert.equal(activities[0].unsupportedReason, "reward_sequence_unverified");
  assert.deepEqual(targets, [{ itemId: 268196, verification: "scaling_unverified" }]);
} finally { globalThis.fetch = originalFetch; }

// Re-entering the page recovers the selected scope, including the key. Broken
// storage must neither accept malformed settings nor stop selector changes.
const originalWindow = globalThis.window;
const preferences = new Map();
let denyWrites = false, changes = 0;
const browser = new EventTarget();
browser.sessionStorage = {
  getItem: key => preferences.get(key) ?? null,
  setItem: (key, value) => { if (denyWrites) throw new Error("storage blocked"); preferences.set(key, value); },
};
try {
  globalThis.window = browser;
  const key = farmPreferencesKey("character", "profile");
  assert.notEqual(key, farmPreferencesKey("character", "other-profile"));
  assert.notEqual(key, farmPreferencesKey("other-character", "profile"));
  assert.equal(readFarmPreferences(key), defaultFarmPreferences);
  const unsubscribe = subscribeFarmPreferences(() => { changes++; });
  const selected = { dungeonDifficulty: "mythic-plus", raidDifficulty: "heroic", mythicKeyLevel: 10 };
  writeFarmPreferences(key, selected);
  assert.deepEqual(JSON.parse(readFarmPreferences(key)), selected);
  denyWrites = true;
  writeFarmPreferences(key, { ...selected, mythicKeyLevel: 11 });
  assert.equal(JSON.parse(readFarmPreferences(key)).mythicKeyLevel, 11, "A failed write must not restore an older stored key");
  assert.equal(changes, 2);
  unsubscribe();
  preferences.set("malformed", JSON.stringify({ dungeonDifficulty: "mythic-plus", mythicKeyLevel: "10" }));
  assert.equal(readFarmPreferences("malformed"), defaultFarmPreferences);
} finally {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}

console.log("PASS farm settings: defaults, invalid keys, separate scopes, verified contexts, exact roster, unsupported rank safety");
