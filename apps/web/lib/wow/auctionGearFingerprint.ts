import { createHash } from "node:crypto";
import type { BattleNetSimulationSnapshot } from "./battleNetCharacterDetails";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const ids = (value: unknown) => array(value).map(Number).sort((a, b) => a - b);
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
}

/**
 * Mechanical snapshot identity, independent of API presentation and JSON order.
 * The pinned SimC Profile API importer consumes level/class/race/spec, exact
 * item IDs, bonuses, drop level, enchants, sockets and crafting stats. Keep
 * quantitative equipped facts too, so changed scale/weapon data invalidates a
 * result while achievements, login time, names and localized text do not.
 */
export function auctionGearProfileFingerprint(armory: BattleNetSimulationSnapshot) {
  const profile = object(armory.profile);
  const equipment = array(object(armory.equipment).equipped_items).map(value => {
    const item = object(value), weapon = object(item.weapon);
    const azerite = object(item.azerite_details);
    return {
      slot: object(item.slot).type,
      itemId: object(item.item).id,
      context: item.context ?? 0,
      timewalkerLevel: item.timewalker_level,
      level: object(item.level).value,
      inventoryType: object(item.inventory_type).type,
      bonusIds: ids(item.bonus_list),
      modifiers: array(item.modifiers).map(value => ({ type: object(value).type, value: object(value).value }))
        .sort((a, b) => Number(a.type) - Number(b.type) || Number(a.value) - Number(b.value)),
      craftedStats: array(item.modified_crafting_stat).map(value => object(value).id),
      enchantments: array(item.enchantments).map(value => ({ id: object(value).enchantment_id,
        slot: object(object(value).enchantment_slot).id })).sort((a, b) => Number(a.slot) - Number(b.slot) || Number(a.id) - Number(b.id)),
      // Socket order is meaningful; bonus list order is not.
      sockets: array(item.sockets).map(value => ({ type: object(object(value).socket_type).type,
        itemId: object(object(value).item).id, bonusIds: ids(object(value).bonus_list) })),
      armor: object(item.armor).value,
      stats: array(item.stats).map(value => ({ type: object(object(value).type).type,
        value: object(value).value, negated: object(value).is_negated === true }))
        .sort((a, b) => String(a.type).localeCompare(String(b.type)) || Number(a.value) - Number(b.value)),
      weapon: { minimum: object(weapon.damage).min_value, maximum: object(weapon.damage).max_value,
        speed: object(weapon.attack_speed).value, dps: object(weapon.dps).value },
      // SimC18428cd::parse_blizzard_azerite_information reads these identities,
      // ranks and level, never the localized names, descriptions or API links.
      azerite: {
        powers: array(azerite.selected_powers).map(value => object(value).id).sort((a, b) => Number(a) - Number(b)),
        essences: array(azerite.selected_essences).filter(value => object(value).essence).map(value => ({
          slot: object(value).slot, id: object(object(value).essence).id, rank: object(value).rank,
        })).sort((a, b) => Number(a.slot) - Number(b.slot) || Number(a.id) - Number(b.id) || Number(a.rank) - Number(b.rank)),
        level: object(azerite.level).value,
      },
    };
  }).sort((a, b) => String(a.slot).localeCompare(String(b.slot)) || Number(a.itemId) - Number(b.itemId));
  return createHash("sha256").update(JSON.stringify(canonical({
    profile: { level: profile.level, classId: object(profile.character_class).id,
      raceId: object(profile.race).id, faction: object(profile.faction).type },
    specialization: armory.activeSpecializationId,
    heroTree: armory.activeHeroTalentTreeId,
    talentLoadout: armory.activeTalentLoadout,
    equipment,
  }))).digest("hex");
}
