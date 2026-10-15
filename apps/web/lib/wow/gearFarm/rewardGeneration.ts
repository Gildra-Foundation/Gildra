/**
 * The client picker may replace a map's default item context. Unknown player
 * conditions are possible branches, never an implicit `false`/Normal fallback.
 *
 * Table semantics: ItemContextPickerEntry.dbd and upstream ItemBonusMgr.cpp.
 * This module resolves supported client rules; runtime reward proof is separate.
 */
export type RewardConditionResult = true | false | "unknown";

export type RewardContextPickerEntry = {
  ID: number;
  ItemContextPickerID: number;
  ItemCreationContext: number;
  OrderIndex: number;
  PVal: number;
  LabelID: number;
  Flags: number;
  PlayerConditionID: number;
};

export type RewardContextSelection =
  | { state: "resolved"; contextId: number; pickerEntryIds: number[] }
  | { state: "unresolved"; reason: string; possibleContextIds: number[] };

const FORCE_TO_NONE_CONTEXT = 21;

const LEVEL_CONDITION_SENTINELS: Readonly<Record<string, number>> = {
  Gender: -1,
  NativeGender: -1,
  MinExpansionLevel: -1,
  MaxExpansionLevel: -1,
  ChrSpecializationIndex: -1,
  ChrSpecializationRole: -1,
  PowerType: -1,
  MinExpansionTier: -1,
  MaxExpansionTier: -1,
};

/**
 * Only a complete, byte-verified PlayerCondition row may enter this evaluator.
 * Unsupported account/quest/gear conditions remain unknown. The supported
 * client flags are ClientExecutable and WithinOrAboveRecord.
 */
export function evaluateLevelOnlyRewardCondition(input: {
  condition: Readonly<Record<string, number | string>>;
  tuning: Readonly<Record<string, number>>;
  conditionalTunings: readonly { ParentContentTuningID: number }[];
  characterLevel: number;
}): RewardConditionResult {
  const { condition, tuning, characterLevel } = input;
  if (!Number.isSafeInteger(characterLevel) || characterLevel < 1 || characterLevel > 90 ||
    ![1, 33].includes(Number(condition.Flags)) || !Number.isSafeInteger(condition.ID) ||
    !Number.isSafeInteger(condition.ContentTuningID) || condition.ContentTuningID !== tuning.ID ||
    tuning.Flags !== 0 || tuning.MinLevelScalingOffset !== 0 || tuning.MaxLevelScalingOffset !== 0 ||
    input.conditionalTunings.some((row) => row.ParentContentTuningID === tuning.ID)) return "unknown";
  for (const [key, neutral] of Object.entries(LEVEL_CONDITION_SENTINELS)) {
    if (condition[key] !== neutral) return "unknown";
  }
  for (const key of ["MinLevel", "MaxLevel", "ClassMask", "WeaponSubclassMask", "ModifierTreeID", "WorldStateExpressionID"]) {
    if (condition[key] !== 0) return "unknown";
  }
  for (const [key, value] of Object.entries(condition)) {
    if (["ID", "Failure_description_lang", "Flags", "ContentTuningID"].includes(key) ||
      Object.hasOwn(LEVEL_CONDITION_SENTINELS, key)) continue;
    if (value !== 0) return "unknown";
  }
  const min = tuning.MinLevelSquish;
  const max = tuning.MaxLevelSquish;
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 1 || min > 90 || max < min || max > 90) {
    return "unknown";
  }
  return characterLevel >= min && (condition.Flags === 33 || characterLevel <= max);
}

function contextOverride(current: number, replacement: number): number {
  if (replacement === 0) return current;
  return replacement === FORCE_TO_NONE_CONTEXT ? 0 : replacement;
}

function validContext(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 255;
}

/**
 * The caller must supply the complete picker rows from one verified build and
 * labels for the already-resolved content tuning. `null` labels mean unknown.
 */
export function selectRewardContext(input: {
  difficultyContextId: number;
  mapContextId: number;
  pickerId: number;
  entries: readonly RewardContextPickerEntry[];
  contentTuningLabels: readonly number[] | null;
  evaluatePlayerCondition: (conditionId: number) => RewardConditionResult;
}): RewardContextSelection {
  const unresolved = (reason: string, possibleContextIds: number[] = []): RewardContextSelection => ({
    state: "unresolved",
    reason,
    possibleContextIds,
  });
  if (!validContext(input.difficultyContextId) || !validContext(input.mapContextId)) {
    return unresolved("invalid_default_context");
  }
  const base = contextOverride(contextOverride(0, input.difficultyContextId), input.mapContextId);
  if (input.pickerId === 0) return { state: "resolved", contextId: base, pickerEntryIds: [] };
  if (!Number.isSafeInteger(input.pickerId) || input.pickerId < 0 || input.entries.length > 256) {
    return unresolved("invalid_picker");
  }
  const entries = input.entries.filter((entry) => entry.ItemContextPickerID === input.pickerId);
  if (!entries.length) return unresolved("missing_picker_entries");

  const evaluated: Array<{ entry: RewardContextPickerEntry; eligible: RewardConditionResult }> = [];
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.ID) || entry.ID <= 0 || !validContext(entry.ItemCreationContext) ||
      !Number.isSafeInteger(entry.OrderIndex) || entry.OrderIndex < 0 ||
      !Number.isSafeInteger(entry.PVal) || !Number.isSafeInteger(entry.Flags) || (entry.Flags & ~1) !== 0 ||
      !Number.isSafeInteger(entry.LabelID) || entry.LabelID < 0 ||
      !Number.isSafeInteger(entry.PlayerConditionID) || entry.PlayerConditionID < 0) {
      return unresolved("unsupported_picker_entry");
    }
    if (entry.PVal <= 0) continue;
    let eligible: RewardConditionResult = entry.PlayerConditionID === 0
      ? true
      : input.evaluatePlayerCondition(entry.PlayerConditionID);
    if (eligible !== true && eligible !== false && eligible !== "unknown") {
      return unresolved("invalid_condition_result");
    }
    if (entry.Flags & 1) eligible = eligible === "unknown" ? "unknown" : !eligible;
    if (entry.LabelID !== 0) {
      const labelMatches = input.contentTuningLabels === null
        ? "unknown"
        : input.contentTuningLabels.includes(entry.LabelID);
      if (labelMatches === false) eligible = false;
      else if (labelMatches === "unknown" && eligible !== false) eligible = "unknown";
    }
    evaluated.push({ entry, eligible });
  }

  // Every possibly eligible highest-priority row is a possible result. A known
  // higher-priority row excludes a lower row even if that lower row is unknown.
  const certainOrder = evaluated.reduce((max, row) => row.eligible === true
    ? Math.max(max, row.entry.OrderIndex)
    : max, -1);
  const possible = evaluated.filter((row) => row.eligible !== false && row.entry.OrderIndex >= certainOrder);
  const contexts = new Set(possible.map(({ entry }) => contextOverride(base, entry.ItemCreationContext)));
  if (certainOrder === -1) contexts.add(base);
  const possibleContextIds = [...contexts].sort((left, right) => left - right);
  if (possibleContextIds.length !== 1) return unresolved("unknown_picker_condition", possibleContextIds);
  return {
    state: "resolved",
    contextId: possibleContextIds[0],
    pickerEntryIds: possible.map(({ entry }) => entry.ID).sort((left, right) => left - right),
  };
}

export type RewardBonusTree = { ID: number; Flags: number; InventoryTypeSlotMask: number };
export type RewardBonusTreeNode = {
  ID: number;
  ParentItemBonusTreeID: number;
  ItemContext: number;
  Flags: number;
  ItemCreationContextGroupID: number;
  MinMythicPlusLevel: number;
  MaxMythicPlusLevel: number;
  IblGroupPointsModSetID: number;
  ChildItemBonusTreeID: number;
  ChildItemBonusListID: number;
  ChildItemLevelSelectorID: number;
  ChildItemBonusListGroupID: number;
};
export type RewardBonusTreeOverride = {
  ID: number;
  SrcItemBonusTreeID: number;
  DstItemBonusTreeID: number;
  ItemBonusTreeGroupID: number;
  Value: number;
  RequiredTimeEventPassed: number;
  RequiredTimeEventNotPassed: number;
};

export type RewardBonusTreeResolution =
  | { state: "resolved"; bonusIds: number[]; treeIds: number[]; nodeIds: number[]; overrideIds: number[] }
  | { state: "unresolved"; reason: string };

/**
 * Resolve the deterministic leveling subset (context0 is the API control).
 * Random nodes, endgame sequence
 * groups, unsupported flags and unknown seasonal transitions stop proof.
 * Complete tables from one build are required, including an empty override set.
 */
export function resolveLevelingRewardBonusTrees(input: {
  rootTreeIds: readonly number[];
  contextId: number;
  inventoryType: number;
  trees: readonly RewardBonusTree[];
  nodes: readonly RewardBonusTreeNode[];
  contextGroups: Readonly<Record<number, readonly number[]>>;
  overrides: readonly RewardBonusTreeOverride[];
  evaluateTimeEvent: (eventId: number) => RewardConditionResult;
}): RewardBonusTreeResolution {
  if (![0, 1, 17].includes(input.contextId) || !Number.isSafeInteger(input.inventoryType) ||
    input.inventoryType < 1 || input.inventoryType > 31 || !input.rootTreeIds.length || input.rootTreeIds.length > 16) {
    return { state: "unresolved", reason: "unsupported_leveling_tree_input" };
  }
  const trees = new Map(input.trees.map((tree) => [tree.ID, tree]));
  const byParent = new Map<number, RewardBonusTreeNode[]>();
  for (const node of input.nodes) {
    const siblings = byParent.get(node.ParentItemBonusTreeID) ?? [];
    siblings.push(node);
    byParent.set(node.ParentItemBonusTreeID, siblings);
  }
  const treeIds = new Set<number>();
  const nodeIds = new Set<number>();
  const overrideIds = new Set<number>();
  const bonusIds = new Set<number>();
  const stack = new Set<number>();
  let steps = 0;
  let failure: string | undefined;

  function fail(reason: string): false {
    failure ??= reason;
    return false;
  }

  function event(id: number): RewardConditionResult {
    return id === 0 ? true : input.evaluateTimeEvent(id);
  }

  function overriddenTreeId(original: number): number | null {
    const active: RewardBonusTreeOverride[] = [];
    for (const row of input.overrides) {
      if (row.SrcItemBonusTreeID !== original) continue;
      if (row.ItemBonusTreeGroupID !== 0 || row.Value > 0 || !Number.isSafeInteger(row.DstItemBonusTreeID)) {
        fail("unsupported_season_override");
        return null;
      }
      const passed = event(row.RequiredTimeEventPassed);
      const notPassed = row.RequiredTimeEventNotPassed === 0 ? false : event(row.RequiredTimeEventNotPassed);
      if (passed === false || notPassed === true) continue;
      if (passed === "unknown" || notPassed === "unknown") {
        fail("unknown_season_time_event");
        return null;
      }
      active.push(row);
    }
    if (new Set(active.map((row) => row.DstItemBonusTreeID || original)).size > 1) {
      fail("ambiguous_season_override");
      return null;
    }
    for (const row of active) overrideIds.add(row.ID);
    return active[0]?.DstItemBonusTreeID || original;
  }

  function eligible(node: RewardBonusTreeNode): boolean | null {
    if (!Number.isSafeInteger(node.Flags) || (node.Flags & ~1) !== 0 || !validContext(node.ItemContext)) {
      fail("unsupported_bonus_node_flags");
      return null;
    }
    const inverse = Boolean(node.Flags & 1);
    if (node.ItemContext !== 0) {
      const matches = input.contextId === (node.ItemContext === FORCE_TO_NONE_CONTEXT ? 0 : node.ItemContext);
      if (matches === inverse) return false;
    }
    if (node.ItemCreationContextGroupID !== 0) {
      const group = input.contextGroups[node.ItemCreationContextGroupID];
      if (!group) {
        fail("missing_creation_context_group");
        return null;
      }
      if (group.includes(input.contextId) === inverse) return false;
    }
    if (node.MinMythicPlusLevel || node.MaxMythicPlusLevel || node.IblGroupPointsModSetID) {
      fail("unsupported_leveling_sequence");
      return null;
    }
    return true;
  }

  function visit(original: number, depth: number): boolean {
    if (++steps > 256 || depth > 24 || !Number.isSafeInteger(original) || original <= 0) {
      return fail("bonus_tree_bound_exceeded");
    }
    const id = overriddenTreeId(original);
    if (id === null) return false;
    if (stack.has(id)) return fail("bonus_tree_cycle");
    const tree = trees.get(id);
    if (!tree) return fail("missing_bonus_tree");
    if (!Number.isSafeInteger(tree.Flags) || (tree.Flags & ~4) !== 0 ||
      !Number.isSafeInteger(tree.InventoryTypeSlotMask) || tree.InventoryTypeSlotMask < 0) {
      return fail("unsupported_bonus_tree_flags");
    }
    treeIds.add(original);
    treeIds.add(id);
    if (tree.InventoryTypeSlotMask &&
      (BigInt(tree.InventoryTypeSlotMask) & (1n << BigInt(input.inventoryType))) === 0n) return true;
    const nodes = byParent.get(id);
    if (!nodes) return fail("missing_bonus_tree_nodes");
    const selected: RewardBonusTreeNode[] = [];
    for (const node of nodes) {
      const matches = eligible(node);
      if (matches === null) return false;
      if (matches) selected.push(node);
    }
    // Evaluate context-group and inverse conditions before detecting a random
    // choice: group6/inverse rows in the real armor tree are mutually exclusive.
    if (!(tree.Flags & 4) && selected.length > 1) return fail("random_or_ambiguous_bonus_tree");
    stack.add(id);
    for (const node of selected) {
      nodeIds.add(node.ID);
      const children = [node.ChildItemBonusTreeID, node.ChildItemBonusListID,
        node.ChildItemLevelSelectorID, node.ChildItemBonusListGroupID];
      if (children.some((child) => !Number.isSafeInteger(child) || child < 0) ||
        children.filter(Boolean).length !== 1) return fail("invalid_bonus_tree_child");
      if (node.ChildItemLevelSelectorID || node.ChildItemBonusListGroupID) return fail("unsupported_leveling_selector");
      if (node.ChildItemBonusTreeID) {
        if (!visit(node.ChildItemBonusTreeID, depth + 1)) return false;
      } else bonusIds.add(node.ChildItemBonusListID);
    }
    stack.delete(id);
    return true;
  }

  for (const root of input.rootTreeIds) {
    if (!visit(root, 0)) return { state: "unresolved", reason: failure ?? "unresolved_bonus_tree" };
  }
  if (!bonusIds.size) return { state: "unresolved", reason: "missing_leveling_bonuses" };
  const sorted = (values: Set<number>) => [...values].sort((left, right) => left - right);
  return { state: "resolved", bonusIds: sorted(bonusIds), treeIds: sorted(treeIds),
    nodeIds: sorted(nodeIds), overrideIds: sorted(overrideIds) };
}
