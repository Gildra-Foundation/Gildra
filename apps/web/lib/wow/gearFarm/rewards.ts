import "server-only";
import { createHash } from "node:crypto";
import rewardData from "@/data/wow/gear-farm-rewards.json";
import { talentSpecThemes } from "@/lib/talentSpecThemes";
import { currentGearSeason } from "../gearCandidateRepository";
import type { BattleNetCharacter } from "../battleNetCharacters";
import type { BattleNetSimulationSnapshot } from "../battleNetCharacterDetails";
import type { AuctionOffer } from "../auctionMarket";
import { auctionVariantKey, resolvedAuctionVariant, type ResolvedAuctionVariant } from "../auctionItemVariant";
import { getAuctionItemReferences, nativeMatchesItemReference, parseAuctionItemReference } from "../auctionItemReference";
import { resolveAuctionVariants } from "../auctionVariantResolver";
import { normalizeInventoryType, type GearLoadoutItem } from "../gearCompatibility";
import type { CatalogGearEntity } from "../gearCandidates";
import { prepareGearLoadout } from "../gearSimulation";
import { farmCandidate, type EquippedFarmItem } from "./planner";
import type { FarmLoot } from "./repository";
import type { FarmSimulationOption } from "./confirmation";
import type { FarmActivity, FarmProgress, FarmTarget } from "./types";
import {
  evaluateLevelOnlyRewardCondition, resolveLevelingRewardBonusTrees, selectRewardContext,
  type RewardBonusTree, type RewardBonusTreeNode, type RewardBonusTreeOverride, type RewardContextPickerEntry,
} from "./rewardGeneration";

type Row = Record<string, number | string>;
type RewardBundle = {
  schemaVersion: number; clientBuild: string; staticBuild: string;
  tables: Record<string, Row[]>;
  gameTables: Record<string, Array<Record<string, number>>>;
};
const data = rewardData as unknown as RewardBundle;
const tables = data.tables;
const sourceHash = createHash("sha256").update(JSON.stringify(rewardData)).digest("hex");
const MAX_PROBES = 96;
const contextGroups = Object.fromEntries(tables.ItemCreationContextGroup.map((row) => [row.ID,
  tables.ItemCreationContext.filter((entry) => entry.ItemCreationContextGroupID === row.ID).map((entry) => Number(entry.ItemContext)),
]));
const rootsFor = (itemId: number) => tables.ItemXBonusTree.filter((row) => row.ItemID === itemId).map((row) => Number(row.ItemBonusTreeID));
type PhaseState = Map<number, boolean>;
const resolveTrees = (roots: number[], contextId: number, inventoryType: number, state: PhaseState, missing?: (id: number) => void) => resolveLevelingRewardBonusTrees({
  rootTreeIds: roots, contextId, inventoryType,
  trees: tables.ItemBonusTree as unknown as RewardBonusTree[],
  nodes: tables.ItemBonusTreeNode as unknown as RewardBonusTreeNode[],
  contextGroups,
  overrides: tables.ChallengeModeItemBonusOverride as unknown as RewardBonusTreeOverride[],
  evaluateTimeEvent: (id) => {
    const value = state.get(id);
    if (value === undefined) missing?.(id);
    return value ?? "unknown";
  },
});

async function currentControl(region: string, token: string, signal: AbortSignal) {
  const response = await fetch(`https://${region}.api.blizzard.com/data/wow/item/251098?namespace=static-${region}&locale=en_GB`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  });
  if (!response.ok || !response.body) throw new Error("item_reference_unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 512 * 1024) { await reader.cancel(); throw new Error("item_reference_unavailable"); }
    chunks.push(value);
  }
  const raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const href = raw?._links?.self?.href;
  if (typeof href !== "string") throw new Error("farm_rules_update_required");
  const url = new URL(href);
  const namespace = `static-${data.staticBuild.replace(/\.(\d+)$/, "_$1")}-${region}`;
  const reference = parseAuctionItemReference(raw, 251098);
  if (data.schemaVersion !== 1 || url.origin !== `https://${region}.api.blizzard.com` ||
    url.searchParams.get("namespace") !== namespace || !reference || reference.offer.contextId !== 0) {
    throw new Error("farm_rules_update_required");
  }
  return reference;
}

/** Every possible event assignment is retained until an actual API control
 * excludes it. No date, season number or old equipped item substitutes for it. */
export function sourceRewardPhases(controlBonuses: number[]) {
  const pending: PhaseState[] = [new Map()];
  const accepted: PhaseState[] = [];
  let attempts = 0;
  const expected = JSON.stringify([...controlBonuses].sort((a, b) => a - b));
  while (pending.length) {
    if (++attempts > 64) throw new Error("farm_rules_update_required");
    const state = pending.shift()!;
    let unknown: number | undefined;
    const result = resolveTrees(rootsFor(251098), 0, 1, state, (id) => { unknown ??= id; });
    if (result.state === "resolved") {
      if (JSON.stringify(result.bonusIds) === expected) accepted.push(state);
    } else if (result.reason === "unknown_season_time_event" && unknown !== undefined) {
      pending.push(new Map([...state, [unknown, false]]), new Map([...state, [unknown, true]]));
    }
  }
  if (!accepted.length) throw new Error("farm_rules_update_required");
  return accepted;
}

function tuningAlternatives(id: number) {
  const ids = new Set([id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const row of tables.ConditionalContentTuning) if (ids.has(Number(row.ParentContentTuningID)) && !ids.has(Number(row.RedirectContentTuningID))) {
      ids.add(Number(row.RedirectContentTuningID)); changed = true;
      if (ids.size > 16) return [];
    }
  }
  return [...ids].flatMap((candidate) => {
    const row = tables.ContentTuning.find((row) => row.ID === candidate);
    return row ? [row] : [];
  });
}

function contextFor(map: Row, level: number) {
  const alternatives = tuningAlternatives(Number(map.ContentTuningID));
  if (!alternatives.length) return null;
  const contexts = alternatives.map((tuning) => selectRewardContext({
    difficultyContextId: 0, mapContextId: Number(map.ItemContext), pickerId: Number(map.ItemContextPickerID),
    entries: tables.ItemContextPickerEntry as unknown as RewardContextPickerEntry[],
    contentTuningLabels: tables.ContentTuningXLabel.filter((row) => row.ContentTuningID === tuning.ID).map((row) => Number(row.LabelID)),
    evaluatePlayerCondition: (id) => {
      const condition = tables.PlayerCondition.find((row) => row.ID === id);
      const conditionTuning = condition && tables.ContentTuning.find((row) => row.ID === condition.ContentTuningID);
      return condition && conditionTuning ? evaluateLevelOnlyRewardCondition({ condition,
        tuning: conditionTuning as Record<string, number>,
        conditionalTunings: tables.ConditionalContentTuning as unknown as { ParentContentTuningID: number }[],
        characterLevel: level }) : "unknown";
    },
  }));
  if (contexts.some((value) => value.state !== "resolved")) return null;
  const resolved = contexts.filter((value) => value.state === "resolved");
  return new Set(resolved.map((value) => value.contextId)).size === 1 ? resolved[0].contextId : null;
}

export function sourceRewardItemLevel(bonusIds: number[], map: Row, level: number) {
  const bonuses: Row[] = [];
  const visit = (id: number, stack: Set<number>): boolean => {
    if (stack.has(id) || stack.size > 16) return false;
    const rows = tables.ItemBonus.filter((row) => row.ParentItemBonusListID === id);
    if (!rows.length) return false;
    for (const row of rows) {
      if (row.Type === 50) { if (!visit(Number(row.Value_0), new Set([...stack, id]))) return false; }
      else bonuses.push(row);
    }
    return true;
  };
  if (!bonusIds.every((id) => visit(id, new Set()))) return null;
  // This bounded implementation proves the current deterministic leveling
  // curve. Unknown stat/level/quality/effect mutations cannot slip through it.
  if (bonuses.some((row) => ![0, 6, 51].includes(Number(row.Type)))) return null;
  const scaling = bonuses.filter((row) => row.Type === 51);
  if (scaling.length !== 1) return null;
  const config = tables.ItemScalingConfig.find((row) => row.ID === scaling[0].Value_0);
  if (!config || config.ItemSquishEraID !== 2 || config.ItemLevel !== 0 || config.RequiredLevel !== 0 || config.Flags !== 2) return null;
  const offset = tables.ItemOffsetCurve.find((row) => row.ID === config.ItemOffsetCurveID);
  const curve = offset && tables.Curve.find((row) => row.ID === offset.CurveID);
  if (!offset || !curve || curve.Type !== 0 || curve.Flags !== 0) return null;
  const alternatives = tuningAlternatives(Number(map.ContentTuningID));
  if (!alternatives.length) return null;
  const levels = alternatives.map((tuning) => {
    if (tuning.Flags !== 0 || tuning.MinLevelScalingOffset !== 0 || tuning.MaxLevelScalingOffset !== 0 ||
      Number(tuning.MinLevelSquish) > level || Number(tuning.MaxLevelSquish) < level) return null;
    const points = tables.CurvePoint.filter((row) => row.CurveID === curve.ID && row.Pos_0 === level);
    return points.length === 1 ? Math.round(Number(points[0].Pos_1)) + Number(offset.Offset) : null;
  });
  if (levels.some((value) => !Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 1000) || new Set(levels).size !== 1) return null;
  return levels[0];
}

const statKeys: Record<number, string> = { 3: "agility", 4: "strength", 5: "intellect", 7: "stamina", 32: "crit_rating", 36: "haste_rating", 40: "versatility_rating", 49: "mastery_rating", 71: "stragiint", 72: "stragi", 73: "agiint", 74: "strint" };
function statBudgetSlot(metadata: ResolvedAuctionVariant) {
  if (metadata.itemClassId === 2) return [1, 2, 3, 5, 6, 8, 10, 16, 18].includes(metadata.itemSubclassId) ? 0 : 3;
  if (metadata.itemClassId !== 4) return -1;
  if ([1, 5, 7, 20].includes(metadata.inventoryType)) return 0;
  if ([3, 6, 8, 10, 12].includes(metadata.inventoryType)) return 1;
  if ([2, 11, 16, 9].includes(metadata.inventoryType)) return 2;
  return [14, 22, 23].includes(metadata.inventoryType) ? 3 : -1;
}
function independentlyMatchesStats(entity: CatalogGearEntity, metadata: ResolvedAuctionVariant) {
  const slot = statBudgetSlot(metadata);
  const budget = tables.RandPropPoints.find((row) => row.ID === metadata.itemLevel);
  const prefix = [4, 5].includes(metadata.quality) ? "EpicF" : [3, 7].includes(metadata.quality) ? "SuperiorF" : "GoodF";
  const amount = Number(budget?.[`${prefix}_${slot}`]);
  if (slot < 0 || !Number.isFinite(amount) || amount <= 0) return false;
  const category = metadata.itemClassId === 2 ? "Weapon" : metadata.inventoryType === 12 ? "Trinket" : [2, 11].includes(metadata.inventoryType) ? "Jewelry" : "Armor";
  const multiplier = (name: string) => data.gameTables[name]?.find((row) => row["Item Level"] === metadata.itemLevel)?.[`${category} Multiplier`];
  const allocations = new Map<number, Set<number>>();
  for (const block of entity.tooltip?.blocks ?? []) if (block.type === "item_variants" && Array.isArray(block.entries)) {
    for (const entry of block.entries) for (const stat of Array.isArray(entry.stats) ? entry.stats : []) {
      const allocation = Number(stat.allocation), type = Number(stat.type);
      if (!(allocation > 0)) continue;
      const values = allocations.get(type) ?? new Set(); values.add(allocation); allocations.set(type, values);
    }
  }
  if (!allocations.size) return false;
  for (const [type, values] of allocations) {
    if (values.size !== 1 || !statKeys[type]) return false;
    const factor = type === 7 ? multiplier("StaminaMultByILvl") : [32, 36, 40, 49].includes(type) ? multiplier("CombatRatingsMultByILvl") : 1;
    if (!Number.isFinite(factor) || Number(factor) <= 0) return false;
    const expected = Math.round([...values][0] * amount * 0.0001 * Number(factor));
    if (metadata.stats[statKeys[type]] !== expected) return false;
  }
  return true;
}

function withVariant(entity: CatalogGearEntity, offer: AuctionOffer, metadata: ResolvedAuctionVariant): CatalogGearEntity {
  return { ...entity, tooltip: { blocks: [
    ...(entity.tooltip?.blocks ?? []).filter((row) => !["item_variants", "item_requirements"].includes(String(row.type))),
    { ...entity.tooltip?.blocks?.find((row) => row.type === "item_requirements"), type: "item_requirements", required_level: metadata.requiredLevel },
    { type: "item_variants", entries: [{ key: auctionVariantKey(offer), item_level: metadata.itemLevel,
      context_id: offer.contextId, bonus_list_ids: offer.bonusIds, modifiers: offer.modifiers }] },
  ] } };
}

export async function resolveFarmRewards(input: {
  activities: FarmActivity[]; lootByActivity: Map<string, FarmLoot[]>; equipment: EquippedFarmItem[];
  loadout: GearLoadoutItem[]; character: BattleNetCharacter; armory: BattleNetSimulationSnapshot;
  token: string; signal: AbortSignal; onProgress?: (progress: FarmProgress) => void;
}): Promise<{ options: FarmSimulationOption[]; exactVariants: number; searchLimited: boolean }> {
  const { character, signal } = input;
  const theme = talentSpecThemes.find((row) => row.classId === character.playableClass.id && row.specId === input.armory.activeSpecializationId);
  if (!theme) throw new Error("specialization_unresolved");
  const active = input.activities.filter((activity) => activity.difficulty === "normal" && activity.access === "level_condition_met" && activity.targets.length);
  if (!active.length) return { options: [], exactVariants: 0, searchLimited: false };
  input.onProgress?.({ phase: "rewards", completed: 0, total: 1 });
  const control = await currentControl(character.region, input.token, signal);
  const phases = sourceRewardPhases(control.offer.bonusIds);
  const probes: Array<{ activity: FarmActivity; target: FarmTarget; loot: FarmLoot; offer: AuctionOffer; expectedLevel: number; treeIds: number[]; pickerId: number }> = [];
  let searchLimited = false;
  for (const activity of active) {
    const instance = tables.JournalInstance.find((row) => row.ID === activity.journalInstanceId);
    const map = instance && tables.MapDifficulty.find((row) => row.MapID === instance.MapID && row.DifficultyID === 1);
    if (!instance || !map) { searchLimited = true; continue; }
    const queue = tables.LFGDungeons.find((row) => row.MapID === instance.MapID && row.DifficultyID === 1);
    if (queue && Number.isInteger(queue.MinGear) && Number(queue.MinGear) > 0) {
      activity.queueMinItemLevel = Number(queue.MinGear);
      activity.queueGearSatisfied = Number(input.armory.profile.equipped_item_level) >= activity.queueMinItemLevel;
    }
    const contextId = contextFor(map, character.level);
    if (contextId !== 17) { searchLimited = true; continue; }
    for (const target of activity.targets) {
      const loot = input.lootByActivity.get(activity.id)?.find((row) => row.entity.externalId === target.itemId && row.encounterId === target.encounterId);
      const encounter = tables.JournalEncounter.find((row) => row.ID === target.encounterId && row.JournalInstanceID === instance.ID);
      const source = tables.JournalEncounterItem.find((row) => row.ItemID === target.itemId && row.JournalEncounterID === encounter?.ID &&
        row.DifficultyMask === -1 && row.Flags === 0 && row.DisplaySeasonID === 0 && row.WorldStateExpressionID === 0);
      if (!loot || !encounter || !source || ![-1, 255].includes(Number(source.FactionMask))) { searchLimited = true; continue; }
      const registry = loot.entity.tooltip?.blocks?.find((row) => row.type === "item_registry");
      const inventoryType = normalizeInventoryType(registry?.inventory_type);
      const variants = phases.map((state) => resolveTrees(rootsFor(target.itemId), contextId, inventoryType, state));
      if (variants.some((variant) => variant.state !== "resolved")) { searchLimited = true; continue; }
      const resolved = variants.filter((variant) => variant.state === "resolved");
      if (new Set(resolved.map((variant) => JSON.stringify(variant.bonusIds))).size !== 1) { searchLimited = true; continue; }
      const variant = resolved[0], expectedLevel = sourceRewardItemLevel(variant.bonusIds, map, character.level);
      if (expectedLevel === null || probes.length >= MAX_PROBES) { searchLimited = true; continue; }
      probes.push({ activity, target, loot, expectedLevel, treeIds: variant.treeIds, pickerId: Number(map.ItemContextPickerID),
        offer: { itemId: target.itemId, auctionId: 0, buyoutCopper: 0, quantity: 1, contextId, bonusIds: variant.bonusIds,
          modifiers: [{ type: 9, value: character.level }] } });
    }
  }
  const ids = [...new Set(probes.map((probe) => probe.target.itemId))];
  const references = await getAuctionItemReferences(ids, character.region, input.token, signal);
  // Reuse the fresh build/phase anchor as this item's native control instead
  // of a potentially older cached reference.
  references.set(251098, control);
  const slot = (value: string) => ({ FINGER_1: "finger1", FINGER_2: "finger2", TRINKET_1: "trinket1", TRINKET_2: "trinket2" }[value] ?? value.toLowerCase());
  const metadata = await resolveAuctionVariants({ offers: [
    ...ids.flatMap((id) => references.has(id) ? [{ offer: references.get(id)!.offer, slot: slot(probes.find((probe) => probe.target.itemId === id)!.target.slotType) }] : []),
    ...probes.map((probe) => ({ offer: probe.offer, slot: slot(probe.target.slotType) })),
  ], spec: theme.slug, characterLevel: character.level, signal,
  onProgress: (completed, total) => input.onProgress?.({ phase: "rewards", completed, total }) });
  const season = currentGearSeason();
  const options: FarmSimulationOption[] = [];
  for (const probe of probes) {
    signal.throwIfAborted();
    const reference = references.get(probe.target.itemId);
    const baseline = reference && metadata.variants.get(auctionVariantKey(reference.offer));
    const actual = metadata.variants.get(auctionVariantKey(probe.offer));
    if (!reference || !nativeMatchesItemReference(reference, baseline) || !actual || actual.error ||
      actual.itemLevel !== probe.expectedLevel || actual.requiredLevel !== reference.requiredLevel || actual.requiredLevel > character.level ||
      !independentlyMatchesStats(probe.loot.entity, actual)) { searchLimited = true; continue; }
    const entity = withVariant(probe.loot.entity, probe.offer, actual);
    const candidate = farmCandidate(entity, { classId: character.playableClass.id, specId: input.armory.activeSpecializationId,
      characterLevel: character.level, raceId: character.playableRace.id, faction: character.faction.type,
      slotType: probe.target.slotType, currentItemLevel: probe.target.currentItemLevel,
      anchorItemClassId: -1, anchorItemSubclassId: -1, season: { ...season, activityNames: [probe.activity.name] } },
    { id: probe.target.encounterId, name: probe.target.encounterName, location: probe.activity.name }, input.loadout, true);
    if (!candidate || candidate.itemClassId !== actual.itemClassId || candidate.itemSubclassId !== actual.itemSubclassId || candidate.inventoryType !== actual.inventoryType) { searchLimited = true; continue; }
    const variant = resolvedAuctionVariant(probe.offer, actual, metadata.engine);
    variant.sourceArtifactId = sourceHash;
    candidate.itemLevel = actual.itemLevel; candidate.quality = actual.quality; candidate.variants = [variant];
    candidate.constraints.uniqueEquipped ||= actual.uniqueEquipped;
    candidate.constraints.setId = actual.setId || candidate.constraints.setId;
    try {
      prepareGearLoadout({ selections: [{ candidate, variantKey: variant.key }], equipment: input.armory.equipment,
        loadout: input.loadout, specId: input.armory.activeSpecializationId });
    } catch { searchLimited = true; continue; }
    Object.assign(probe.target, { verification: "variant_verified", itemLevel: actual.itemLevel, requiredLevel: actual.requiredLevel,
      bonusIds: [...probe.offer.bonusIds], contextId: probe.offer.contextId, modifiers: [...probe.offer.modifiers],
      evidence: { build: data.staticBuild, sourceHash, contextPickerId: probe.pickerId, treeIds: probe.treeIds } });
    options.push({ activityId: probe.activity.id, target: probe.target, candidate, variantKey: variant.key });
  }
  for (const activity of input.activities) activity.variantsUnverified = new Set(activity.targets.filter((target) => target.verification === "scaling_unverified").map((target) => target.itemId)).size;
  return { options, exactVariants: new Set(options.map((option) => option.variantKey)).size, searchLimited };
}
