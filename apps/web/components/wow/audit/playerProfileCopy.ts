import type { RaidDifficulty } from "@/lib/wow/playerProfileView";

/** Text of the public player profile (/wow/players/…), both languages with the same keys. */
const ru = {
  breadcrumbs: "Навигационная цепочка",
  summary: "Сводка персонажа",
  level: "Уровень",
  itemLevel: "Уровень предметов",
  rating: "Рейтинг M+",
  talents: "Таланты",
  copyBuild: "Скопировать билд",
  copied: "Скопировано",
  openCalculator: "Открыть в калькуляторе",
  mythicPlus: "Mythic+",
  raids: "Рейды",
  upgrades: (count: number) => count === 0 ? "не в таймер" : `улучшение ключа +${count}`,
  depleted: "не в таймер",
  points: "очков",
  openRun: (dungeon: string, level: number) => `Забег +${level}, ${dungeon}`,
  difficulty: { LFR: "Поиск", NORMAL: "Обычный", HEROIC: "Героический", MYTHIC: "Эпохальный" } satisfies Record<RaidDifficulty, string>,
  difficultyShort: { LFR: "П", NORMAL: "О", HEROIC: "Г", MYTHIC: "Э" } satisfies Record<RaidDifficulty, string>,
  armory: "Оружейная",
  raiderIo: "Профиль Raider.IO",
  unavailableTitle: "Профиль сейчас не загрузился",
  unavailable: "Blizzard не ответил вовремя. Попробуйте через минуту.",
  retry: "Повторить",
  back: "К рейтингу игроков",
  metaTitle: (name: string, realm: string) => `${name} — ${realm} — WowArcana`,
  metaDescription: (name: string, spec: string, ilvl: number, rating?: number) => `${name}: ${spec}, уровень предметов ${ilvl}${rating ? `, рейтинг M+ ${rating}` : ""}. Экипировка, таланты, лучшие ключи и рейды.`,
};

type Copy = typeof ru;

const en: Copy = {
  breadcrumbs: "Breadcrumbs",
  summary: "Character summary",
  level: "Level",
  itemLevel: "Item level",
  rating: "M+ rating",
  talents: "Talents",
  copyBuild: "Copy build",
  copied: "Copied",
  openCalculator: "Open in calculator",
  mythicPlus: "Mythic+",
  raids: "Raids",
  upgrades: (count: number) => count === 0 ? "over time" : `keystone upgrade +${count}`,
  depleted: "over time",
  points: "points",
  openRun: (dungeon: string, level: number) => `+${level} ${dungeon} run`,
  difficulty: { LFR: "Raid Finder", NORMAL: "Normal", HEROIC: "Heroic", MYTHIC: "Mythic" },
  difficultyShort: { LFR: "LFR", NORMAL: "N", HEROIC: "H", MYTHIC: "M" },
  armory: "Armory",
  raiderIo: "Raider.IO profile",
  unavailableTitle: "The profile did not load",
  unavailable: "Blizzard did not answer in time. Try again in a minute.",
  retry: "Try again",
  back: "Player leaderboard",
  metaTitle: (name: string, realm: string) => `${name} — ${realm} — WowArcana`,
  metaDescription: (name: string, spec: string, ilvl: number, rating?: number) => `${name}: ${spec}, item level ${ilvl}${rating ? `, M+ rating ${rating}` : ""}. Equipment, talents, best keys and raids.`,
};

export const playerProfileCopy = { ru, en } as const;
export type PlayerProfileCopy = Copy;
