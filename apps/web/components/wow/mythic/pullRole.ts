import type { PullIntel, PullRole } from "./mdtPullIntel";
import { canHelpWithMechanic, type PlayerSpec } from "./playerTools";
import type { TalentSpellSelection } from "./mythicTalentImport";

export type PullRoleSelection = PullRole | "all";
export const pullRoleStorageKey = "gildra:mythic:pull-role";

export function parsePullRole(value: unknown): PullRoleSelection {
  return value === "tank" || value === "healer" || value === "dps" ? value : "all";
}

/** Shared mechanics remain relevant to every role; personal assignments come first. */
export function pullRoleTasks(intel: PullIntel, role: PullRole, spec?: PlayerSpec, selectedSpells?: TalentSpellSelection) {
  const personal = intel.mechanics.filter(ability => ability.role === role);
  const shared = intel.mechanics.filter(ability => ability.role === "all");
  const help = spec ? intel.mechanics.filter(ability => ability.role !== role && ability.role !== "all" && canHelpWithMechanic(spec, ability, selectedSpells)) : [];
  const mechanics = [...personal, ...shared, ...help];
  return {
    mechanics,
    preview: spec ? [...mechanics].sort((a, b) => Number(!canHelpWithMechanic(spec, a, selectedSpells)) - Number(!canHelpWithMechanic(spec, b, selectedSpells))).slice(0, 3) : personal.length && shared.length ? [...personal.slice(0, 2), ...shared.slice(0, 3 - Math.min(2, personal.length))] : mechanics.slice(0, 3),
    notes: [...new Set([...intel.roleNotes[role], ...intel.enemies.flatMap(enemy => enemy.note ? [enemy.note] : [])])],
  };
}
