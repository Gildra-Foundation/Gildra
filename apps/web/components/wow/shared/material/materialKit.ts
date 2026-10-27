import type { CSSProperties } from "react";
import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import { dungeonArtDirections, dungeonFrameArtwork } from "@/lib/wow/dungeonArtDirection";
import { mythicHubButtonLayout, mythicHubControlLayout } from "@/components/wow/mythic/hub/mythicHubControls";
import { mythicHubFrameLayout } from "@/components/wow/mythic/hub/mythicHubThemes";
import pullArt from "../../../../public/assets/wow/mythic/pull-art/manifest.json";

/**
 * A painted kit (gildra-wow-material-design): today the finished kits of the Mythic+ atlas.
 * A section without its own kit wears one of them (the Auction House wears King's Rest);
 * when its own kit is generated (gildra-asset-imagegen) it joins this type with its manifests.
 */
export type MaterialKit = DungeonSlug;

const pct = (value: number) => `${(value * 100).toFixed(4)}%`;

/** Plaque + button geometry of the kit and its accent (the plaque's light, base and line derive from it). */
export function materialPlaqueStyle(kit: MaterialKit): CSSProperties {
  return { ...mythicHubControlLayout(kit), "--material-accent": dungeonArtDirections[kit].accent } as CSSProperties;
}

/** Button geometry only (nine-slice cuts scaled to a 68 px button). */
export function materialButtonStyle(kit: MaterialKit): CSSProperties {
  return mythicHubButtonLayout(kit);
}

/** The kit's square frame around a game icon; the icon is clipped to the frame's measured window. */
export function materialIconFrameStyle(kit: MaterialKit, size = 52): CSSProperties {
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
export function materialFrameStyle(kit: MaterialKit): CSSProperties {
  return { ...mythicHubFrameLayout(kit), "--material-accent": dungeonArtDirections[kit].accent } as CSSProperties;
}

/** The frame's transparent-window artwork. */
export const materialFrameArtwork = (kit: MaterialKit) => dungeonFrameArtwork(kit);
