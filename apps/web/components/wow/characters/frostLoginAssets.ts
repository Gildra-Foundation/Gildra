import type { CSSProperties } from "react";
import manifest from "../../../public/assets/wow/characters/frost-login/manifest.json";

const panel = manifest.entries.panel;
const button = manifest.entries.button;
const widths = (cuts: number[], scale: number) => cuts.map(value => `${(value * scale).toFixed(2)}px`).join(" ");

/** Nine-slice cuts measured from the actual generated assets, as on the Mythic+ hub. */
export const frostLoginMaterial = {
  "--frost-panel-image": `url("${panel.path}")`,
  "--frost-panel-slice": panel.slices.join(" "),
  "--frost-panel-width": widths(panel.slices, .18),
  "--frost-panel-width-mobile": widths(panel.slices, .14),
  "--frost-button-image": `url("${button.path}")`,
  "--frost-button-slice": button.slices.join(" "),
  "--frost-button-width": widths(button.slices, 68 / button.height),
  "--frost-button-inset": `${Math.max(button.slices[1], button.slices[3]) * 68 / button.height + 3}px`,
} as CSSProperties;
