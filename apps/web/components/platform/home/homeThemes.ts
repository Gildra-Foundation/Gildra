export const homeThemes = [
  { id: "arthas", ru: "Артас", en: "Arthas", descriptionRu: "Ледяной клинок · снег", descriptionEn: "Frozen blade · snow", art: "icecrown-home-background-v1.webp" },
  { id: "illidan", ru: "Иллидан", en: "Illidan", descriptionRu: "Парные глефы · скверна", descriptionEn: "Twin glaives · fel", art: "illidan-home-background-v1.webp" },
  { id: "garek", ru: "Гарек", en: "Garek", descriptionRu: "Меч со Светом · души", descriptionEn: "Sword of Light · souls", art: "garek-home-background-v1.webp" },
  { id: "varok", ru: "Варок", en: "Varok", descriptionRu: "Боевой топор · искры", descriptionEn: "Battle axe · embers", art: "varok-home-background-v2.webp" },
] as const;

export type HomeThemeId = (typeof homeThemes)[number]["id"];
export const homeThemeCookie = "gildra-home-theme";
export function isHomeTheme(value: unknown): value is HomeThemeId {
  return homeThemes.some(theme => theme.id === value);
}
