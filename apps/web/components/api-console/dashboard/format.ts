import type { DatasetListItem, WowGGTierlistEntry } from "../types";

export function catalogImportLabel(entityTypes: string[]) {
  if (!entityTypes.length) return "Каталог World of Warcraft";
  const labels: Record<string, string> = { item: "Предметы", spell: "Заклинания", creature: "Существа и NPC", quest: "Квесты", talent: "Таланты", pvp_talent: "PvP-таланты", profession: "Профессии", mount: "Транспорт", battle_pet: "Боевые питомцы", class: "Классы", specialization: "Специализации", achievement: "Достижения", item_set: "Наборы предметов", instance: "Подземелья и рейды", encounter: "Сражения", faction: "Фракции" };
  return entityTypes.map((type) => labels[type] ?? type).join(", ");
}


export type WowGGOption = readonly [string, string];

export function uniqueOptions(options: WowGGOption[]): WowGGOption[] {
  return Array.from(new Map(options.map((option) => [option[0], option])).values());
}

export function wowGGRoleLabel(role: string) { return role === "healer" ? "Лекарь" : role === "tank" ? "Танк" : role === "dungeon_ease" ? "Простота подземелий" : "DPS"; }
export function wowGGKeyLabel(value: string) { return value === "high" ? "16+" : value === "middle" ? "13–16" : value === "low" ? "2–12" : "Все ключи"; }
export function wowGGRaidLabel(value: string) { const labels: Record<string, string> = { raid_myth: "Эпохальный", raid_hero: "Героический", raid_normal: "Обычный", raid_n10: "Обычный 10", raid_n25: "Обычный 25", raid_h10: "Героический 10", raid_h25: "Героический 25" }; return labels[value] ?? value; }
export function wowGGPVPLabel(value: string) { const labels: Record<string, string> = { "2v2": "2x2", "3v3": "3x3", "5v5": "5x5", rbg: "Рейтинговые поля боя", shuffle: "Соло-суматоха", blitz: "Блиц" }; return labels[value] ?? value; }
export function wowGGMetrics(mode: string, role: string): WowGGOption[] {
  if (role === "dungeon_ease") return [["maxKey", "Максимальный ключ"]];
  if (mode === "pvp") return [["players", "Популярность"], ["avgRating", "Средний рейтинг"], ["maxRating", "Максимальный рейтинг"]];
  const metrics: WowGGOption[] = mode === "mythic_plus" ? [["score", "Рейтинг"]] : [];
  metrics.push(["popularity", "Популярность"], ["avgDps", "Средний урон"]);
  if (role === "healer") metrics.push(["avgHps", "Средний HPS"], ["maxHps", "Максимальный HPS"]);
  else metrics.push(["maxDps", "Максимальный урон"]);
  return metrics;
}

export function wowGGMetricValue(entry: WowGGTierlistEntry, metric: string): number | null {
  if (metric === "score") return entry.metaScore;
  if (metric === "avgDps") return entry.averageDps;
  if (metric === "avgHps") return entry.averageHps;
  if (metric === "maxDps" || metric === "maxHps") return entry.topValue;
  if (metric === "popularity") return entry.popularity;
  if (metric === "players") return entry.pvpPlayers;
  if (metric === "avgRating") return entry.pvpAverageRating;
  if (metric === "maxRating") return entry.pvpMaxRating;
  if (metric === "maxKey") return entry.maxKey;
  return entry.metricValues[metric] ?? null;
}

export function bestMetric(entries: WowGGTierlistEntry[], specSlug: string | null, field: "metaScore" | "maxKey" | "averageDps" | "pvpMaxRating") {
  const values = entries.filter((entry) => entry.specSlug === specSlug).map((entry) => entry[field]).filter((value): value is number => value != null);
  return values.length ? Math.max(...values) : null;
}

export function tierStyle(tier: string) { if (!tier) return "border-[#3a414f] bg-[#151923] text-[#737e92]"; if (tier.startsWith("S")) return "border-[#7b532a] bg-[#321c0c] text-[#f09337]"; if (tier.startsWith("A")) return "border-[#613c7f] bg-[#251331] text-[#b467ed]"; if (tier.startsWith("B")) return "border-[#2b5691] bg-[#101f38] text-[#5b9bf4]"; return "border-[#3e6133] bg-[#142411] text-[#76c25e]"; }
export function formatMetricNumber(value: number | null) { return value == null ? "—" : Math.round(value).toLocaleString("en-US"); }
export function metricLabel(metric: string, role: string) { if (metric === "score") return "M+ рейтинг"; if (metric === "popularity") return "Популярность"; if (metric === "survivability") return "Выживаемость"; return role === "healer" ? "HPS" : "DPS"; }
export function difficultyLabel(difficulty: string) { if (difficulty === "10") return "+10"; return difficulty.slice(0, 1).toUpperCase() + difficulty.slice(1); }
export function formatDate(value: string | null) { return value ? new Date(value).toLocaleString("en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"; }
export function relativeTime(value: string | null) { if (!value) return "No data"; const diff = Date.now() - new Date(value).getTime(); const hours = Math.floor(diff / 3_600_000); if (hours < 1) return "Recently"; if (hours < 24) return `${hours} hours ago`; return `${Math.floor(hours / 24)} days ago`; }
export function freshnessHint(dataset: DatasetListItem) { if (dataset.freshness === "fresh") return `Свежие до ${formatDate(dataset.freshUntil)}`; if (dataset.freshness === "stale") return `Просрочены с ${formatDate(dataset.freshUntil)}`; return "Успешных обновлений ещё не было"; }
export function formatInterval(seconds: number) { if (seconds % 86_400 === 0) return `${seconds / 86_400} days`; if (seconds % 3_600 === 0) return `${seconds / 3_600} hours`; return `${Math.max(1, Math.round(seconds / 60))} min.`; }
export function activityLabel(activity: string) { return activity === "mythic_plus" ? "Mythic+" : "Рейд"; }
export function icyVeinsActivityLabel(activity: string) { return activity === "mythic_plus" ? "Mythic+" : activity === "pvp" ? "PvP" : "Рейд"; }
export function roleLabel(role: string) { return role === "healer" ? "Лекарь" : role === "tank" ? "Танк" : "DPS"; }
