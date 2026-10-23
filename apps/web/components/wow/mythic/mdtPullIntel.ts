import type { MdtNode } from "@/lib/data/wow/mythicReview.types";
import type { RouteAbility, RouteStop } from "@/lib/data/wow/mythic/rubyLifePoolsData";
import type { DungeonCombatIntel } from "./dungeonCombatIntel.types";

export type PullRole = "tank" | "healer" | "dps";
export type PullMechanic = { name: string; source: string; action: RouteAbility["action"]; role: PullRole | "all" };
export type PullIntel = {
  enemies: { name: string; count: number; covered: boolean }[];
  mechanics: PullMechanic[];
  roleNotes: Record<PullRole, string[]>;
  facts: DungeonCombatIntel["review"]["facts"];
  hasConflicts: boolean;
};

const normalize = (value: string) => value.toLocaleLowerCase("en-US").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
const unique = (items: string[]) => [...new Set(items)];

function roleFor(ability: RouteAbility): PullMechanic["role"] {
  if (ability.target === "ArcanistVexis") return "tank";
  if (ability.target === "MysticHeals" || ability.action === "Диспел") return "healer";
  if (["ShadowNova", "Windborne", "Ironclad", "Все DPS"].includes(ability.target)) return "dps";
  return ["Кик", "Стоп", "Пурж", "Фокус"].includes(ability.action) ? "dps" : "all";
}

/** Match identities, never step numbers or coordinates: MDT and the draft have different pulls. */
export function buildMdtPullIntel(members: MdtNode[], stops: RouteStop[], intel: DungeonCombatIntel): PullIntel {
  const nodesByNpc = new Map(members.map(node => [node.npcId, node]));
  const aliases = new Map<string, string>(members.map(node => [normalize(node.name), node.name]));
  // Only an explicitly verified NPC identity can bridge a renamed source entity.
  for (const [name, value] of Object.entries(intel.enemies)) {
    if (value.media?.identityVerified && value.media.npcId && nodesByNpc.has(value.media.npcId)) {
      const member = nodesByNpc.get(value.media.npcId)!;
      aliases.set(normalize(name), member.name);
    }
  }
  const corrections = intel.review.corrections.map(item => normalize(item.en));
  const conflictedAbility = (name: string) => corrections.some(text => text.includes(normalize(name)));
  const matched = stops.filter(stop => stop.enemies.some(enemy => aliases.has(normalize(enemy.name))));
  const mechanics = new Map<string, PullMechanic>();
  const relatedAbilityNames = new Set<string>();
  let hasConflicts = false;
  for (const stop of matched) for (const ability of stop.abilities) {
    const source = ability.source ?? intel.abilities[ability.name]?.source;
    if (!source || !aliases.has(normalize(source))) continue;
    relatedAbilityNames.add(ability.name);
    if (conflictedAbility(ability.name)) { hasConflicts = true; continue; }
    const actualSource = aliases.get(normalize(source))!;
    mechanics.set(`${normalize(actualSource)}:${normalize(ability.name)}`, {
      name: ability.name, source: actualSource, action: ability.action, role: roleFor(ability),
    });
  }
  // Whole-step advice is safe to transfer only when every enemy of that step is in this pull.
  // Conflicted draft steps stay in the legacy editor; reviewed facts remain available below.
  const safeStops = matched.filter(stop => {
    if (!stop.enemies.length || !stop.enemies.every(enemy => aliases.has(normalize(enemy.name)))) return false;
    const conflict = stop.abilities.some(ability => conflictedAbility(ability.name)) || stop.enemies.some(enemy =>
      normalize(enemy.name).split(/[^a-z]+/).filter(word => word.length >= 6).some(word => corrections.some(text => text.includes(word))));
    if (conflict) hasConflicts = true;
    return !conflict;
  });
  const subjects = [...aliases.keys(), ...[...relatedAbilityNames].map(normalize)];
  const facts = intel.review.facts.filter(fact => subjects.some(name => normalize(fact.en).includes(name)));
  const counts = new Map<string, number>();
  for (const node of members) counts.set(node.name, (counts.get(node.name) ?? 0) + 1);
  return {
    enemies: [...counts].map(([name, count]) => ({ name, count, covered: matched.some(stop => stop.enemies.some(enemy => aliases.get(normalize(enemy.name)) === name)) })),
    mechanics: [...mechanics.values()],
    roleNotes: {
      tank: unique(safeStops.map(stop => stop.tank).filter(Boolean)),
      healer: unique(safeStops.map(stop => stop.healer).filter(Boolean)),
      dps: unique(safeStops.map(stop => stop.dps).filter(Boolean)),
    },
    facts, hasConflicts,
  };
}
