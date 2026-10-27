import type { CSSProperties } from "react";
import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import { dungeonArtDirections } from "@/lib/wow/dungeonArtDirection";
import { mythicHubButtonLayout, mythicHubControlLayout } from "@/components/wow/shared/materialAtlas";
import pullArt from "../../../public/assets/wow/mythic/pull-art/manifest.json";

/**
 * Painted materials of the Auction House. Until its own kit is generated
 * (docs/auction-assets/CODEX-PROMPTS.md) the page wears one finished kit of the
 * Mythic+ atlas: King's Rest — Zandalari gold over dark teal reads as coin and trade.
 * Swap the slug (or the manifests) here and every plaque, button and icon frame follows.
 */
export const auctionKit: DungeonSlug = "kings-rest";
const pct = (value: number) => `${(value * 100).toFixed(4)}%`;

export function auctionPlaqueStyle(): CSSProperties {
  return { ...mythicHubControlLayout(auctionKit), "--auction-kit-accent": dungeonArtDirections[auctionKit].accent } as CSSProperties;
}

export function auctionButtonStyle(): CSSProperties {
  return mythicHubButtonLayout(auctionKit);
}

/** The square ability frame of the kit around an item icon; the icon is clipped to the measured window. */
export function auctionIconFrameStyle(): CSSProperties {
  const skill = pullArt.entries.skills[auctionKit];
  const { left, top, right, bottom } = skill.window.bounds;
  return {
    "--auction-frame-image": `url("${skill.path}")`,
    "--auction-frame-top": pct(top / skill.height), "--auction-frame-left": pct(left / skill.width),
    "--auction-frame-right": pct(1 - right / skill.width), "--auction-frame-bottom": pct(1 - bottom / skill.height),
    "--auction-frame-clip": skill.window.clip,
  } as CSSProperties;
}
