import type { BattleNetCharacter } from "./battleNetCharacters";

/** Exact Blizzard SkillLine IDs. A listed profession without skill_points proves
 * membership only. An expansion tier never supplies its parent's numerical rank. */
export type CharacterProfessions = { ranks: Record<string, number | null>; complete: boolean };
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const integer = (value: unknown, min: number): value is number => Number.isSafeInteger(value) && Number(value) >= min;

export function characterProfessions(raw: unknown, character: Pick<BattleNetCharacter, "id" | "realm">): CharacterProfessions | undefined {
  const document = object(raw), owner = object(document.character);
  if (!integer(owner.id, 1) || owner.id !== character.id || !integer(character.realm.id, 1) ||
      object(owner.realm).id !== character.realm.id) return undefined;
  const { primaries, secondaries } = document;
  if (!Array.isArray(primaries) && !Array.isArray(secondaries)) return undefined;
  const ranks: CharacterProfessions["ranks"] = {};
  const record = (id: unknown, row: Record<string, unknown>) => {
    if (!integer(id, 1) || Object.hasOwn(ranks, id)) return false;
    const points = row.skill_points, max = row.max_skill_points;
    if (points !== undefined && !integer(points, 0) || max !== undefined && (!integer(max, 0) || typeof points === "number" && points > max)) return false;
    ranks[id] = typeof points === "number" ? points : null;
    return true;
  };
  for (const section of [primaries, secondaries]) {
    if (section === undefined) continue;
    if (!Array.isArray(section)) return undefined;
    for (const value of section) {
      const row = object(value);
      if (!record(object(row.profession).id, row)) return undefined;
      if (row.tiers === undefined) continue;
      if (!Array.isArray(row.tiers)) return undefined;
      for (const value of row.tiers) {
        const tier = object(value);
        if (!record(object(tier.tier).id, tier)) return undefined;
      }
    }
  }
  return { ranks, complete: Array.isArray(primaries) && Array.isArray(secondaries) };
}

export function professionEligibility(facts: CharacterProfessions | undefined, skillId: number, requiredRank: number) {
  if (!integer(skillId, 1) || !integer(requiredRank, 0) || !facts) return "unknown";
  const rank = facts.ranks[skillId];
  if (rank === undefined) return facts.complete ? "insufficient" : "unknown";
  if (rank !== null && !integer(rank, 0)) return "unknown";
  if (requiredRank === 0) return "eligible";
  if (rank === null) return "unknown";
  return rank >= requiredRank ? "eligible" : "insufficient";
}
