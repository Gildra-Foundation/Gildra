import type { CSSProperties } from "react";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";

export type RotationAbilityVisual = {
  core: string;
  hot: string;
  glow: string;
  glyph: string;
  material: "blood" | "steel" | "fire" | "storm" | "warcry";
};

const furyAbilityVisuals: Record<string, RotationAbilityVisual> = {
  rampage: { core: "190 39 24", hot: "255 105 48", glow: "255 174 74", material: "fire", glyph: "M22 9 15 23l8-3-4 15 13-19-9 3 5-10z" },
  bloodthirst: { core: "147 16 23", hot: "255 61 56", glow: "255 132 84", material: "blood", glyph: "M24 8c-3 6-9 12-9 18a9 9 0 0 0 18 0c0-6-6-12-9-18z" },
  "raging-blow": { core: "166 54 27", hot: "255 126 48", glow: "255 203 112", material: "steel", glyph: "M13 10l10 10m12-10L25 20M20 23l-8 13m16-13 8 13" },
  execute: { core: "126 14 20", hot: "244 42 39", glow: "255 124 74", material: "blood", glyph: "M14 11l20 25M34 11 14 36M11 14l6-4m14 4 6-4" },
  "odyns-fury": { core: "193 78 20", hot: "255 151 43", glow: "255 222 121", material: "storm", glyph: "M27 7 15 25h8l-3 16 13-21h-8z" },
  whirlwind: { core: "91 106 118", hot: "194 211 220", glow: "255 255 245", material: "steel", glyph: "M11 23c6-10 22-10 27-1M14 31c7 5 19 3 23-5M19 16c4-3 11-3 15 1" },
  recklessness: { core: "190 35 22", hot: "255 86 38", glow: "255 193 88", material: "fire", glyph: "M24 7l5 12 12 5-12 5-5 12-5-12-12-5 12-5z" },
  avatar: { core: "125 88 52", hot: "220 169 92", glow: "255 229 158", material: "steel", glyph: "M13 37l3-19 8-9 8 9 3 19-11-5z" },
  bladestorm: { core: "112 87 74", hot: "232 202 173", glow: "255 242 214", material: "steel", glyph: "M10 27c6-13 20-18 29-9M12 35c11 2 22-5 27-15M15 16l24 20" },
  bloodlust: { core: "132 26 31", hot: "244 73 51", glow: "255 173 94", material: "warcry", glyph: "M12 32c7-2 8-9 12-19 4 12 6 18 13 20M17 35l7-7 7 7" },
};

const fallback: RotationAbilityVisual = {
  core: "176 54 28",
  hot: "255 112 54",
  glow: "255 194 105",
  material: "fire",
  glyph: "M24 8l5 11 11 5-11 5-5 11-5-11-11-5 11-5z",
};

const genericGlyphs = [
  "M24 8l5 11 11 5-11 5-5 11-5-11-11-5 11-5z",
  "M12 34l8-20 5 11 11-13-7 22-8-7z",
  "M11 25c7-12 20-15 28-5M13 34c10 1 20-5 25-15",
  "M24 7v34M8 24h32M13 13l22 22M35 13 13 35",
  "M14 36c2-14 6-22 10-27 5 7 9 16 10 27-7-4-13-4-20 0z",
  "M10 29c8-2 10-9 14-19 4 10 7 17 14 19-9 8-19 8-28 0z",
] as const;

function hashAbility(value: string) {
  let hash = 0;
  for (const character of value) hash = (hash * 33 + character.charCodeAt(0)) >>> 0;
  return hash;
}

export function rotationAbilityVisual(abilityId: string, spec: string): RotationAbilityVisual {
  if (spec === "fury-warrior") return furyAbilityVisuals[abilityId] ?? fallback;
  const theme = getTalentSpecTheme(spec);
  if (!theme) return fallback;
  const hash = hashAbility(abilityId);
  const materials: RotationAbilityVisual["material"][] = theme.motif === "blood" || theme.motif === "plague" || theme.motif === "decay"
    ? ["blood", "fire", "warcry"]
    : theme.motif === "frost" || theme.motif === "steel" || theme.motif === "shield" || theme.motif === "bulwark"
      ? ["steel", "storm"]
      : theme.motif === "storm" || theme.motif === "tide" || theme.motif === "wind" || theme.motif === "astral" || theme.motif === "arcane"
        ? ["storm", "steel"]
        : theme.motif === "fire" || theme.motif === "dragonfire" || theme.motif === "chaos" || theme.motif === "fel"
          ? ["fire", "warcry"]
          : ["warcry", "storm", "steel"];
  return {
    core: theme.accentRgb.replaceAll(",", " "),
    hot: theme.hotRgb.replaceAll(",", " "),
    glow: theme.hotRgb.replaceAll(",", " "),
    material: materials[hash % materials.length],
    glyph: genericGlyphs[hash % genericGlyphs.length],
  };
}

export function rotationVisualStyle(visual: RotationAbilityVisual): CSSProperties {
  return {
    "--rt-effect-core": visual.core,
    "--rt-effect-hot": visual.hot,
    "--rt-effect-glow": visual.glow,
  } as CSSProperties;
}
