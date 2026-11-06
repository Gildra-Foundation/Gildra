import type { CSSProperties } from "react";
import slimButtons from "../../../public/assets/wow/slim/characters/controls/buttons/manifest.json";
import slimPanels from "../../../public/assets/wow/slim/characters/controls/panels/manifest.json";
import rosterManifest from "../../../public/assets/wow/characters/frost-roster/manifest.json";

/**
 * Geometry of the Characters section's own painted kit — Frost (steel, ice, skulls) — expressed in the
 * variables the shared material pieces read (components/wow/shared/materialAtlas: `--mythic-panel-*`,
 * `--mythic-button-*`), so the section uses the shared plaque and button with its own art.
 * Cuts are the measured nine-slice values of the manifests; scales follow design.md §4.1/§4.2
 * (button 68 px tall, plaque .18 on desktop, .14 on phones).
 */
// Button and plaque: the slim Frost Hall kit (2026-11-05, thin rails, lighter files); portrait ring and
// heraldry stay from the Frost roster set.
const button = slimButtons.entries.characters;
const card = slimPanels.entries.characters;
const { portraitRing, heraldry } = rosterManifest.entries;
const px = (value: number) => `${value.toFixed(2)}px`;
const widths = (cuts: readonly number[], scale: number) => cuts.map((value) => px(value * scale)).join(" ");
const buttonScale = 68 / button.height;
const [bTop, bRight, bBottom, bLeft] = button.slices;
const aperture = portraitRing.aperture;

/** Set once on the page root: the Frost button, plaque and portrait ring as custom properties. */
export const characterAtlasMaterial = {
  "--frost-button-image": `url("${button.path}")`,
  "--frost-button-slice": button.slices.join(" "),
  "--frost-button-width": widths(button.slices, buttonScale),
  "--frost-button-top": px(bTop * buttonScale),
  "--frost-button-right": px(bRight * buttonScale),
  "--frost-button-bottom": px(bBottom * buttonScale),
  "--frost-button-left": px(bLeft * buttonScale),
  "--frost-button-inset": px(Math.max(bLeft, bRight) * buttonScale + 8),
  "--frost-panel-image": `url("${card.path}")`,
  "--frost-panel-slice": card.slices.join(" "),
  "--frost-panel-width": widths(card.slices, .18),
  "--frost-panel-width-mobile": widths(card.slices, .14),
  "--frost-portrait-image": `url("${portraitRing.path}")`,
  "--frost-portrait-left": `${(aperture.center[0] - aperture.coverRadius) / portraitRing.width * 100}%`,
  "--frost-portrait-top": `${(aperture.center[1] - aperture.coverRadius) / portraitRing.height * 100}%`,
  "--frost-portrait-size": `${aperture.coverRadius * 2 / portraitRing.width * 100}%`,
} as CSSProperties;

/** Frost art on a shared `MaterialPlaque` (its own style wins over the kit's). The accent is the atlas ice. */
export const frostPlaqueStyle = {
  "--mythic-panel-image": "var(--frost-panel-image)",
  "--mythic-panel-slice": "var(--frost-panel-slice)",
  "--mythic-panel-width": "var(--frost-panel-width)",
  "--mythic-panel-width-mobile": "var(--frost-panel-width-mobile)",
  "--material-accent": "var(--atlas-accent)",
} as CSSProperties;

export const characterFrostArt = { heraldry: heraldry.path } as const;

/** Faction banners of the game (data colours, like class colours): the small crest on each roster card. */
export const factionColors = { ALLIANCE: "#4a7bd6", HORDE: "#cf3f2e" } as const;
