import type { CatalogGearEntity } from "../gearCandidates";
import type { GearPlannerItemData } from "../gearPlannerPresentation";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const qualityIds: Record<string, number> = { POOR: 0, COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, ARTIFACT: 6, HEIRLOOM: 7, WOW_TOKEN: 8 };
const statKeys: Record<string, string> = {
  STRENGTH: "strength", AGILITY: "agility", INTELLECT: "intellect", STAMINA: "stamina",
  CRIT_RATING: "crit_rating", HASTE_RATING: "haste_rating", MASTERY_RATING: "mastery_rating",
  VERSATILITY: "versatility_rating", VERSATILITY_RATING: "versatility_rating",
  LIFESTEAL: "leech_rating", AVOIDANCE: "avoidance_rating", SPEED: "speed_rating",
};

/** Equipped numbers and effect text come only from the actual character item.
 * A catalog control may supply its identity/icon, never replacement scaled stats. */
export function equippedFarmItemPresentation(value: unknown, entity?: CatalogGearEntity): GearPlannerItemData | undefined {
  const raw = object(value), itemId = object(raw.item).id, itemLevel = object(raw.level).value;
  if (!Number.isSafeInteger(itemId) || Number(itemId) <= 0 || !Number.isInteger(itemLevel) || Number(itemLevel) <= 0) return undefined;
  const catalog = entity?.externalId === itemId ? entity : undefined;
  const name = text(raw.name) || catalog?.name;
  if (!name) return undefined;
  const stats: Record<string, number> = {};
  const statLines: string[] = [];
  const armor = object(raw.armor);
  if (typeof armor.value === "number" && Number.isFinite(armor.value) && armor.value >= 0) stats.armor = armor.value;
  const armorLine = text(object(armor.display).display_string);
  if (armorLine) statLines.push(armorLine);
  for (const entry of Array.isArray(raw.stats) ? raw.stats : []) {
    const stat = object(entry);
    if (stat.is_negated === true) continue;
    const key = statKeys[text(object(stat.type).type)];
    if (key && typeof stat.value === "number" && Number.isFinite(stat.value) && stat.value >= 0) stats[key] = stat.value;
    const line = text(object(stat.display).display_string);
    if (line) statLines.push(line);
  }
  const effects = (Array.isArray(raw.spells) ? raw.spells : []).map(entry => text(object(entry).description)).filter(Boolean);
  const requiredLevel = object(object(raw.requirements).level).value;
  const quality = qualityIds[text(object(raw.quality).type)];
  return {
    itemId: Number(itemId), name, itemLevel: Number(itemLevel),
    ...(catalog?.iconUrl ? { iconUrl: catalog.iconUrl } : {}),
    ...(Number.isInteger(quality) && Number(quality) >= 0 && Number(quality) <= 8 ? { quality } : {}),
    ...(Number.isInteger(requiredLevel) && Number(requiredLevel) >= 0 && Number(requiredLevel) <= 90 ? { requiredLevel: Number(requiredLevel) } : {}),
    ...(text(object(raw.slot).type) ? { slotType: text(object(raw.slot).type) } : {}),
    ...(Object.keys(stats).length ? { stats } : {}),
    ...(statLines.length ? { statLines } : {}),
    ...(effects.length ? { effects } : {}),
  };
}
