import "server-only";
import { createHash } from "node:crypto";
import { getRotationPreset } from "@/lib/platform/rotation/repository";
import { talentSpecThemes } from "@/lib/talentSpecThemes";
import { getBattleNetCharacterBySlug, type BattleNetCharacter } from "../battleNetCharacters";
import { getBattleNetSimulationSnapshot, type BattleNetSimulationSnapshot } from "../battleNetCharacterDetails";
import { catalogLoadoutItem, gearSlotCategoryPaths } from "../gearCandidates";
import { currentGearSeason, lookupGearEntities } from "../gearCandidateRepository";
import { farmRules, endgameFarmRules, farmAccess, normalLootMask } from "./rules";
import { getFarmLoot, type FarmLoot } from "./repository";
import { sourceTargets, sortFarmActivities, type EquippedFarmItem } from "./planner";
import { resolveFarmRewards } from "./rewards";
import { confirmFarmImprovements, farmSimulationScenario } from "./confirmation";
import type { GearPlanSimulation } from "../auctionGearPlanner";
import type { FarmActivity, FarmProgress, GearFarmInput, GearFarmResult } from "./types";
export async function runGearFarmPlan(input: GearFarmInput, token: string, signal: AbortSignal, progress: (p: FarmProgress) => void): Promise<GearFarmResult> {
  signal.throwIfAborted();
  const character = await getBattleNetCharacterBySlug(token, input.locale, input.characterSlug);
  if (!character) throw new Error("character_not_found");
  const armory = await getBattleNetSimulationSnapshot(token, character);
  return runGearFarmFromSnapshot(input, character, armory, token, signal, progress);
}
/** Internal trusted-snapshot entry point. The HTTP route resolves ownership. */
export async function runGearFarmFromSnapshot(input: GearFarmInput, character: BattleNetCharacter, armory: BattleNetSimulationSnapshot, token: string, signal: AbortSignal, progress: (p: FarmProgress) => void): Promise<GearFarmResult> {
  const season = currentGearSeason();
  if (season.id !== "midnight-season-2") throw new Error("farm_rules_update_required");
  if (armory.profile.id !== character.id || armory.profile.level !== character.level) throw new Error("character_snapshot_changed");
  const raw = armory.equipment.equipped_items as Array<{
    item?: {
      id?: number;
    };
    slot?: {
      type?: string;
    };
    level?: {
      value?: number;
    };
  }>;
  if (!Array.isArray(raw)) throw new Error("equipment_constraints_unverified");
  const equipment: EquippedFarmItem[] = raw.flatMap(e => e.item?.id && e.slot?.type && gearSlotCategoryPaths[e.slot.type] && Number.isInteger(e.level?.value) && e.level!.value! > 0 ? [{
    itemId: e.item.id,
    slotType: e.slot.type,
    itemLevel: e.level!.value!
  }] : []);
  if (equipment.length < 1 || equipment.length !== raw.filter(e => e.slot?.type && gearSlotCategoryPaths[e.slot.type]).length) throw new Error("equipment_constraints_unverified");
  const equippedItemLevel = Number(armory.profile.equipped_item_level);
  if (!Number.isInteger(equippedItemLevel) || equippedItemLevel <= 0) throw new Error("equipment_constraints_unverified");
  const entities = await lookupGearEntities(equipment.map(e => e.itemId), input.locale === "ru" ? "ru_RU" : "en_US");
  signal.throwIfAborted();
  const loadout = equipment.map(e => {
    const entity = entities.find(i => i.externalId === e.itemId);
    if (!entity) throw new Error("equipment_constraints_unverified");
    return catalogLoadoutItem(entity, e.slotType);
  });
  const activities: FarmActivity[] = [];
  const lootByActivity = new Map<string, FarmLoot[]>();
  let lootItemsChecked = 0;
  for (const [index, rule] of [...farmRules, ...endgameFarmRules].entries()) {
    signal.throwIfAborted();
    progress({
      phase: "sources",
      completed: index,
      total: farmRules.length + endgameFarmRules.length
    });
    const activity: FarmActivity = {
      ...rule,
      access: farmAccess(rule, character.level, equippedItemLevel),
      targets: [],
      lootItemsChecked: 0,
      variantsUnverified: 0
    };
    // Level/queue failures are shown with a reason, without expensive loot
    // queries or recommendations for content the character cannot enter.
    if (activity.access === "level_locked" || activity.access === "gear_locked") {
      activities.push(activity);
      continue;
    }
    if (rule.difficulty !== "normal") {
      activities.push(activity);
      continue;
    }
    const source = await getFarmLoot(rule, input.locale, signal);
    if (source.instance) {
      activity.name = source.instance.name;
      // Localized name is display-only; English source identity came from the
      // exact published instance lookup, not a fuzzy item-name match.
      activity.instanceEntityId = source.instance.id;
      activity.journalInstanceId = source.instance.externalId;
    }
    const loot = source.loot.filter(l => normalLootMask(l.difficultyMask));
    lootByActivity.set(activity.id, loot);
    activity.lootItemsChecked = new Set(loot.map(l => l.entity.externalId)).size;
    lootItemsChecked += activity.lootItemsChecked;
    activity.targets = sourceTargets({
      loot,
      activity,
      equipment,
      loadout,
      context: {
        classId: character.playableClass.id,
        specId: armory.activeSpecializationId,
        characterLevel: character.level,
        raceId: character.playableRace.id,
        faction: character.faction.type,
        anchorItemClassId: -1,
        anchorItemSubclassId: -1,
        season: {
          ...season,
          activityNames: [rule.name]
        }
      }
    });
    activities.push(activity);
  }
  const rewards = await resolveFarmRewards({ activities, lootByActivity, equipment, loadout, character, armory, token, signal, onProgress: progress });
  const theme = talentSpecThemes.find(t => t.classId === character.playableClass.id && t.specId === armory.activeSpecializationId);
  if (!theme) throw new Error("specialization_unresolved");
  // Damage simulation only confirms damage specializations. Exact rewards for
  // tanks and healers stay explicitly unmeasured instead of claiming readiness.
  const supportsDamage = ["melee", "ranged"].includes(theme.role);
  const preset = supportsDamage && rewards.options.length ? await getRotationPreset(theme.slug, input.locale) : null;
  if (preset && !preset.defaultRules.length) throw new Error("rotation_unavailable");
  const confirmation = await confirmFarmImprovements({
    activities, options: supportsDamage ? rewards.options : [], equipment: armory.equipment, loadout,
    specId: armory.activeSpecializationId, characterLevel: character.level, signal, onProgress: progress,
    simulate: async (prepared, simSignal): Promise<GearPlanSimulation> => {
      const response = await fetch(`${(process.env.ROTATION_WORKER_URL ?? "http://127.0.0.1:58082").replace(/\/$/, "")}/v1/wow/rotation/simulations`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, cache: "no-store",
        signal: AbortSignal.any([simSignal, AbortSignal.timeout(50_000)]),
        body: JSON.stringify({
          spec: theme.slug, scenario: farmSimulationScenario, fightLengthSeconds: 120, targets: 1,
          rules: preset!.defaultRules, talentLoadout: armory.activeTalentLoadout,
          armory: { profile: armory.profile, specializations: armory.specializations, equipment: prepared.equipment },
          ...(prepared.changes.length ? { gearChanges: prepared.changes } : {}),
        }),
      });
      if (!response.ok || response.headers.get("x-gildra-engine") !== "simulationcraft") throw new Error("simulation_unavailable");
      return await response.json() as GearPlanSimulation;
    },
  });
  for (const activity of activities) {
    activity.variantsUnverified = new Set(activity.targets.filter(t => t.verification === "scaling_unverified").map(t => t.itemId)).size;
    const rank = (state: typeof activity.targets[number]["verification"]) => ({ simulated: 0, item_level: 1, variant_verified: 2, scaling_unverified: 3, not_upgrade: 4 })[state];
    activity.targets.sort((a, b) => rank(a.verification) - rank(b.verification) || (b.deltaPercent ?? 0) - (a.deltaPercent ?? 0) || a.currentItemLevel - b.currentItemLevel || a.itemId - b.itemId || a.slotType.localeCompare(b.slotType));
  }
  signal.throwIfAborted();
  return {
    character: {
      name: character.name,
      level: character.level,
      equippedItemLevel,
      specId: armory.activeSpecializationId
    },
    activities: sortFarmActivities(activities),
    ...(confirmation.engine ? { engine: confirmation.engine, baselineDps: confirmation.baselineDps } : {}),
    checkedAt: new Date().toISOString(),
    profileFingerprint: createHash("sha256").update(JSON.stringify(armory)).digest("hex"),
    coverage: {
      instancesChecked: activities.length,
      lootItemsChecked,
      exactVariants: rewards.exactVariants,
      simulations: confirmation.simulations,
      searchLimited: rewards.searchLimited || confirmation.searchLimited || !supportsDamage ||
        activities.some(activity => activity.targets.some(target => target.verification === "scaling_unverified" || target.verification === "variant_verified"))
    }
  };
}
