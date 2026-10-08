import type { Lang } from "@/lib/i18n";
import type { HomeThemeId } from "./homeThemes";
import { arthasBackground, arthasLeadIn, arthasScenes } from "./arthasScene";
import { illidanBackground, illidanLeadIn, illidanScenes } from "./illidanScene";

export type HomeCinematicScene = {
  key: string;
  src: string;
  background: string;
  leadIn: number;
  voiceDuration: number;
  quoteEnd: number;
  words: { start: number; end: number }[];
  author: string;
};

// Stable scene objects let the sound, handwriting, and font readiness share
// the same identity when switching heroes or languages.
const scenes = {
  arthas: {
    ru: { ...arthasScenes.ru, key: "arthas:ru", background: arthasBackground, leadIn: arthasLeadIn, author: "Артас Менетил" },
    en: { ...arthasScenes.en, key: "arthas:en", background: arthasBackground, leadIn: arthasLeadIn, author: "Arthas Menethil" },
  },
  illidan: {
    ru: { ...illidanScenes.ru, key: "illidan:ru", background: illidanBackground, leadIn: illidanLeadIn, author: "Иллидан Ярость Бури" },
    en: { ...illidanScenes.en, key: "illidan:en", background: illidanBackground, leadIn: illidanLeadIn, author: "Illidan Stormrage" },
  },
} satisfies Record<"arthas" | "illidan", Record<Lang, HomeCinematicScene>>;

export function getHomeCinematicScene(theme: HomeThemeId, lang: Lang): HomeCinematicScene | null {
  return theme === "arthas" || theme === "illidan" ? scenes[theme][lang] : null;
}
