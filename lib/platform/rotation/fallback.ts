import { abilityIcon, specIcon } from "@/lib/games/wow/assets";
import type { Lang } from "@/lib/i18n";
import { getMidnightTalentData } from "@/lib/talentCalculatorData";
import { defaultTalentSpecTheme, getTalentSpecTheme } from "@/lib/talentSpecThemes";
import type { RotationPreset } from "./types";
import { priorityToAplRules } from "./apl";
import { resolveRotationAbilitySpellId } from "./spellIds";

const ability = (id: string, name: string, hint: string, suppliedSpellId?: number) => {
  const spellId = resolveRotationAbilitySpellId(id, suppliedSpellId);
  return {
    id,
    name,
    hint,
    iconUrl: abilityIcon(id) ?? specIcon("Fury Warrior") ?? "",
    ...(spellId ? { spellId } : {}),
  };
};

function furyRotationPreset(lang: Lang): RotationPreset {
  const ru = lang === "ru";
  const defaultRules = ["rampage", "bloodthirst", "raging-blow", "execute", "odyns-fury", "whirlwind"];
  const defaultAplRules = priorityToAplRules(defaultRules, "maintained");
  defaultAplRules[0].conditions = [{ type: "resource", resource: "rage", operator: "gte", value: 80 }];
  defaultAplRules[1].conditions = [{ type: "buff", aura: "enrage", state: "down" }];
  defaultAplRules[3].conditions = [{ type: "execute", operator: "lte", value: 20 }];
  return {
    slug: "fury-warrior",
    className: "Warrior",
    specialization: "Fury Warrior",
    patch: "12.1.0",
    engineLabel: ru ? "локальный движок готов" : "local engine ready",
    resourceLabel: ru ? "Ярость" : "Rage",
    locale: lang,
    character: {
      name: "MID2 Reference",
      level: 90,
      itemLevel: 339,
      iconUrl: specIcon("Fury Warrior") ?? "",
    },
    abilities: [
      ability("rampage", "Rampage", ru ? "При Rage ≥ 80" : "Use at 80+ Rage"),
      ability("bloodthirst", "Bloodthirst", ru ? "Поддерживать Enrage" : "Maintain Enrage"),
      ability("raging-blow", "Raging Blow", ru ? "Использовать заряды" : "Spend charges"),
      ability("execute", "Execute", ru ? "При здоровье цели < 20%" : "Target below 20%"),
      ability("odyns-fury", "Odyn's Fury", ru ? "По готовности" : "Use on cooldown"),
      ability("whirlwind", "Whirlwind", ru ? "Перед cleave-окном" : "Before cleave window"),
      ability("recklessness", "Recklessness", ru ? "Главное burst-окно" : "Primary burst window"),
      ability("avatar", "Avatar", ru ? "Совмещать с burst" : "Align with burst"),
      ability("bladestorm", "Bladestorm", ru ? "Большой AoE-кулдаун" : "Major AoE cooldown"),
      ability("bloodlust", "Bloodlust", ru ? "Групповое burst-окно" : "Group burst window"),
    ],
    defaultRules,
    defaultAplRules,
    aplSource: { kind: "gildra-fallback", label: ru ? "Безопасный шаблон Gildra" : "Safe Gildra template" },
    aplOptions: { resources: ["rage"], buffs: ["enrage"], cooldowns: defaultRules },
  };
}

const abilityHints = {
  ru: ["Главный приоритет", "Поддерживать эффект", "Использовать по готовности", "Сильное окно урона", "Ситуативная способность", "Заполняет паузу в ротации", "Защитное или вспомогательное окно", "Дополнительный боевой инструмент"],
  en: ["Top priority", "Maintain the effect", "Use on cooldown", "Major output window", "Situational ability", "Fills a gap in the rotation", "Defensive or utility window", "Additional combat tool"],
} as const;

const englishResources: Record<string, string> = {
  "Ярость": "Rage", "Мана": "Mana", "Энергия": "Energy", "Сила рун": "Runic Power",
  "Концентрация": "Focus", "Энергия Света": "Holy Power", "Осколки душ": "Soul Shards",
  "Астральная мощь": "Astral Power", "Сущность": "Essence", "Безумие": "Insanity",
  "Водоворот": "Maelstrom", "Ци": "Chi", "Боль": "Pain", "Гнев": "Fury",
};

export async function fallbackRotationPreset(slug: string, lang: Lang): Promise<RotationPreset> {
  if (slug === "fury-warrior") return furyRotationPreset(lang);
  const theme = getTalentSpecTheme(slug) ?? defaultTalentSpecTheme;
  let abilities: RotationPreset["abilities"] = [];
  let patch = "12.1.0";
  try {
    const data = await getMidnightTalentData(theme.slug, undefined, lang);
    patch = data.buildVersion;
    const seen = new Set<string>();
    const activeChoices = (["spec", "hero", "class"] as const)
      .flatMap((tree) => [...data.trees[tree].nodes].sort((a, b) => a.row - b.row || a.column - b.column).flatMap((node) => node.choices))
      .filter((choice) => choice.talentType === "active")
      .filter((choice) => {
        const key = `${choice.spellId ?? choice.externalId}:${choice.name.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 10);
    abilities = activeChoices.map((choice, index) => ({
      id: `spell-${choice.spellId ?? choice.externalId}`,
      name: choice.name,
      hint: abilityHints[lang][Math.min(index, abilityHints[lang].length - 1)],
      iconUrl: choice.iconUrl || theme.iconUrl,
      ...(choice.spellId ? { spellId: choice.spellId } : {}),
    }));
  } catch {
    abilities = Array.from({ length: 6 }, (_, index) => ({
      id: `core-${index + 1}`,
      name: lang === "ru" ? `Основная способность ${index + 1}` : `Core ability ${index + 1}`,
      hint: abilityHints[lang][index],
      iconUrl: theme.iconUrl,
    }));
  }
  const defaultRules = abilities.slice(0, 6).map((ability) => ability.id);
  return {
    slug: theme.slug,
    className: theme.className,
    specialization: `${theme.specName} ${theme.className}`,
    patch,
    engineLabel: lang === "ru" ? "встроенная модель готова" : "built-in model ready",
    resourceLabel: lang === "ru" ? theme.resourceLabel : (englishResources[theme.resourceLabel] ?? "Resource"),
    locale: lang,
    character: {
      name: lang === "ru" ? `${theme.specNameRu} · Midnight` : `${theme.specName} · Midnight`,
      level: 90,
      itemLevel: 339,
      iconUrl: theme.iconUrl,
    },
    abilities,
    defaultRules,
    defaultAplRules: priorityToAplRules(defaultRules, "maintained"),
    aplSource: { kind: "gildra-fallback", label: lang === "ru" ? "Безопасный шаблон Gildra" : "Safe Gildra template" },
    aplOptions: { resources: [], buffs: [], cooldowns: defaultRules },
  };
}
