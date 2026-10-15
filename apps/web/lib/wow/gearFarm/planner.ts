import { normalizeGearCandidate, type CatalogGearEntity, type GearCandidateContext } from "../gearCandidates";
import { candidateLoadoutItem } from "../gearSimulation";
import { normalizeInventoryType, isTwoHandWeapon, supportsTitanGrip, validateGearLoadout, type GearLoadoutItem } from "../gearCompatibility";
import type { FarmActivity, FarmTarget } from "./types";
import type { FarmLoot } from "./repository";
export type EquippedFarmItem = {
  itemId: number;
  slotType: string;
  itemLevel: number;
};
export function primaryStatFor(classId: number, specId: number) {
  const byClass: Record<number, string> = {
    1: "strength",
    2: "strength",
    6: "strength",
    3: "agility",
    4: "agility",
    12: "agility",
    5: "intellect",
    8: "intellect",
    9: "intellect",
    13: "intellect"
  };
  const bySpec: Record<number, string> = {
    65: "intellect",
    102: "intellect",
    103: "agility",
    104: "agility",
    105: "intellect",
    262: "intellect",
    263: "agility",
    264: "intellect",
    268: "agility",
    269: "agility",
    270: "intellect",
    1480: "intellect"
  };
  return bySpec[specId] ?? byClass[classId];
}
export function farmPrimaryCompatible(entity: CatalogGearEntity, classId: number, specId: number) {
  const primary = primaryStatFor(classId, specId);
  const stats = entity.tooltip?.blocks?.filter(b => b.type === "item_variants").flatMap(b => Array.isArray(b.entries) ? b.entries : []).flatMap(e => Array.isArray(e.stats) ? e.stats : []) ?? [];
  const kinds = new Set(stats.filter(s => Number(s.allocation) > 0 || Number(s.value) > 0).map(s => Number(s.type)));
  const keys: Record<string, number[]> = {
    strength: [4, 71, 72, 74],
    agility: [3, 71, 72, 73],
    intellect: [5, 71, 73, 74]
  };
  const primaries = [3, 4, 5, 71, 72, 73, 74].filter(id => kinds.has(id));
  if (primaries.length) return Boolean(primary && keys[primary]?.some(id => kinds.has(id)));
  const registry = entity.tooltip?.blocks?.find(b => b.type === "item_registry");
  // Statless procs require an ItemSpec/effect proof. It is not present in the
  // public catalog, so do not recommend an arbitrary caster/tank trinket.
  return normalizeInventoryType(registry?.inventory_type) !== 12 && Number(registry?.class_id) !== 2;
}
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
    if (!farmPrimaryCompatible(loot.entity, input.context.classId, input.context.specId)) continue;
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
      slotType: equipped.slotType,
      currentItemId: equipped.itemId,
      currentItemLevel: equipped.itemLevel,
      encounterId: loot.encounterId,
      encounterName: loot.encounterName,
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
  const best = (a: FarmActivity) => Math.max(0, ...a.targets.filter(t => t.verification === "simulated").map(t => t.deltaPercent ?? 0));
  const verifiedSlots = (a: FarmActivity) => new Set(a.targets.filter(t => t.verification === "simulated" || t.verification === "item_level").map(t => t.slotType)).size;
  const weakest = (a: FarmActivity) => Math.min(10000, ...a.targets.map(t => t.currentItemLevel));
  return [...activities].sort((a, b) => access[a.access] - access[b.access] || best(b) - best(a) || verifiedSlots(b) - verifiedSlots(a) || weakest(a) - weakest(b) || a.id.localeCompare(b.id));
}
