import type { CSSProperties } from "react";
import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import panelManifest from "../../../../public/assets/wow/mythic/hub/controls/panels/manifest.json";
import buttonManifest from "../../../../public/assets/wow/mythic/hub/controls/buttons/manifest.json";

type ControlAsset = {
  path: string;
  width: number;
  height: number;
  slices: readonly [number, number, number, number];
  /** Native image pixels between the lower outside edge and the painted rail. */
  railInset?: number;
  bytes: number;
  sha256: string;
};
type ControlManifest = { entries: Record<DungeonSlug, ControlAsset> };
const panels = panelManifest as unknown as { entries: Record<DungeonSlug, ControlAsset & { railInset: number }> };
const buttons = buttonManifest as unknown as ControlManifest;
const px = (value: number) => `${value.toFixed(2)}px`;
const widths = (values: readonly number[], scale: number) => values.map(value => px(value * scale)).join(" ");

/** Native cuts preserve real cap ornaments instead of stretching them across the label. */
export function mythicHubButtonLayout(slug: DungeonSlug): CSSProperties {
  const button = buttons.entries[slug];
  const scale = 68 / button.height;
  const [top, right, bottom, left] = button.slices;
  return {
    "--mythic-button-image": `url("${button.path}")`,
    "--mythic-button-slice": button.slices.join(" "),
    "--mythic-button-width": widths(button.slices, scale),
    "--mythic-button-top": px(top * scale), "--mythic-button-right": px(right * scale),
    "--mythic-button-bottom": px(bottom * scale), "--mythic-button-left": px(left * scale),
    "--mythic-button-pad-top": px(top * scale + 4),
    "--mythic-button-pad-bottom": px(bottom * scale + 4),
    "--mythic-button-inset": px(Math.max(left, right) * scale + 8),
  } as CSSProperties;
}

export function mythicHubControlLayout(slug: DungeonSlug): CSSProperties {
  const panel = panels.entries[slug];
  const scale = .18, mobileScale = .14;
  return {
    ...mythicHubButtonLayout(slug),
    "--mythic-panel-image": `url("${panel.path}")`,
    "--mythic-panel-slice": panel.slices.join(" "),
    "--mythic-panel-width": widths(panel.slices, scale),
    "--mythic-panel-width-mobile": widths(panel.slices, mobileScale),
    "--mythic-panel-rail-inset": px(panel.railInset * scale),
    "--mythic-panel-rail-inset-mobile": px(panel.railInset * mobileScale),
  } as CSSProperties;
}
