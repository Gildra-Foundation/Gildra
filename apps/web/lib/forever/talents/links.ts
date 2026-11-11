/** Numeric client media IDs; never fall back to Retail spell media. */
export const foreverTalentIcon = (fileId: number) => `/assets/wow/forever/talents/icons/${fileId}.webp`;

/** DATA track record-link contract, intentionally pinned to the Forever edition. */
export const foreverTalentSpellPath = (lang: "en" | "ru", spellId: number) =>
  `${lang === "ru" ? "/ru" : ""}/wow/forever/library/spell/${spellId}`;

export const foreverCalculatorPath = (lang: "en" | "ru", slug?: string) =>
  `${lang === "ru" ? "/ru" : ""}/wow/forever/talent-calc${slug ? `/${slug}` : ""}`;
