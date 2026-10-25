import { normalizeGearCandidate, type CatalogGearEntity, type GearCandidateContext } from "../gearCandidates";
import { candidateLoadoutItem } from "../gearSimulation";
import { isTwoHandWeapon, supportsTitanGrip, validateGearLoadout, type GearLoadoutItem } from "../gearCompatibility";
import { isConfirmedFarmUpgrade } from "./recommendations";
import type { FarmActivity, FarmTarget } from "./types";
import type { GearPlannerItemData } from "../gearPlannerPresentation";
import type { FarmLoot } from "./repository";
export type EquippedFarmItem = {
  itemId: number;
  slotType: string;
  itemLevel: number;
  presentation?: GearPlannerItemData;
};
/** Acquisition and scaling are independent proofs. An unscaled source is a
 * target to inspect, never a promise of a better item or a simulated gain. */
export function farmCandidate(entity: CatalogGearEntity, context: GearCandidateContext, source: {
  id: number;
  name: string;
  location: string;
}, loadout: GearLoadoutItem[], precise = false) {
  const candidate = normalizeGearCandidate(entity, {
    ...context,
    acquisition: {
      type: "encounter",
      evidence: "catalog",
      ...source
    }
  });
  const ignored = new Set(["simulation_variant_missing", "season_unverified", ...(!precise ? ["level_restricted"] : [])]);
  if (candidate.rejectionReasons.some(r => !ignored.has(r))) return null;
  const removeOffhand = context.slotType === "MAIN_HAND" && isTwoHandWeapon(candidate.inventoryType) && !supportsTitanGrip(context.specId, candidate.itemSubclassId);
  try {
    validateGearLoadout([...loadout.filter(e => e.slotType !== context.slotType && !(removeOffhand && e.slotType === "OFF_HAND")), candidateLoadoutItem(candidate)], context.specId);
  } catch {
    return null;
  }
  return {
    ...candidate,
    eligible: true,
    rejectionReasons: []
  };
}
export function sourceTargets(input: {
  loot: FarmLoot[];
  activity: FarmActivity;
  equipment: EquippedFarmItem[];
  loadout: GearLoadoutItem[];
  context: Omit<GearCandidateContext, "slotType" | "currentItemLevel">;
}) {
  const targets: FarmTarget[] = [];
  for (const loot of input.loot) for (const equipped of input.equipment) {
    const candidate = farmCandidate(loot.entity, {
      ...input.context,
      slotType: equipped.slotType,
      currentItemLevel: equipped.itemLevel
    }, {
      id: loot.encounterId,
      name: loot.encounterName,
      location: input.activity.name
    }, input.loadout);
    if (!candidate) continue;
    targets.push({
      itemId: candidate.itemId,
      entityId: candidate.entityId,
      name: candidate.name,
      ...(candidate.iconUrl ? { iconUrl: candidate.iconUrl } : {}),
      slotType: equipped.slotType,
      currentItemId: equipped.itemId,
      currentItemLevel: equipped.itemLevel,
      ...(equipped.presentation ? { currentItem: equipped.presentation } : {}),
      encounterId: loot.encounterId,
      encounterName: loot.encounterName,
      source: `${input.activity.name} · ${loot.encounterName}`,
      verification: "scaling_unverified"
    });
  }
  return [...new Map(targets.map(t => [`${t.encounterId}:${t.itemId}:${t.slotType}`, t])).values()].sort((a, b) => a.currentItemLevel - b.currentItemLevel || a.itemId - b.itemId || a.slotType.localeCompare(b.slotType));
}
export function sortFarmActivities(activities: FarmActivity[]) {
  const access = {
    level_condition_met: 0,
    unlock_unverified: 1,
    gear_locked: 2,
    level_locked: 3
  };
  const best = (a: FarmActivity) => Math.max(0, ...a.targets.filter(isConfirmedFarmUpgrade).map(t => t.deltaPercent ?? 0));
  const verifiedSlots = (a: FarmActivity) => new Set(a.targets.filter(isConfirmedFarmUpgrade).map(t => t.slotType)).size;
  const weakest = (a: FarmActivity) => Math.min(10000, ...a.targets.filter(isConfirmedFarmUpgrade).map(t => t.currentItemLevel));
  return [...activities].sort((a, b) => access[a.access] - access[b.access] || best(b) - best(a) || verifiedSlots(b) - verifiedSlots(a) || weakest(a) - weakest(b) || a.id.localeCompare(b.id));
}
