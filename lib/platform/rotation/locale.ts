import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { RotationAbility, RotationPreset, RotationScenario, RotationSimulationResult, SavedRotationCombo } from "./types";

export const rotationLabelKey = (value: string) => value.toLowerCase().replace(/[^a-zа-яё0-9]/g, "");

const resources: Record<string, [string, string]> = {
  rage: ["Rage", "Ярость"], mana: ["Mana", "Мана"], energy: ["Energy", "Энергия"],
  runicpower: ["Runic Power", "Сила рун"], runes: ["Runes", "Руны"], focus: ["Focus", "Концентрация"],
  holypower: ["Holy Power", "Энергия Света"], soulshards: ["Soul Shards", "Осколки душ"],
  astralpower: ["Astral Power", "Астральная мощь"], essence: ["Essence", "Сущность"],
  insanity: ["Insanity", "Безумие"], maelstrom: ["Maelstrom", "Водоворот"], chi: ["Chi", "Ци"],
  pain: ["Pain", "Боль"], fury: ["Fury", "Гнев"], combopoints: ["Combo Points", "Очки серии приёмов"],
};

export function rotationResourceLabel(value: string, lang: Lang) {
  const key = rotationLabelKey(value);
  const pair = resources[key] ?? Object.values(resources).find((labels) => labels.some((label) => rotationLabelKey(label) === key));
  return pair?.[lang === "ru" ? 1 : 0] ?? t(lang)(value);
}

export function rotationScenarioLabel(scenario: RotationScenario, lang: Lang, targets?: number) {
  if (scenario === "single-target") return lang === "ru" ? "Одна цель" : "Single target";
  if (scenario === "execute") return lang === "ru" ? "Добивание" : "Execute";
  if (targets === 2) return lang === "ru" ? "Две цели" : "Cleave · 2";
  return `${lang === "ru" ? "Урон по площади" : "AoE"}${targets ? ` · ${targets}` : ""}`;
}

/** Only system-generated names carry this marker; user-authored names stay intact. */
export function rotationComboName(combo: SavedRotationCombo, lang: Lang, buildName?: string) {
  if (combo.nameSource !== "generated") return combo.name;
  return `${buildName ?? combo.buildName} · ${rotationScenarioLabel(combo.scenario, lang, combo.targetCount)}`;
}

/** Persisted/simulation payloads must not replace names from the current locale's catalog. */
export function mergeRotationAbility(existing: RotationAbility | undefined, incoming: RotationAbility): RotationAbility {
  return { ...existing, ...incoming, name: existing?.name || incoming.name, hint: existing?.hint || incoming.hint };
}

/** Match localized ability records by spell identity; never translate an action token or infer a spell name. */
export function localizeRotationCatalog(preset: RotationPreset, localized: ReadonlyMap<number, { name: string; description: string }>, lang: Lang): RotationPreset {
  const gameLabels: Record<string, string> = {};
  const abilities = preset.abilities.map((ability) => {
    const local = ability.spellId ? localized.get(ability.spellId) : undefined;
    if (!local) return ability;
    gameLabels[rotationLabelKey(ability.name)] = local.name;
    gameLabels[rotationLabelKey(ability.id)] = local.name;
    return { ...ability, name: local.name, hint: local.description || ability.hint };
  });
  return {
    ...preset, locale: lang, gameLabels,
    aplOptions: preset.aplOptions ? { ...preset.aplOptions, labels: gameLabels } : undefined,
    abilities,
  };
}

export function localizeRotationResult(result: RotationSimulationResult, abilities: RotationAbility[], lang: Lang, gameLabels: Record<string, string> = {}): RotationSimulationResult {
  const byId = new Map(abilities.map((ability) => [ability.id, ability]));
  const name = (value: string) => gameLabels[rotationLabelKey(value)] ?? value;
  const tr = t(lang);
  return {
    ...result,
    resourceLabel: rotationResourceLabel(result.resourceLabel ?? "Resource", lang),
    resources: result.resources?.map((resource) => ({ ...resource, label: rotationResourceLabel(resource.key || resource.label, lang) })),
    cooldowns: result.cooldowns?.map((cooldown) => ({ ...cooldown, name: byId.get(cooldown.abilityId)?.name ?? name(cooldown.name) })),
    procs: result.procs?.map((proc) => ({ ...proc, name: name(proc.name) })),
    metrics: result.metrics.map((metric) => {
      const efficiency = /^(.*) Efficiency$/.exec(metric.label);
      return { ...metric, label: lang === "ru" && efficiency ? `${rotationResourceLabel(efficiency[1], lang)}: эффективность` : tr(metric.label) };
    }),
    findings: result.findings.map((finding) => {
      let title = tr(finding.title);
      let detail = tr(finding.detail);
      if (lang === "ru") {
        const overflow = /^(.*) Overflow$/.exec(finding.title);
        const window = /^(.*) Window$/.exec(finding.title);
        const efficiency = /^Observed resource efficiency was ([\d.]+)% in the reference simulation\.$/.exec(finding.detail);
        if (overflow) title = `${rotationResourceLabel(overflow[1], lang)}: переполнение`;
        if (window) title = `${name(window[1])}: окно применения`;
        if (efficiency) detail = `Эффективность ресурса в эталонном расчёте: ${efficiency[1]}%.`;
      }
      return { ...finding, title, detail };
    }),
  };
}
