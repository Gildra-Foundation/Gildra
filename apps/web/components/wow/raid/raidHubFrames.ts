import type { CSSProperties } from "react";
import type { RaidHubSlug } from "./raidHubData";

/** Measured inner RGBA edges on each original 1536×1024 frame, with a two-pixel underlap. */
export const raidHubFrameApertures: Record<RaidHubSlug, { left: number; top: number; right: number; bottom: number; radius: string }> = {
  "venomous-abyss": { left: 193, top: 192, right: 1343, bottom: 850, radius: "5% / 9%" },
  "the-voidspire": { left: 192, top: 237, right: 1344, bottom: 868, radius: "5% / 9%" },
  "the-dreamrift": { left: 217, top: 193, right: 1319, bottom: 850, radius: "7% / 12%" },
  "march-on-queldanas": { left: 168, top: 197, right: 1368, bottom: 829, radius: "5% / 9%" },
  sporefall: { left: 207, top: 177, right: 1360, bottom: 852, radius: "10% / 15%" },
};

export function raidHubFrameArtwork(slug: RaidHubSlug) {
  return `/assets/wow/raids/hub/frames/${slug}.webp`;
}

export function raidHubFrameLayout(slug: RaidHubSlug): CSSProperties {
  const aperture = raidHubFrameApertures[slug];
  return {
    "--raid-frame-left": `${aperture.left / 1536 * 100}%`,
    "--raid-frame-top": `${aperture.top / 1024 * 100}%`,
    "--raid-frame-right": `${(1536 - aperture.right) / 1536 * 100}%`,
    "--raid-frame-bottom": `${(1024 - aperture.bottom) / 1024 * 100}%`,
    "--raid-frame-radius": aperture.radius,
  } as CSSProperties;
}
