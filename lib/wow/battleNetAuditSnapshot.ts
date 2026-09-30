import { defaultTalentSpecTheme, talentSpecThemes } from "@/lib/talentSpecThemes";
import { furybarFixture, type AuditGearDetails, type AuditGearItem, type AuditGearQuality, type CharacterAuditSnapshot } from "./characterAudit";
import { characterSlug, type BattleNetCharacterDetails, type CharacterGearItem } from "./battleNetCharacterDetails";
import type { Lang } from "@/lib/i18n";

const modelByRace: Record<number, number> = { 1: 1, 2: 3, 3: 5, 4: 7, 5: 9, 6: 11, 7: 13, 8: 15, 9: 21, 10: 19, 11: 17, 22: 23, 24: 25, 27: 29, 28: 31, 29: 33, 30: 35, 31: 37, 32: 39, 34: 41, 35: 43, 36: 45, 37: 47, 52: 49 };

function primaryStat(classKey: string, spec: string): "Сила" | "Ловкость" | "Интеллект" {
  if (["warrior", "paladin", "deathknight"].includes(classKey)) return "Сила";
  if (["rogue", "hunter", "monk", "demonhunter"].includes(classKey)) return "Ловкость";
  if (classKey === "druid" && ["Feral", "Guardian", "Сила зверя", "Страж"].includes(spec)) return "Ловкость";
  if (classKey === "shaman" && ["Enhancement", "Совершенствование"].includes(spec)) return "Ловкость";
  return "Интеллект";
}

function gearQuality(value: string): AuditGearQuality {
  const quality = value.trim().toLocaleLowerCase();
  if (quality === "poor" || quality.includes("низк") || quality.includes("хлам")) return "Низкое качество";
  if (quality === "uncommon" || quality.includes("необычн")) return "Необычный";
  if (quality === "common" || quality.includes("обычн")) return "Обычный";
  if (quality === "rare" || quality.includes("редк")) return "Редкий";
  if (quality === "epic" || quality.includes("эпичес")) return "Эпический";
  if (quality === "legendary" || quality.includes("легенд")) return "Легендарный";
  if (quality === "artifact" || quality.includes("артефакт")) return "Артефакт";
  if (quality === "heirloom" || quality.includes("наслед")) return "Наследуемый";
  return "Неизвестное качество";
}

function gearDetails(item: CharacterGearItem, lang: Lang): AuditGearDetails {
  const ru = lang === "ru";
  return {
    quality: gearQuality(item.quality),
    binding: ru ? "Персональный предмет Battle.net" : "Battle.net character item",
    category: item.slot,
    secondaries: item.stats.map((stat) => ({ label: stat, value: "" })),
    enchant: item.enchantments[0] ? { name: item.enchantments[0], effect: ru ? "Активно" : "Active", active: true } : undefined,
    sockets: item.sockets.map((socket) => ({ color: "prismatic" as const, gem: socket.label, effect: socket.filled ? ru ? "Установлено" : "Socketed" : ru ? "Пустой сокет" : "Empty socket", filled: socket.filled })),
    set: item.setName ? { name: item.setName, equipped: 0, total: 0, bonuses: [] } : undefined,
    source: "Battle.net Profile API",
    audit: { impact: ru ? "Сравнение с текущим уровнем экипировки" : "Compared with current equipment level", nextStep: ru ? "Проверьте замену в подборе экипировки" : "Simulate a replacement in equipment comparison" },
  };
}

export function toCharacterAuditSnapshot(data: BattleNetCharacterDetails, lang: Lang = "ru"): CharacterAuditSnapshot {
  const ru = lang === "ru";
  const active = data.activeSpec?.toLocaleLowerCase("en-US");
  const theme = talentSpecThemes.find((entry) => entry.classId === data.character.playableClass.id && [entry.specName.toLowerCase(), entry.specNameRu.toLocaleLowerCase("ru-RU")].includes(active ?? ""))
    ?? talentSpecThemes.find((entry) => entry.classId === data.character.playableClass.id)
    ?? defaultTalentSpecTheme;
  const weak = new Set(data.recommendations.flatMap((entry) => entry.slots));
  const gear: AuditGearItem[] = data.equipment.map((item) => ({
    itemId: item.id, slotType: item.slotType, modificationIds: item.modificationIds,
    slot: item.slot, name: item.name, itemLevel: item.itemLevel, iconUrl: item.iconUrl ?? "/assets/wow/icon-unverified.svg",
    state: item.sockets.some((socket) => !socket.filled) ? "missing" : weak.has(item.slot) ? "issue" : item.itemLevel >= data.averageItemLevel ? "optimal" : "good",
    details: gearDetails(item, lang),
  }));
  const feminine = data.character.gender?.type === "FEMALE";
  const baseModelId = modelByRace[data.character.playableRace.id] ?? furybarFixture.appearance.modelId;
  return {
    slug: characterSlug(data.character),
    character: { name: data.character.name, className: `${ru ? theme.classNameRu : theme.className} · ${ru ? theme.specNameRu : theme.specName}`, race: data.character.playableRace.name, level: data.character.level, faction: data.character.faction.name, itemLevel: data.equippedItemLevel, mythicRating: Math.round(data.mythicRating ?? 0) },
    specialization: { slug: theme.slug, classKey: theme.classKey, className: ru ? theme.classNameRu : theme.className, specName: ru ? theme.specNameRu : theme.specName, role: theme.role, roleLabel: ru ? theme.roleRu : ({ tank: "Tank", healer: "Healer", melee: "Melee", ranged: "Ranged", support: "Support" }[theme.role]), primaryStatLabel: ru ? primaryStat(theme.classKey, theme.specName) : ({ "Сила": "Strength", "Ловкость": "Agility", "Интеллект": "Intellect" } as const)[primaryStat(theme.classKey, theme.specName)], accent: theme.accent, resourceLabel: ru ? theme.resourceLabel : ({ "Ярость": "Rage", "Энергия": "Energy", "Мана": "Mana", "Астральная мощь": "Astral power", "Сущность": "Essence", "Безумие": "Insanity", "Сила рун": "Runic power", "Концентрация": "Focus", "Энергия Водоворота": "Maelstrom", "Энергия ци": "Chi", "Осколки душ": "Soul shards", "Гнев": "Fury", "Боль": "Pain", "Энергия Света": "Holy power", "Тайные заряды": "Arcane charges" } as Record<string, string>)[theme.resourceLabel] ?? theme.resourceLabel, fantasy: ru ? theme.fantasy : `${theme.specName} ${theme.className}`, iconUrl: theme.iconUrl },
    appearance: { ...furybarFixture.appearance, presetId: `battlenet-${data.character.id}-${data.updatedAt}`, race: data.character.playableRace.name, modelId: feminine ? baseModelId + 1 : baseModelId, modelItems: data.modelItems, customizations: data.customizations, bodyType: feminine ? "feminine" : "masculine", skinTone: theme.deep, eyeGlow: theme.hot, armor: { setName: `Battle.net · ${data.equippedItemLevel}`, primary: theme.deep, secondary: theme.accent, accent: theme.hot, glow: theme.accent }, weapons: { mainHand: { ...furybarFixture.appearance.weapons.mainHand, itemName: data.equipment.find((item) => item.slotType === "MAIN_HAND")?.name ?? "Основное оружие" }, offHand: { ...furybarFixture.appearance.weapons.offHand, itemName: data.equipment.find((item) => item.slotType === "OFF_HAND")?.name ?? "Дополнительное оружие" } } },
    activeTalentLoadout: data.activeTalentLoadout,
    activeHeroTalentTreeId: data.activeHeroTalentTreeId,
    combatStats: {
      primary: data.stats.find((stat) => ["strength", "agility", "intellect"].includes(stat.key))?.rawValue ?? 0,
      crit: data.stats.find((stat) => stat.key === "crit")?.rawValue ?? 0,
      haste: data.stats.find((stat) => stat.key === "haste")?.rawValue ?? 0,
      mastery: data.stats.find((stat) => stat.key === "mastery")?.rawValue ?? 0,
      versatility: data.stats.find((stat) => stat.key === "versatility")?.rawValue ?? 0,
    },
    gear, source: "battle-net", updatedAt: ru ? "Battle.net · только что" : "Battle.net · just now",
  };
}
