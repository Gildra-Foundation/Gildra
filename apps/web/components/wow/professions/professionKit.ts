import type { CSSProperties } from "react";

/** The section's painted kit (slim Library kit: gold rails and frames). Plain module so server and client both read the string. */
export const PROFESSION_KIT = "library" as const;

/**
 * Accent of each profession, taken from its in-game icon (alchemy's violet flask, blacksmithing's forge fire …):
 * card glow, icon halo and the hero tint. Data colour of the entity, never the shell.
 */
export const PROFESSION_ACCENTS: Record<string, string> = {
  alchemy: "#b07ce0", blacksmithing: "#e08a4a", enchanting: "#8f8cf0", engineering: "#6fb6dc", inscription: "#d6b46a",
  jewelcrafting: "#e0667a", leatherworking: "#c49064", tailoring: "#d0a86c", herbalism: "#8cc86a", mining: "#a8b0bc",
  skinning: "#c8794e", cooking: "#e0b04c", fishing: "#5cc0c8",
};

export const professionAccentStyle = (slug: string) =>
  ({ "--profession-accent": PROFESSION_ACCENTS[slug] ?? "var(--atlas-accent)" }) as CSSProperties;

/** The game's colours of a recipe's difficulty: orange — a point every craft, yellow — often, green — rarely, grey — never. */
export const DIFFICULTY_STYLE = {
  "--difficulty-orange": "#ff8040", "--difficulty-yellow": "#ffd940", "--difficulty-green": "#40bf40", "--difficulty-grey": "#8c8c8c",
} as CSSProperties;
