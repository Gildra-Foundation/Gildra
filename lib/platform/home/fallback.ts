import type { Lang } from "@/lib/i18n";
import type { PlatformHomeData } from "./types";

const games = [
  { id: "wow", name: "World of Warcraft", subtitle: "The War Within", href: "/wow", accent: "#50b9e8", iconUrl: "/platform/icons/wow.svg" },
  { id: "genshin", name: "Genshin Impact", subtitle: "Version 4.7", href: "/genshin", accent: "#db75d5", iconUrl: "/platform/icons/genshin.svg" },
  { id: "diablo", name: "Diablo IV", subtitle: "Season 10", href: "/diablo", accent: "#ff3928", iconUrl: "/platform/icons/diablo.svg" },
  { id: "league", name: "League of Legends", subtitle: "Patch 14.10", href: "/league-of-legends", accent: "#e6a13d", iconUrl: "/platform/icons/league.svg" },
] as const;

const shared = {
  profile: { name: "Arcanist" },
  games: [...games],
  personalMeta: [
    { id: "wow-fury", gameId: "wow", mode: "Mythic+", focus: "Fury Warrior", focusDetail: "DPS · Melee", focusIconUrl: "/assets/specs/fury-warrior.jpg", rankLabel: "Mythic+ Score", rankValue: "2,465", rankNote: "Top 3.2%", score: "96.4", scoreLabel: "Build Score", trend: [22, 39, 51, 43, 54, 68, 49, 64, 58, 76], change: "+2.1", changeNote: "vs 7d ago", changeTone: "positive", href: "/talents/fury-warrior" },
    { id: "genshin-raiden", gameId: "genshin", mode: "Abyss", focus: "Raiden Shogun", focusDetail: "Electro · Polearm", focusIconUrl: "/platform/home/raiden.png", rankLabel: "Abyss Usage", rankValue: "84.6%", rankNote: "Top 1.4%", score: "92.7", scoreLabel: "Meta Score", trend: [24, 43, 56, 47, 61, 72, 58, 69, 65, 82], change: "+3.7%", changeNote: "vs 7d ago", changeTone: "positive", href: "/genshin/characters/raiden-shogun" },
    { id: "diablo-quill", gameId: "diablo", mode: "Endgame", focus: "Quill Volley", focusDetail: "Spiritborn", focusIconUrl: "/platform/home/spiritborn.png", rankLabel: "Pit Tier", rankValue: "118", rankNote: "Top 4.7%", score: "96.4", scoreLabel: "Build Score", trend: [21, 36, 43, 55, 48, 51, 59, 63, 69, 78], change: "+1", changeNote: "vs 7d ago", changeTone: "positive", href: "/diablo" },
    { id: "league-ahri", gameId: "league", mode: "Ranked Solo", focus: "Ahri", focusDetail: "Mid", focusIconUrl: "/platform/home/ahri.png", rankLabel: "Rank", rankValue: "Master", rankNote: "LP: 127", score: "88.1", scoreLabel: "Performance", trend: [31, 55, 48, 63, 47, 69, 65, 70, 61, 78], change: "+12 LP", changeNote: "vs 7d ago", changeTone: "positive", href: "/league-of-legends/champions/ahri" },
  ],
  continueItems: [
    { id: "raiden-abyss", gameId: "genshin", title: "Raiden Shogun", subtitle: "Lv. 90", detail: "Electro · Polearm", activity: "Spiral Abyss", activityDetail: "Floor 12 · Chamber 3", progress: 72, imageUrl: "/platform/home/raiden.png", href: "/genshin/characters/raiden-shogun" },
    { id: "fury-mythic", gameId: "wow", title: "Fury Warrior", subtitle: "Lv. 70", detail: "Fury", activity: "Mythic+", activityDetail: "Ruby Life Pools +12", progress: 65, imageUrl: "/platform/home/fury.png", href: "/wow/mythic-plus" },
    { id: "ahri-ranked", gameId: "league", title: "Ahri", subtitle: "Lv. 13", detail: "Mid Lane", activity: "Ranked Solo", activityDetail: "Master · 127 LP", progress: 58, imageUrl: "/platform/home/ahri.png", href: "/league-of-legends/champions/ahri" },
    { id: "spiritborn-pit", gameId: "diablo", title: "Spiritborn", subtitle: "Paragon 210", detail: "Quill Volley", activity: "The Pit", activityDetail: "Tier 118", progress: 81, imageUrl: "/platform/home/spiritborn.png", href: "/diablo" },
  ],
  savedBuilds: [
    { id: "quill-speedfarm", gameId: "diablo", title: "Quill Volley Speedfarm", subtitle: "D4 · Spiritborn", updatedAt: "2h ago", imageUrl: "/platform/home/spiritborn.png", href: "/diablo" },
    { id: "raiden-national", gameId: "genshin", title: "Raiden National", subtitle: "GI · Spiral Abyss", updatedAt: "5h ago", imageUrl: "/platform/home/raiden.png", href: "/genshin/characters/raiden-shogun" },
    { id: "fury-m-plus", gameId: "wow", title: "Fury Warrior M+", subtitle: "WoW · Mythic+", updatedAt: "1d ago", imageUrl: "/assets/specs/fury-warrior.jpg", href: "/talents/fury-warrior" },
    { id: "ahri-control", gameId: "league", title: "Ahri Control Mage", subtitle: "LoL · Mid Lane", updatedAt: "2d ago", imageUrl: "/platform/home/ahri.png", href: "/league-of-legends/champions/ahri" },
  ],
  patchPulse: [
    { gameId: "wow", gameName: "World of Warcraft", changes: [{ text: "Fury Warrior damage increased in Mythic+ dungeons.", kind: "buff" }, { text: "Fortified affix returning next week.", kind: "update" }] },
    { gameId: "genshin", gameName: "Genshin Impact", changes: [{ text: "Spiral Abyss 4.7 resets in 3 days.", kind: "update" }, { text: "Clorinde and Sigewinne banners live.", kind: "update" }] },
    { gameId: "diablo", gameName: "Diablo IV", changes: [{ text: "Bash Barbarian aspect damage reduced.", kind: "nerf" }, { text: "Pit Leaderboards Season 10 now live.", kind: "buff" }] },
    { gameId: "league", gameName: "League of Legends", changes: [{ text: "Ahri base HP increased.", kind: "buff" }, { text: "Lissandra mid lane win rate rising.", kind: "update" }] },
  ],
  quickActions: [
    { id: "compare", label: "Compare Builds", icon: "compare", href: "/compare" },
    { id: "snapshot", label: "Meta Snapshot", icon: "chart", href: "/analytics" },
    { id: "team", label: "Team Planner", icon: "team", href: "/genshin" },
    { id: "notes", label: "Patch Notes", icon: "notes", href: "/patches" },
    { id: "alerts", label: "Alerts", icon: "alerts", href: "/profile/arcanist" },
  ],
  recommendations: [
    { id: "fury-guide", gameId: "wow", eyebrow: "Guide", title: "Fury Warrior: Mythic+ Guide", description: "Optimized build, rotations, and gear for Mythic+ and raids.", imageUrl: "/platform/home/recommend-fury.png", href: "/talents/fury-warrior" },
    { id: "raiden-rotation", gameId: "genshin", eyebrow: "Video", title: "Raiden Shogun Abyss Rotation", description: "Master burst windows and energy management.", imageUrl: "/platform/home/recommend-raiden.png", href: "/genshin/characters/raiden-shogun" },
    { id: "pit-analysis", gameId: "diablo", eyebrow: "Analysis", title: "Season 10 Pit Tier Breakdown", description: "See how builds are performing on the Season 10 leaderboards.", imageUrl: "/platform/home/recommend-diablo.png", href: "/diablo", featured: true },
    { id: "ahri-matchup", gameId: "league", eyebrow: "Matchup", title: "Ahri vs Control Mages", description: "Matchup insights and win conditions for ranked play.", imageUrl: "/platform/home/recommend-ahri.png", href: "/league-of-legends/champions/ahri" },
  ],
  updatedAt: "2026-09-04T00:00:00Z",
} satisfies Omit<PlatformHomeData, "greeting" | "title" | "labels">;

export function fallbackPlatformHome(lang: Lang): PlatformHomeData {
  if (lang === "ru") {
    return {
      ...shared,
      greeting: "Добрый вечер, Arcanist",
      title: "Ваши миры. Единый командный центр.",
      labels: {
        nav: { home: "Главная", search: "Поиск", patchCenter: "Центр патчей", comparisonLab: "Сравнение" },
        searchPlaceholder: "Поиск по Gildra...",
        personalMeta: "Персональная мета",
        personalMetaColumns: ["Игра", "Основной фокус", "Ранг / Тир", "Счёт", "Тренд (7д)", "Изменение"],
        viewInsights: "Все инсайты",
        continueTitle: "Продолжить с места остановки",
        manage: "Управление",
        resume: "Продолжить",
        savedBuilds: "Сохранённые билды",
        viewAll: "Смотреть все",
        goToBuilds: "К билдам",
        patchPulse: "Пульс патчей",
        quickActions: "Быстрые действия",
        recommended: "Рекомендуем вам",
      },
    };
  }
  return {
    ...shared,
    greeting: "Good evening, Arcanist",
    title: "Your worlds. One command center.",
    labels: {
      nav: { home: "Home", search: "Search", patchCenter: "Patch Center", comparisonLab: "Comparison Lab" },
      searchPlaceholder: "Search Gildra...",
      personalMeta: "Personal Meta",
      personalMetaColumns: ["Game", "Main Focus", "Rank / Tier", "Score", "Trend (7d)", "Change"],
      viewInsights: "View All Insights",
      continueTitle: "Continue where you left off",
      manage: "Manage",
      resume: "Resume",
      savedBuilds: "Saved Builds",
      viewAll: "View all",
      goToBuilds: "Go to Builds",
      patchPulse: "Patch Pulse",
      quickActions: "Quick Actions",
      recommended: "Recommended for you",
    },
  };
}

/**
 * Public fail-closed state. It intentionally contains no synthetic profile,
 * progression, rankings, patch claims, or recommendations.
 */
export function unavailablePlatformHome(lang: Lang): PlatformHomeData {
  const localized = fallbackPlatformHome(lang);
  const unavailable = lang === "ru" ? "Данные временно недоступны" : "Data temporarily unavailable";
  return {
    profile: { name: "Gildra" },
    greeting: lang === "ru" ? "World of Warcraft" : "World of Warcraft",
    title: lang === "ru"
      ? "Проверенные данные временно недоступны. Повторите попытку позже."
      : "Verified data is temporarily unavailable. Please try again later.",
    games: games.map((game) => ({ ...game, subtitle: unavailable })),
    personalMeta: [],
    continueItems: [],
    savedBuilds: [],
    patchPulse: [],
    quickActions: [],
    recommendations: [],
    labels: localized.labels,
    updatedAt: new Date(0).toISOString(),
  };
}
