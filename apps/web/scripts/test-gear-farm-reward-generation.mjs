import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  evaluateLevelOnlyRewardCondition,
  resolveLevelingRewardBonusTrees,
  selectRewardContext,
} from "../lib/wow/gearFarm/rewardGeneration.ts";
import { sourceRewardItemLevel, sourceRewardPhases } from "../lib/wow/gearFarm/rewards.ts";

const data = JSON.parse(readFileSync(new URL("../data/wow/gear-farm-rewards.json", import.meta.url), "utf8"));
const tables = data.tables;
const condition = tables.PlayerCondition.find((row) => row.ID === 145273);
const tuning = tables.ContentTuning.find((row) => row.ID === condition.ContentTuningID);
const conditionInput = {
  condition,
  tuning,
  conditionalTunings: tables.ConditionalContentTuning,
};
const pickerInput = {
  difficultyContextId: 1,
  mapContextId: 1,
  pickerId: 278,
  entries: tables.ItemContextPickerEntry,
  contentTuningLabels: [],
};
let checks = 0;
const check = (name, callback) => {
  callback();
  checks += 1;
  console.log(`PASS ${name}`);
};

for (const characterLevel of [80, 81, 89, 90]) {
  check(`real level condition and picker at ${characterLevel}`, () => {
    const result = evaluateLevelOnlyRewardCondition({ ...conditionInput, characterLevel });
    assert.equal(result, characterLevel === 90);
    const selection = selectRewardContext({
      ...pickerInput,
      evaluatePlayerCondition: (id) => id === condition.ID ? result : "unknown",
    });
    assert.equal(selection.state, "resolved");
    assert.equal(selection.contextId, characterLevel === 90 ? 1 : 17);
    assert.deepEqual(selection.pickerEntryIds, [characterLevel === 90 ? 997 : 996]);
  });
}

check("unknown condition cannot silently select default Normal", () => {
  const selection = selectRewardContext({ ...pickerInput, evaluatePlayerCondition: () => "unknown" });
  assert.equal(selection.state, "unresolved");
  assert.deepEqual(selection.possibleContextIds, [1, 17]);
});

for (const [name, changedCondition] of [
  ["quest restriction", { ...condition, PrevQuestID_0: 123 }],
  ["new condition flag", { ...condition, Flags: 65 }],
  ["new nonzero condition field", { ...condition, FutureAccountRequirement: 1 }],
  ["absent gender restriction field", { ...condition, Gender: undefined }],
]) {
  check(`${name} is unknown`, () => {
    assert.equal(evaluateLevelOnlyRewardCondition({ ...conditionInput, condition: changedCondition, characterLevel: 81 }), "unknown");
  });
}

check("unknown level scaling and conditional tuning remain unknown", () => {
  assert.equal(evaluateLevelOnlyRewardCondition({ ...conditionInput, tuning: { ...tuning, Flags: 64 }, characterLevel: 81 }), "unknown");
  assert.equal(evaluateLevelOnlyRewardCondition({
    ...conditionInput,
    conditionalTunings: [{ ParentContentTuningID: tuning.ID }],
    characterLevel: 81,
  }), "unknown");
});

check("missing actual picker fails", () => {
  assert.equal(selectRewardContext({ ...pickerInput, entries: [], evaluatePlayerCondition: () => false }).state, "unresolved");
});

const contextGroups = Object.fromEntries(tables.ItemCreationContextGroup.map((row) => [
  row.ID,
  tables.ItemCreationContext.filter((entry) => entry.ItemCreationContextGroupID === row.ID).map((entry) => entry.ItemContext),
]));
const treeInput = {
  rootTreeIds: tables.ItemXBonusTree.filter((row) => row.ItemID === 251098).map((row) => row.ItemBonusTreeID),
  contextId: 17,
  inventoryType: 1,
  trees: tables.ItemBonusTree,
  nodes: tables.ItemBonusTreeNode,
  contextGroups,
  overrides: tables.ChallengeModeItemBonusOverride,
  evaluateTimeEvent: (id) => id === 1552 || id === 1525 ? true : "unknown",
};

check("real current leveling helmet has source-generated bonuses", () => {
  assert.deepEqual(treeInput.rootTreeIds, [5964]);
  const result = resolveLevelingRewardBonusTrees(treeInput);
  assert.equal(result.state, "resolved");
  assert.deepEqual(result.bonusIds, [13436, 13660, 13663]);
  assert.deepEqual(result.overrideIds, [1126]);
  assert.ok(result.nodeIds.includes(28930));
});

check("inventory masks keep armor bonuses off weapons and trinkets", () => {
  for (const inventoryType of [12, 17]) {
    const result = resolveLevelingRewardBonusTrees({ ...treeInput, inventoryType });
    assert.equal(result.state, "resolved");
    assert.deepEqual(result.bonusIds, [13436, 13660]);
  }
  const necklace = resolveLevelingRewardBonusTrees({ ...treeInput, inventoryType: 2 });
  assert.equal(necklace.state, "resolved");
  assert.deepEqual(necklace.bonusIds, [13436, 13660, 13668]);
});

check("old season helmet is a different variant", () => {
  const result = resolveLevelingRewardBonusTrees({ ...treeInput, evaluateTimeEvent: (id) => id === 1525 });
  assert.equal(result.state, "resolved");
  assert.deepEqual(result.bonusIds, [13436, 13441, 13578]);
  assert.deepEqual(result.overrideIds, [1136]);
});

check("official default control distinguishes the seasonal branch", () => {
  for (const passed of [false, true]) {
    const result = resolveLevelingRewardBonusTrees({
      ...treeInput,
      contextId: 0,
      evaluateTimeEvent: (id) => id === 1552 ? passed : id === 1525,
    });
    assert.equal(result.state, "resolved");
    assert.deepEqual(result.bonusIds, [passed ? 13663 : 13578]);
  }
});

check("unknown seasonal phase cannot become current loot", () => {
  const result = resolveLevelingRewardBonusTrees({ ...treeInput, evaluateTimeEvent: () => "unknown" });
  assert.equal(result.state, "unresolved");
  assert.equal(result.reason, "unknown_season_time_event");
});

check("missing context group cannot select an inverse branch", () => {
  const groups = { ...contextGroups };
  delete groups[6];
  const result = resolveLevelingRewardBonusTrees({ ...treeInput, contextGroups: groups });
  assert.equal(result.state, "unresolved");
  assert.equal(result.reason, "missing_creation_context_group");
});

check("cycles and unsupported source flags fail", () => {
  const cycle = resolveLevelingRewardBonusTrees({
    ...treeInput,
    nodes: treeInput.nodes.map((row) => row.ID === 29101 ? { ...row, ChildItemBonusTreeID: 5964 } : row),
  });
  assert.equal(cycle.state, "unresolved");
  assert.equal(cycle.reason, "bonus_tree_cycle");
  const flags = resolveLevelingRewardBonusTrees({
    ...treeInput,
    trees: treeInput.trees.map((row) => row.ID === 5964 ? { ...row, Flags: 128 } : row),
  });
  assert.equal(flags.state, "unresolved");
  assert.equal(flags.reason, "unsupported_bonus_tree_flags");
});

check("endgame sequences cannot reuse leveling proof", () => {
  assert.equal(resolveLevelingRewardBonusTrees({ ...treeInput, contextId: 16 }).state, "unresolved");
  assert.equal(resolveLevelingRewardBonusTrees({ ...treeInput, contextId: 1 }).state, "unresolved");
});

const windrunnerMap = tables.MapDifficulty.find((row) => row.MapID === 2805 && row.DifficultyID === 1);
check("actual leveling source curve gives 139 at 81", () => {
  assert.equal(sourceRewardItemLevel([13436, 13660, 13663], windrunnerMap, 81), 139);
  assert.equal(sourceRewardItemLevel([13436, 13660], windrunnerMap, 81), 139);
  // Both known content-tuning branches constrain this exact point identically.
  assert.equal(sourceRewardItemLevel([13436, 13660], { ...windrunnerMap, ContentTuningID: 3022 }, 81), 139);
});

check("unknown bonus, unsupported socket mutation and out-of-range reward fail", () => {
  assert.equal(sourceRewardItemLevel([13436, 13660, 13668], windrunnerMap, 81), null);
  assert.equal(sourceRewardItemLevel([13436, 13660, 999999], windrunnerMap, 81), null);
  assert.equal(sourceRewardItemLevel([13436, 13660], windrunnerMap, 79), null);
  assert.equal(sourceRewardItemLevel([13436, 13660], { ...windrunnerMap, ContentTuningID: 999999 }, 81), null);
});

check("fresh default control excludes the old season even when its item level matches", () => {
  assert.equal(sourceRewardItemLevel([13436, 13441, 13578], windrunnerMap, 81), 139);
  const phases = sourceRewardPhases([13663]);
  assert.ok(phases.length > 0);
  assert.ok(phases.every((phase) => phase.get(1552) === true));
  for (const phase of phases) {
    const current = resolveLevelingRewardBonusTrees({ ...treeInput, evaluateTimeEvent: (id) => phase.get(id) ?? "unknown" });
    assert.equal(current.state, "resolved");
    assert.deepEqual(current.bonusIds, [13436, 13660, 13663]);
  }
  assert.throws(() => sourceRewardPhases([13663, 999999]), /farm_rules_update_required/);
});

console.log(`${checks} reward generation checks passed`);
