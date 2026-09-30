import type { Lang } from "@/lib/i18n";
import type { PlatformGameId } from "@/lib/platform/home/types";

export type HubIcon = "radar" | "swords" | "route" | "database" | "sparkles" | "shield" | "target" | "chart";

export type GameHubModule = {
  icon: HubIcon;
  title: string;
  description: string;
  badge: string;
  href: string;
};

export type GameHubDefinition = {
  id: PlatformGameId;
  slug: string;
  name: string;
  iconUrl: string;
  accent: string;
  accentSoft: string;
  signalLabel: string;
  copy: {
    eyebrow: string;
    tagline: string;
    description: string;
    explore: string;
    compare: string;
    follow: string;
    followed: string;
    personalSignal: string;
    commandDeck: string;
    commandHint: string;
    modules: string;
    modulesHint: string;
    metaSignal: string;
    patchIntel: string;
    activeBuild: string;
    continue: string;
    open: string;
    score: string;
    rank: string;
    movement: string;
    changes: string;
    updated: string;
    database: string;
  };
  modules: GameHubModule[];
};

type DefinitionSeed = Omit<GameHubDefinition, "copy" | "modules"> & {
  copy: Record<Lang, GameHubDefinition["copy"]>;
  modules: Record<Lang, GameHubModule[]>;
};

const sharedCopy = {
  en: {
    explore: "Explore database", compare: "Open comparison", follow: "Track world", followed: "World tracked",
    personalSignal: "Personal signal", commandDeck: "Command deck", commandHint: "Live tools shaped around your current focus.",
    modules: "Intelligence systems", modulesHint: "Move from signal to decision without leaving the game context.",
    metaSignal: "Meta signal", patchIntel: "Patch intelligence", activeBuild: "Active build", continue: "Continue",
    open: "Open", score: "Build score", rank: "Current rank", movement: "7-day movement", changes: "Patch signals",
    updated: "Snapshot updated", database: "Live snapshot",
  },
  ru: {
    explore: "Открыть базу", compare: "Перейти к сравнению", follow: "Отслеживать мир", followed: "Мир отслеживается",
    personalSignal: "Персональный сигнал", commandDeck: "Командная палуба", commandHint: "Живые инструменты вокруг вашего текущего фокуса.",
    modules: "Системы разведки", modulesHint: "От сигнала к решению — без потери игрового контекста.",
    metaSignal: "Сигнал меты", patchIntel: "Патч-разведка", activeBuild: "Активный билд", continue: "Продолжить",
    open: "Открыть", score: "Оценка билда", rank: "Текущий ранг", movement: "Движение за 7 дней", changes: "Сигналы патча",
    updated: "Снимок обновлён", database: "Живой снимок",
  },
} satisfies Record<Lang, Omit<GameHubDefinition["copy"], "eyebrow" | "tagline" | "description">>;

const seeds: Record<PlatformGameId, DefinitionSeed> = {
  wow: {
    id: "wow", slug: "wow", name: "World of Warcraft", iconUrl: "/platform/icons/wow.svg",
    accent: "#50b9e8", accentSoft: "#d9b56f", signalLabel: "AZEROTH // LIVE",
    copy: {
      en: { ...sharedCopy.en, eyebrow: "TACTICAL INDEX · THE WAR WITHIN", tagline: "Own the meta before the first pull.", description: "Mythic+, raid and specialization intelligence distilled into one live command view." },
      ru: { ...sharedCopy.ru, eyebrow: "ТАКТИЧЕСКИЙ ИНДЕКС · THE WAR WITHIN", tagline: "Владей метой до первого пула.", description: "Mythic+, рейды и специализации, собранные в единую живую командную картину." },
    },
    modules: {
      en: [
        { icon: "radar", title: "Specialization Intel", description: "Ranks, builds and encounter context.", badge: "LIVE", href: "/search?game=wow&type=characters" },
        { icon: "route", title: "Mythic+ Planner", description: "Routes, affixes and weekly priorities.", badge: "TACTICAL", href: "/search?game=wow&q=Mythic" },
        { icon: "swords", title: "Gear Optimizer", description: "Compare items inside the WoW catalog.", badge: "DATABASE", href: "/compare?game=wow&kind=items" },
        { icon: "target", title: "Rotation Lab", description: "Model priorities, Rage flow and cooldown alignment.", badge: "MVP", href: "/wow/rotation/fury-warrior" },
      ],
      ru: [
        { icon: "radar", title: "Разведка специализаций", description: "Ранги, билды и контекст энкаунтеров.", badge: "LIVE", href: "/search?game=wow&type=characters" },
        { icon: "route", title: "Планировщик Mythic+", description: "Маршруты, аффиксы и приоритеты недели.", badge: "ТАКТИКА", href: "/search?game=wow&q=Mythic" },
        { icon: "swords", title: "Оптимизатор экипировки", description: "Сравнение предметов внутри базы WoW.", badge: "БАЗА", href: "/compare?game=wow&kind=items" },
        { icon: "target", title: "Лаборатория ротации", description: "Приоритеты, Rage и синхронизация кулдаунов.", badge: "MVP", href: "/ru/wow/rotation/fury-warrior" },
      ],
    },
  },
  genshin: {
    id: "genshin", slug: "genshin", name: "Genshin Impact", iconUrl: "/platform/icons/genshin.svg",
    accent: "#dc79d8", accentSoft: "#78d7df", signalLabel: "TEYVAT // RESONANCE",
    copy: {
      en: { ...sharedCopy.en, eyebrow: "RESONANCE NETWORK · VERSION 4.7", tagline: "Shape the perfect rotation before the first strike.", description: "Characters, artifacts, teams and Abyss decisions connected through one elemental signal." },
      ru: { ...sharedCopy.ru, eyebrow: "СЕТЬ РЕЗОНАНСА · VERSION 4.7", tagline: "Собери идеальную ротацию до первого удара.", description: "Персонажи, артефакты, команды и Бездна, связанные единым элементальным сигналом." },
    },
    modules: {
      en: [
        { icon: "sparkles", title: "Character Intelligence", description: "Usage, teams and rotation context.", badge: "LIVE", href: "/search?game=genshin&type=characters" },
        { icon: "route", title: "Abyss Planner", description: "Build two teams around the current floor.", badge: "FLOOR 12", href: "/profile/arcanist" },
        { icon: "database", title: "Artifact Optimizer", description: "Compare sets from the Genshin database.", badge: "DATABASE", href: "/compare?game=genshin&kind=artifact-sets" },
        { icon: "target", title: "Weapon Matrix", description: "Inspect weapons against your active carry.", badge: "PRECISE", href: "/compare?game=genshin&kind=weapons" },
      ],
      ru: [
        { icon: "sparkles", title: "Разведка персонажей", description: "Использование, команды и ротации.", badge: "LIVE", href: "/search?game=genshin&type=characters" },
        { icon: "route", title: "Планировщик Бездны", description: "Две команды под текущий этаж.", badge: "ЭТАЖ 12", href: "/profile/arcanist" },
        { icon: "database", title: "Оптимизатор артефактов", description: "Сравнение сетов из базы Genshin.", badge: "БАЗА", href: "/compare?game=genshin&kind=artifact-sets" },
        { icon: "target", title: "Матрица оружия", description: "Оружие относительно активного керри.", badge: "ТОЧНО", href: "/compare?game=genshin&kind=weapons" },
      ],
    },
  },
  diablo: {
    id: "diablo", slug: "diablo", name: "Diablo IV", iconUrl: "/platform/icons/diablo.svg",
    accent: "#ff4938", accentSoft: "#d79a48", signalLabel: "SANCTUARY // HELLTIDE",
    copy: {
      en: { ...sharedCopy.en, explore: "Open season feed", compare: "Open active build", eyebrow: "SANCTUARY INDEX · SEASON 10", tagline: "Turn seasonal chaos into a precise build.", description: "Endgame builds, Pit pressure and loot signals organized for the next push." },
      ru: { ...sharedCopy.ru, explore: "Открыть сезон", compare: "Открыть активный билд", eyebrow: "ИНДЕКС САНКТУАРИЯ · SEASON 10", tagline: "Преврати хаос сезона в точный билд.", description: "Эндгейм-билды, давление Ямы и сигналы лута, собранные для следующего рывка." },
    },
    modules: {
      en: [
        { icon: "swords", title: "Build Intelligence", description: "Read the active build and its pressure points.", badge: "PREVIEW", href: "/profile/arcanist" },
        { icon: "database", title: "Loot Intelligence", description: "Track item and aspect signals as they publish.", badge: "SOON", href: "/patches" },
        { icon: "chart", title: "Pit Rankings", description: "Follow tier movement across the endgame meta.", badge: "TIER 118", href: "/search?q=Pit" },
        { icon: "radar", title: "Season Tracker", description: "Every buff, nerf and live seasonal shift.", badge: "LIVE", href: "/patches" },
      ],
      ru: [
        { icon: "swords", title: "Разведка билдов", description: "Активный билд и его точки давления.", badge: "ПРЕВЬЮ", href: "/profile/arcanist" },
        { icon: "database", title: "Разведка лута", description: "Предметы и аспекты по мере публикации.", badge: "СКОРО", href: "/patches" },
        { icon: "chart", title: "Рейтинги Ямы", description: "Движение тиров в эндгейм-мете.", badge: "ТИР 118", href: "/search?q=Pit" },
        { icon: "radar", title: "Трекер сезона", description: "Усиления, нерфы и сдвиги сезона.", badge: "LIVE", href: "/patches" },
      ],
    },
  },
  league: {
    id: "league", slug: "league-of-legends", name: "League of Legends", iconUrl: "/platform/icons/league.svg",
    accent: "#e4a13c", accentSoft: "#48bad1", signalLabel: "RIFT // LIVE QUEUE",
    copy: {
      en: { ...sharedCopy.en, eyebrow: "RIFT INTELLIGENCE · PATCH 14.10", tagline: "See the winning line before the minions arrive.", description: "Champions, matchups, builds and live patch movement fused into one ranked command view." },
      ru: { ...sharedCopy.ru, eyebrow: "РАЗВЕДКА УЩЕЛЬЯ · PATCH 14.10", tagline: "Увидь победную линию до выхода миньонов.", description: "Чемпионы, матчапы, билды и движения патча в едином рейтинговом командном центре." },
    },
    modules: {
      en: [
        { icon: "radar", title: "Champion Intelligence", description: "Roles, counters and current performance.", badge: "LIVE", href: "/search?game=league&type=characters" },
        { icon: "target", title: "Matchup Lab", description: "Build a lane plan around the enemy pick.", badge: "RANKED", href: "/search?game=league&q=Ahri" },
        { icon: "swords", title: "Item Matrix", description: "Compare item value inside the League catalog.", badge: "DATABASE", href: "/compare?game=league&kind=items" },
        { icon: "chart", title: "Patch Meta Shift", description: "Track role movement before you queue.", badge: "UPDATED", href: "/patches" },
      ],
      ru: [
        { icon: "radar", title: "Разведка чемпионов", description: "Роли, контрпики и текущая форма.", badge: "LIVE", href: "/search?game=league&type=characters" },
        { icon: "target", title: "Лаборатория матчапов", description: "План линии относительно вражеского пика.", badge: "РАНКЕД", href: "/search?game=league&q=Ahri" },
        { icon: "swords", title: "Матрица предметов", description: "Сравнение ценности предметов League.", badge: "БАЗА", href: "/compare?game=league&kind=items" },
        { icon: "chart", title: "Сдвиг патч-меты", description: "Движение ролей до входа в очередь.", badge: "ОБНОВЛЕНО", href: "/patches" },
      ],
    },
  },
};

export function getGameHubDefinition(id: PlatformGameId, lang: Lang): GameHubDefinition {
  const seed = seeds[id];
  return { ...seed, copy: seed.copy[lang], modules: seed.modules[lang] };
}

export function gameHubHref(id: PlatformGameId, lang: Lang) {
  const prefix = lang === "ru" ? "/ru" : "";
  return `${prefix}/${seeds[id].slug}`;
}

export const gameHubIds: PlatformGameId[] = ["wow", "genshin", "diablo", "league"];
