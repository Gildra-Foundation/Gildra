import type { CSSProperties } from "react";
import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";

/** Inner RGBA edge measured on the 1536×1024 artwork. One-pixel bleed sits under its antialiasing. */
const apertures: Record<DungeonSlug, { top: number; right: number; bottom: number; left: number; radius: string }> = {
  "ruby-life-pools": { top: 9.96, right: 4.39, bottom: 9.67, left: 4.39, radius: "4% / 6%" },
  "altar-of-fangs": { top: 11.23, right: 4.72, bottom: 12.3, left: 4.72, radius: "4% / 6%" },
  "murder-row": { top: 9.57, right: 4.13, bottom: 9.86, left: 4.07, radius: "4% / 6%" },
  "den-of-nalorakk": { top: 11.23, right: 4.52, bottom: 11.91, left: 4.46, radius: "0" },
  "the-blinding-vale": { top: 10.25, right: 4.33, bottom: 11.13, left: 4.26, radius: "4% / 6%" },
  "voidscar-arena": { top: 10.35, right: 4.52, bottom: 10.74, left: 4.52, radius: "4% / 6%" },
  "kings-rest": { top: 12.2, right: 4.52, bottom: 12.01, left: 4.46, radius: "0" },
  "temple-of-sethraliss": { top: 10.45, right: 4.59, bottom: 9.57, left: 4.59, radius: "4% / 6%" },
};

/**
 * The painted frame is drawn as a 9-slice cut at the measured aperture, so its corners and crest keep
 * their painted proportions; only the plain rails stretch. Bands are sized from the frame width (cqw) at
 * the artwork's own scale, and the box height leaves the window at the map's 3:2.
 */
export function dungeonMapFrameLayout(slug: DungeonSlug, frameArt: string): CSSProperties {
  const a = apertures[slug];
  const band = (side: number, axis: "x" | "y") => (axis === "x" ? side : side / 1.5);
  const bands = { top: band(a.top, "y"), right: band(a.right, "x"), bottom: band(a.bottom, "y"), left: band(a.left, "x") };
  const windowWidth = 1 - (a.left + a.right) / 100;
  return {
    "--frame-art": `url("${frameArt}")`,
    "--frame-slice": `${(a.top * 10.24).toFixed(1)} ${(a.right * 15.36).toFixed(1)} ${(a.bottom * 10.24).toFixed(1)} ${(a.left * 15.36).toFixed(1)}`,
    "--frame-top": `${bands.top.toFixed(3)}cqw`, "--frame-right": `${bands.right.toFixed(3)}cqw`,
    "--frame-bottom": `${bands.bottom.toFixed(3)}cqw`, "--frame-left": `${bands.left.toFixed(3)}cqw`,
    "--frame-bands-y": `${(bands.top + bands.bottom).toFixed(3)}cqw`,
    "--frame-aspect": (1.5 / (windowWidth + (a.top + a.bottom) / 100)).toFixed(4),
    "--frame-window-radius": a.radius,
  } as CSSProperties;
}
