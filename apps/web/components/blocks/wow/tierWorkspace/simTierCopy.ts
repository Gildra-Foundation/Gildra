/** Interface copy of the sim source tab of /tier-lists. */
import type { Lang } from "@/lib/i18n-paths";

export const SIM_TARGETS = [1, 3, 5, 8] as const;
export type SimTargets = (typeof SIM_TARGETS)[number];
export const SIM_ROLES = ["dps", "tank"] as const;
export type SimRole = (typeof SIM_ROLES)[number];
/** `best` is the highest of the three gear sets — the order the source ranks by. */
export const SIM_GEAR = ["best", "popular", "simcbis", "top50"] as const;
export type SimGear = (typeof SIM_GEAR)[number];

const ruTargets = (n: number) => {
  const rule = new Intl.PluralRules("ru-RU").select(n);
  return rule === "one" ? "цель" : rule === "few" ? "цели" : "целей";
};

export const simTierCopy = {
  ru: {
    tab: "Симуляции (MythiStone)",
    sourceName: "MythiStone",
    title: "Урон в симуляции",
    targets: "Цели",
    targetsLabel: (n: number) => `${n} ${ruTargets(n)}`,
    gear: "Комплект",
    gearNames: { best: "Лучший из трёх", popular: "Популярный", simcbis: "Оптимальный", top50: "Топ-50 игроков" } as Record<SimGear, string>,
    roles: { dps: "Урон", tank: "Танки" } as Record<SimRole, string>,
    role: "Роль",
    rank: "№",
    tier: "Тир",
    spec: "Специализация",
    dps: "DPS",
    behind: "От №1",
    leader: "лидер",
    caption: (role: string, targets: string, gear: string) => `Урон в симуляции: ${role}, ${targets}, комплект «${gear}»`,
    detailLabel: "Специализация",
    rankLine: (rank: number, total: number, targets: string) => `№${rank} из ${total} · ${targets}`,
    byTargets: "По числу целей",
    pickTargets: (targets: string) => `Показать: ${targets}`,
    specPage: "Страница специализации",
    empty: "Нет данных для этого набора.",
    loading: "Загружаем симуляции…",
    loadError: "Не удалось загрузить симуляции. Попробуйте ещё раз позже.",
    notSimmed: "нет",
  },
  en: {
    tab: "Sim (MythiStone)",
    sourceName: "MythiStone",
    title: "Simulated damage",
    targets: "Targets",
    targetsLabel: (n: number) => `${n} ${n === 1 ? "target" : "targets"}`,
    gear: "Gear set",
    gearNames: { best: "Best of three", popular: "Popular", simcbis: "Optimized", top50: "Top 50 players" } as Record<SimGear, string>,
    roles: { dps: "Damage", tank: "Tanks" } as Record<SimRole, string>,
    role: "Role",
    rank: "#",
    tier: "Tier",
    spec: "Specialization",
    dps: "DPS",
    behind: "Behind #1",
    leader: "leader",
    caption: (role: string, targets: string, gear: string) => `Simulated damage: ${role}, ${targets}, ${gear} gear`,
    detailLabel: "Specialization",
    rankLine: (rank: number, total: number, targets: string) => `#${rank} of ${total} · ${targets}`,
    byTargets: "By target count",
    pickTargets: (targets: string) => `Show ${targets}`,
    specPage: "Spec page",
    empty: "No data for this selection.",
    loading: "Loading simulations…",
    loadError: "Could not load the simulations. Try again later.",
    notSimmed: "n/a",
  },
} satisfies Record<Lang, unknown>;

export type SimTierCopy = (typeof simTierCopy)["en"];
