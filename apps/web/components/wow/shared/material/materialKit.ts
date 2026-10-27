import type { CSSProperties } from "react";
import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import { dungeonArtDirections, dungeonFrameArtwork } from "@/lib/wow/dungeonArtDirection";
import { mythicHubButtonLayout, mythicHubControlLayout } from "@/components/wow/mythic/hub/mythicHubControls";
import { mythicHubFrameLayout } from "@/components/wow/mythic/hub/mythicHubThemes";
import { raidCardThemes } from "@/components/wow/raid/raidCardThemes";
import { raidHubControlLayout } from "@/components/wow/raid/raidHubControls";
import { raidHubFrameArtwork, raidHubFrameLayout } from "@/components/wow/raid/raidHubFrames";
import type { RaidHubSlug } from "@/components/wow/raid/raidHubData";
import pullArt from "../../../../public/assets/wow/mythic/pull-art/manifest.json";

/**
 * A painted kit (gildra-wow-material-design): the finished kits of the Mythic+ atlas (dungeons)
 * and of the raid journal (raids). A section without its own kit wears one of them (the Auction
 * House wears King's Rest); when its own kit is generated (gildra-asset-imagegen) it joins this
 * type with its manifests. `MaterialKit` names the dungeon kits (icon frames exist for them only);
 * plaques, buttons and framed cards take any kit, raids included (`AnyMaterialKit`).
 */
export type MaterialKit = DungeonSlug;
export type RaidMaterialKit = RaidHubSlug;
export type AnyMaterialKit = MaterialKit | RaidMaterialKit;
export type MaterialIconKit = MaterialKit;

const isRaidKit = (kit: AnyMaterialKit): kit is RaidHubSlug => kit in raidCardThemes;
const accentOf = (kit: AnyMaterialKit) => (isRaidKit(kit) ? raidCardThemes[kit].accent : dungeonArtDirections[kit].accent);

/** The raid manifests expressed in the plaque/button variables the shared CSS reads (--mythic-*). */
function raidMaterialVars(kit: RaidHubSlug, withPanel: boolean): CSSProperties {
  const raid = raidHubControlLayout(kit) as Record<string, string>;
  const [top, right, bottom, left] = raid["--raid-button-width"].split(" ");
  return {
    "--mythic-button-image": raid["--raid-button-image"],
    "--mythic-button-slice": raid["--raid-button-slice"],
    "--mythic-button-width": raid["--raid-button-width"],
    "--mythic-button-top": top, "--mythic-button-right": right, "--mythic-button-bottom": bottom, "--mythic-button-left": left,
    "--mythic-button-pad-top": raid["--raid-button-pad-top"],
    "--mythic-button-pad-bottom": raid["--raid-button-pad-bottom"],
    "--mythic-button-inset": raid["--raid-button-inset"],
    ...(withPanel ? {
      "--mythic-panel-image": raid["--raid-panel-image"],
      "--mythic-panel-slice": raid["--raid-panel-slice"],
      "--mythic-panel-width": raid["--raid-panel-width"],
      "--mythic-panel-width-mobile": raid["--raid-panel-width-mobile"],
    } : {}),
  } as CSSProperties;
}

const pct = (value: number) => `${(value * 100).toFixed(4)}%`;

/** Plaque + button geometry of the kit and its accent (the plaque's light, base and line derive from it). */
export function materialPlaqueStyle(kit: AnyMaterialKit): CSSProperties {
  const layout = isRaidKit(kit) ? raidMaterialVars(kit, true) : mythicHubControlLayout(kit);
  return { ...layout, "--material-accent": accentOf(kit) } as CSSProperties;
}

/** Button geometry only (nine-slice cuts scaled to a 68 px button). */
export function materialButtonStyle(kit: AnyMaterialKit): CSSProperties {
  return isRaidKit(kit) ? raidMaterialVars(kit, false) : mythicHubButtonLayout(kit);
}

/** The kit's square frame around a game icon; the icon is clipped to the frame's measured window. */
export function materialIconFrameStyle(kit: MaterialIconKit, size = 52): CSSProperties {
  const skill = pullArt.entries.skills[kit];
  const { left, top, right, bottom } = skill.window.bounds;
  return {
    "--material-icon-size": `${size}px`,
    "--material-frame-image": `url("${skill.path}")`,
    "--material-frame-top": pct(top / skill.height), "--material-frame-left": pct(left / skill.width),
    "--material-frame-right": pct(1 - right / skill.width), "--material-frame-bottom": pct(1 - bottom / skill.height),
    "--material-frame-clip": skill.window.clip,
  } as CSSProperties;
}

/** The kit's painted picture frame (3:2) and its measured window (design.md §4.3). */
export function materialFrameStyle(kit: AnyMaterialKit): CSSProperties {
  if (!isRaidKit(kit)) return { ...mythicHubFrameLayout(kit), "--material-accent": accentOf(kit) } as CSSProperties;
  const raid = raidHubFrameLayout(kit) as Record<string, string>;
  return {
    "--frame-top": raid["--raid-frame-top"], "--frame-right": raid["--raid-frame-right"],
    "--frame-bottom": raid["--raid-frame-bottom"], "--frame-left": raid["--raid-frame-left"],
    "--mythic-frame-clip": raid["--raid-frame-clip"],
    "--material-accent": accentOf(kit),
  } as CSSProperties;
}

/** The frame's transparent-window artwork. */
export const materialFrameArtwork = (kit: AnyMaterialKit) => (isRaidKit(kit) ? raidHubFrameArtwork(kit) : dungeonFrameArtwork(kit));
