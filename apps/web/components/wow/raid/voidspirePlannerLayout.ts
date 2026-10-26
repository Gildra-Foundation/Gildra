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
    "--void-briefing-width": scaledWidths(panel.geometry.recommendedCssBorders, 52 / 60),
    "--void-briefing-width-mobile": scaledWidths(panel.geometry.recommendedCssBordersMobile, 36 / 40),
  } as CSSProperties;
}
