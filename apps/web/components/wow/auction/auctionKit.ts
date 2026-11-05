import type { CSSProperties } from "react";
import type { AnyMaterialKit } from "@/components/wow/shared/materialAtlas";
import panels from "../../../public/assets/wow/auction/controls/panels/manifest.json";
import buttons from "../../../public/assets/wow/auction/controls/buttons/manifest.json";
import frames from "../../../public/assets/wow/auction/controls/frames/manifest.json";

/**
 * Painted kit of the Auction House (gildra-asset-imagegen, 2026-11-05): slim gunmetal rails, copper-gold coin caps,
 * emerald enamel, bottle-green ledger face. Local adapter with the same contract as the slim section kits
 * (components/wow/shared/material/sectionKits.ts: --mythic-panel-*, --mythic-button-*, --material-frame-*), so the shared
 * MaterialPlaque / MaterialButton / icon frame wear it. Sources, prompts and QA: /home/debian/gildra-owner-20261105b/auction/assets.
 * The base kit only satisfies the shared components' prop; every variable below overrides it.
 */
export const auctionBaseKit: AnyMaterialKit = "library";
export const auctionAccent = "#d0995a";

type Control = { path: string; width: number; height: number; slices: readonly number[]; railInset?: number };
type Frame = { path: string; width: number; height: number; window: { bounds: { left: number; top: number; right: number; bottom: number }; clip: string } };
const panel = Object.values((panels as unknown as { entries: Record<string, Control> }).entries)[0];
const button = Object.values((buttons as unknown as { entries: Record<string, Control> }).entries)[0];
const frame = Object.values((frames as unknown as { entries: { skills: Record<string, Frame> } }).entries.skills)[0];

const px = (value: number) => `${value.toFixed(2)}px`;
const widths = (values: readonly number[], scale: number) => values.map((value) => px(value * scale)).join(" ");
const pct = (value: number) => `${(value * 100).toFixed(4)}%`;

/** Nine-slice cuts of the button scaled to a 68 px button. */
export function auctionButtonStyle(): CSSProperties {
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

/** Plaque + button geometry and the kit accent (the plaque's light, base and line derive from it). */
export function auctionPlaqueStyle(): CSSProperties {
  const scale = .18, mobileScale = .14;
  return {
    ...auctionButtonStyle(),
    "--mythic-panel-image": `url("${panel.path}")`,
    "--mythic-panel-slice": panel.slices.join(" "),
    "--mythic-panel-width": widths(panel.slices, scale),
    "--mythic-panel-width-mobile": widths(panel.slices, mobileScale),
    "--mythic-panel-rail-inset": px((panel.railInset ?? 0) * scale),
    "--mythic-panel-rail-inset-mobile": px((panel.railInset ?? 0) * mobileScale),
    "--material-accent": auctionAccent,
  } as CSSProperties;
}

/** The kit's square frame around an item icon, clipped to its measured window. */
export function auctionIconFrameStyle(size = 52): CSSProperties {
  const { left, top, right, bottom } = frame.window.bounds;
  return {
    "--material-icon-size": `${size}px`,
    "--material-frame-image": `url("${frame.path}")`,
    "--material-frame-top": pct(top / frame.height), "--material-frame-left": pct(left / frame.width),
    "--material-frame-right": pct(1 - right / frame.width), "--material-frame-bottom": pct(1 - bottom / frame.height),
    "--material-frame-clip": frame.window.clip,
  } as CSSProperties;
}
