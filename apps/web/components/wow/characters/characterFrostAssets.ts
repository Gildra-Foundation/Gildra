import type { CSSProperties } from "react";
import manifest from "../../../public/assets/wow/characters/frost-roster/manifest.json";
import loginManifest from "../../../public/assets/wow/characters/frost-login/manifest.json";
import { frostLoginMaterial } from "./frostLoginAssets";

const { card, portraitRing, heraldry } = manifest.entries;
const button = loginManifest.entries.button;
const widths = (cuts: number[], scale: number) => cuts.map(value => `${(value * scale).toFixed(2)}px`).join(" ");
const aperture = portraitRing.aperture;

/** Actual alpha measurements keep the class image beneath the steel inner lip. */
export const characterFrostMaterial = {
  ...frostLoginMaterial,
  "--roster-card-image": `url("${card.path}")`,
  "--roster-card-slice": card.slices.join(" "),
  "--roster-card-width": widths(card.slices, .34),
  "--roster-card-width-mobile": widths(card.slices, .26),
  "--roster-card-width-small": widths(card.slices, .28),
  "--roster-card-width-control": widths(card.slices, .15),
  "--roster-portrait-image": `url("${portraitRing.path}")`,
  "--roster-portrait-left": `${(aperture.center[0] - aperture.coverRadius) / portraitRing.width * 100}%`,
  "--roster-portrait-top": `${(aperture.center[1] - aperture.coverRadius) / portraitRing.height * 100}%`,
  "--roster-portrait-size": `${aperture.coverRadius * 2 / portraitRing.width * 100}%`,
  "--roster-action-width": widths(button.slices, 80 / button.height),
  "--roster-action-inset": `${Math.max(button.slices[1], button.slices[3]) * 80 / button.height + 3}px`,
} as CSSProperties;

export const characterFrostArt = { heraldry: heraldry.path } as const;
