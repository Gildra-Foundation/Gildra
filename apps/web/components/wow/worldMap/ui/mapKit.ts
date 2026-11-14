import type { CSSProperties } from "react";
import { materialIconFrameStyle, materialPlaqueStyle } from "@/components/wow/shared/materialAtlas";

/**
 * The map wears the cartographer's kit of the site (the Library's bronze-and-wood
 * section kit, gildra-wow-material-design §4.0): its nine-slice plaque around the
 * panels, its square frame around the tools. The rails are thinner than on a page
 * plaque — the map is the picture, the frame stays a frame.
 */
const KIT = "library" as const;
const plaque = materialPlaqueStyle(KIT) as Record<string, string>;
const frame = materialIconFrameStyle(KIT, 44) as Record<string, string>;
const slices = plaque["--mythic-panel-slice"].split(" ").map(Number);
const widths = (scale: number) => slices.map((value) => `${(value * scale).toFixed(2)}px`).join(" ");

export const mapKitStyle = {
  "--map-kit-accent": plaque["--material-accent"],
  "--map-panel-image": plaque["--mythic-panel-image"],
  "--map-panel-slice": plaque["--mythic-panel-slice"],
  // Panels (place, timeline, layers) and small pieces (search field, tags, tooltips).
  "--map-panel-width": widths(0.12),
  "--map-panel-width-small": widths(0.085),
  "--map-frame-image": frame["--material-frame-image"],
  "--map-frame-top": frame["--material-frame-top"],
  "--map-frame-right": frame["--material-frame-right"],
  "--map-frame-bottom": frame["--material-frame-bottom"],
  "--map-frame-left": frame["--material-frame-left"],
} as CSSProperties;

/** Writes the kit on the stage: the panels live in the stage's header, dock and tool column. */
export function applyMapKit(el: HTMLElement | null) {
  if (!el) return;
  for (const [key, value] of Object.entries(mapKitStyle as Record<string, string>)) el.style.setProperty(key, value);
}
