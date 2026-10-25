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

export function dungeonMapFrameLayout(slug: DungeonSlug): CSSProperties {
  const a = apertures[slug], width = 1 - (a.left + a.right) / 100, height = 1 - (a.top + a.bottom) / 100;
  return {
    "--frame-top": `${a.top}%`, "--frame-right": `${a.right}%`,
    "--frame-bottom": `${a.bottom}%`, "--frame-left": `${a.left}%`,
    "--frame-window-height": height, "--frame-aspect": 1.5 * height / width,
    "--frame-window-radius": a.radius,
  } as CSSProperties;
}
