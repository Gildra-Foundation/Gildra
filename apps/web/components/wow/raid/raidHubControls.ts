import type { CSSProperties } from "react";
import buttons from "../../../public/assets/wow/raids/hub/controls/buttons/manifest.json";
import type { RaidHubSlug } from "./raidHubData";

// Measured native cut points keep the painted corners intact at every width.
const panels: Record<RaidHubSlug, readonly number[]> = {
  "venomous-abyss": [168, 144, 144, 144],
  "the-voidspire": [136, 112, 136, 112],
  "the-dreamrift": [160, 128, 160, 128],
  "march-on-queldanas": [160, 144, 160, 144],
  sporefall: [136, 128, 136, 128],
};
const widths = (values: readonly number[], scale: number) => values.map(value => `${(value * scale).toFixed(2)}px`).join(" ");

export function raidHubControlLayout(slug: RaidHubSlug): CSSProperties {
  const button = buttons.find(asset => asset.slug === slug)!;
  const slice = button.recommendedSlice;
  const values = [slice.top, slice.right, slice.bottom, slice.left];
  return {
    "--raid-panel-image": `url("/assets/wow/raids/hub/controls/panels/${slug}.webp")`,
    "--raid-panel-slice": panels[slug].join(" "),
    "--raid-panel-width": widths(panels[slug], .18),
    "--raid-panel-width-mobile": widths(panels[slug], .14),
    "--raid-button-image": `url("${button.url}")`,
    "--raid-button-slice": values.join(" "),
    "--raid-button-width": widths(values, 68 / button.height),
    "--raid-button-pad-top": `${(slice.top * 68 / button.height + 5).toFixed(2)}px`,
    "--raid-button-pad-bottom": `${(slice.bottom * 68 / button.height + 5).toFixed(2)}px`,
    "--raid-row-pad-top": `${(slice.top * 56 / button.height + 5).toFixed(2)}px`,
    "--raid-row-pad-bottom": `${(slice.bottom * 56 / button.height + 5).toFixed(2)}px`,
    "--raid-row-width": widths(values, 56 / button.height),
    "--raid-button-inset": `${(Math.max(slice.left, slice.right) * 68 / button.height + 8).toFixed(2)}px`,
    "--raid-row-inset": `${(Math.max(slice.left, slice.right) * 56 / button.height + 8).toFixed(2)}px`,
  } as CSSProperties;
}
