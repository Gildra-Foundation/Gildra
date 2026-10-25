import type { RaidHubSlug } from "./raidHubData";

/** Presentation colours only; identities and encounters stay in raidHubData. */
export const raidCardThemes: Record<RaidHubSlug, { accent: string; atmosphere: string }> = {
  "venomous-abyss": { accent: "#74c8a8", atmosphere: "jade" },
  "the-voidspire": { accent: "#b39ade", atmosphere: "void" },
  "the-dreamrift": { accent: "#8fc8a6", atmosphere: "dream" },
  "march-on-queldanas": { accent: "#e1bd73", atmosphere: "sun" },
  sporefall: { accent: "#caa078", atmosphere: "spore" },
};
