import type { CSSProperties } from "react";
import manifest from "../../../public/assets/wow/raids/voidspire-planner/manifest.json";
import styles from "./voidspirePlanner.module.css";

export function voidspirePlannerClass(slug: string): string {
  return slug === "the-voidspire" ? styles.surface : "";
}

export function voidspireBossLinkClass(slug: string): string {
  return slug === "the-voidspire" ? styles.bossLink : "";
}

const scaledWidths = (slices: readonly number[], scale: number) => slices.map(value => `${(value * scale).toFixed(2)}px`).join(" ");

/** Map the measured opening through the same fixed corners as border-image. */
function windowCoordinate(value: number, size: number, leading: number, trailing: number, edge: number): string {
  if (value <= leading) return `${(edge * value / leading).toFixed(6)}px`;
  if (value >= size - trailing) return `calc(100% - ${(edge * (size - value) / trailing).toFixed(6)}px)`;
  const fraction = (value - leading) / (size - leading - trailing);
  const offset = edge * (1 - 2 * fraction);
  return `calc(${(fraction * 100).toFixed(6)}% ${offset < 0 ? "-" : "+"} ${Math.abs(offset).toFixed(6)}px)`;
}

const panel = manifest.entries.panel;
const [top, right, bottom, left] = panel.slices;
const panelOpening = (edge: number) => `polygon(${panel.window.polygon.map(([x, y]) => `${windowCoordinate(x, panel.width, left, right, edge)} ${windowCoordinate(y, panel.height, top, bottom, edge)}`).join(", ")})`;
const panelOpenings = { desktop: panelOpening(60), mobile: panelOpening(40), briefing: panelOpening(52), briefingMobile: panelOpening(36) };

/** Native cut points come from the delivered art, never estimated CSS apertures. */
export function voidspirePlannerLayout(slug: string): CSSProperties {
  if (slug !== "the-voidspire") return {};
  const { plaque, panel, card } = manifest.entries;
  const scale = 72 / plaque.height;
  return {
    "--void-card-aspect": `${card.width} / ${card.height}`,
    "--void-plaque-slice": plaque.slices.join(" "),
    "--void-plaque-width": scaledWidths(plaque.slices, scale),
    "--void-plaque-inset": `${(Math.max(plaque.slices[1], plaque.slices[3]) * scale + 8).toFixed(2)}px`,
    "--void-plaque-pad-top": `${(plaque.slices[0] * scale + 6).toFixed(2)}px`,
    "--void-plaque-pad-bottom": `${(plaque.slices[2] * scale + 6).toFixed(2)}px`,
    "--void-panel-slice": panel.slices.join(" "),
    "--void-panel-width": scaledWidths(panel.geometry.recommendedCssBorders, 1),
    "--void-panel-width-mobile": scaledWidths(panel.geometry.recommendedCssBordersMobile, 1),
    "--void-panel-edge": `${panel.geometry.recommendedCssBorders[0]}px`,
    "--void-panel-edge-mobile": `${panel.geometry.recommendedCssBordersMobile[0]}px`,
    "--void-panel-opening": panelOpenings.desktop,
    "--void-panel-opening-mobile": panelOpenings.mobile,
    "--void-briefing-opening": panelOpenings.briefing,
    "--void-briefing-opening-mobile": panelOpenings.briefingMobile,
    "--void-briefing-width": scaledWidths(panel.geometry.recommendedCssBorders, 52 / 60),
    "--void-briefing-width-mobile": scaledWidths(panel.geometry.recommendedCssBordersMobile, 36 / 40),
    "--void-briefing-edge": "52px",
    "--void-briefing-edge-mobile": "36px",
  } as CSSProperties;
}
