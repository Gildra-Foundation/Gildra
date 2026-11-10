import type { CSSProperties } from "react";
import libraryPanels from "../../../../public/assets/wow/slim/library/controls/panels/manifest.json";
import libraryButtons from "../../../../public/assets/wow/slim/library/controls/buttons/manifest.json";
import libraryFrames from "../../../../public/assets/wow/slim/library/controls/frames/manifest.json";
import talentsPanels from "../../../../public/assets/wow/slim/talents/controls/panels/manifest.json";
import talentsButtons from "../../../../public/assets/wow/slim/talents/controls/buttons/manifest.json";
import talentsFrames from "../../../../public/assets/wow/slim/talents/controls/frames/manifest.json";
import charactersPanels from "../../../../public/assets/wow/slim/characters/controls/panels/manifest.json";
import charactersButtons from "../../../../public/assets/wow/slim/characters/controls/buttons/manifest.json";
import charactersFrames from "../../../../public/assets/wow/slim/characters/controls/frames/manifest.json";
import tierPanels from "../../../../public/assets/wow/slim/tier-lists/controls/panels/manifest.json";
import tierButtons from "../../../../public/assets/wow/slim/tier-lists/controls/buttons/manifest.json";
import tierFrames from "../../../../public/assets/wow/slim/tier-lists/controls/frames/manifest.json";

/**
 * Slim section kits (gildra-asset-imagegen, 2026-11-05): thin rails, compact caps and lighter files for the
 * tool and catalogue sections — Library, Talents, Characters (Frost Hall) and Tier lists. Same contract as the
 * dungeon kits (nine-slice plaque and button, square icon frame with a measured window), own manifests under
 * /assets/wow/slim/<kit>/controls. Sources, prompts and QA: /home/debian/gildra-slim-assets-20261105.
 */
import arcanaPanels from "../../../../public/assets/wow/home/arcana/panels.json";
import arcanaButtons from "../../../../public/assets/wow/home/arcana/buttons.json";

export type SectionKit = "arcana" | "library" | "talents" | "characters" | "tier-lists";

type Control = { path: string; width: number; height: number; slices: readonly number[]; railInset?: number };
type Frame = { path: string; width: number; height: number; window: { bounds: { left: number; top: number; right: number; bottom: number }; clip: string } };
const one = <T,>(manifest: unknown): T => Object.values((manifest as { entries: Record<string, T> }).entries)[0];
const skill = (manifest: unknown): Frame => Object.values((manifest as { entries: { skills: Record<string, Frame> } }).entries.skills)[0];

const kits: Record<SectionKit, { panel: Control; button: Control; frame: Frame; accent: string }> = {
  arcana: { panel: one(arcanaPanels), button: one(arcanaButtons), frame: skill(charactersFrames), accent: "#b4a3e2" },
  library: { panel: one(libraryPanels), button: one(libraryButtons), frame: skill(libraryFrames), accent: "#c8a46a" },
  talents: { panel: one(talentsPanels), button: one(talentsButtons), frame: skill(talentsFrames), accent: "#b49ad8" },
  characters: { panel: one(charactersPanels), button: one(charactersButtons), frame: skill(charactersFrames), accent: "#9fb6d6" },
  "tier-lists": { panel: one(tierPanels), button: one(tierButtons), frame: skill(tierFrames), accent: "#cf9a6a" },
};

export const sectionKitNames = Object.keys(kits) as SectionKit[];
export const isSectionKit = (kit: string): kit is SectionKit => kit in kits;
export const sectionKitAccent = (kit: SectionKit) => kits[kit].accent;

const px = (value: number) => `${value.toFixed(2)}px`;
const widths = (values: readonly number[], scale: number) => values.map((value) => px(value * scale)).join(" ");
const pct = (value: number) => `${(value * 100).toFixed(4)}%`;

/** The same variables as mythicHubButtonLayout: nine-slice cuts scaled to a 68 px button. */
export function sectionButtonLayout(kit: SectionKit): CSSProperties {
  const button = kits[kit].button;
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

/** The same variables as mythicHubControlLayout: plaque + button. */
export function sectionControlLayout(kit: SectionKit): CSSProperties {
  const panel = kits[kit].panel;
  const scale = .18, mobileScale = .14;
  return {
    ...sectionButtonLayout(kit),
    "--mythic-panel-image": `url("${panel.path}")`,
    "--mythic-panel-slice": panel.slices.join(" "),
    "--mythic-panel-width": widths(panel.slices, scale),
    "--mythic-panel-width-mobile": widths(panel.slices, mobileScale),
    "--mythic-panel-rail-inset": px((panel.railInset ?? 0) * scale),
    "--mythic-panel-rail-inset-mobile": px((panel.railInset ?? 0) * mobileScale),
  } as CSSProperties;
}

/** The kit's square icon frame, clipped to its measured window (as materialIconFrameStyle). */
export function sectionIconFrameStyle(kit: SectionKit, size = 52): CSSProperties {
  const frame = kits[kit].frame;
  const { left, top, right, bottom } = frame.window.bounds;
  return {
    "--material-icon-size": `${size}px`,
    "--material-frame-image": `url("${frame.path}")`,
    "--material-frame-top": pct(top / frame.height), "--material-frame-left": pct(left / frame.width),
    "--material-frame-right": pct(1 - right / frame.width), "--material-frame-bottom": pct(1 - bottom / frame.height),
    "--material-frame-clip": frame.window.clip,
  } as CSSProperties;
}
