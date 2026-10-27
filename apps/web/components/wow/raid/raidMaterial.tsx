import type { ComponentProps, CSSProperties } from "react";
import clsx from "clsx";
import {
  MaterialLinkButton,
  MaterialPlaque,
  materialIconFrameStyle,
  materialStyles,
  type MaterialKit,
} from "@/components/wow/shared/materialAtlas";
import buttons from "../../../public/assets/wow/raids/hub/controls/buttons/manifest.json";
import { raidCardThemes } from "./raidCardThemes";
import type { RaidHubSlug } from "./raidHubData";
import styles from "./raidMaterial.module.css";

/**
 * The raid kits (panel + button of every raid, `public/assets/wow/raids/hub/controls`) worn through the
 * shared material components (gildra-wow-material-design §4.0). The shared `MaterialKit` type only knows
 * the Mythic+ kits, so each raid names its closest Mythic+ kit and overrides the painted geometry with its
 * own measured panel and button. The Mythic+ kit is also the raid's skill frame until the raid kits get
 * their own (docs/raid-assets/CODEX-PROMPTS.v2.md).
 */
const nearestKit: Record<RaidHubSlug, MaterialKit> = {
  "venomous-abyss": "temple-of-sethraliss",
  "the-voidspire": "voidscar-arena",
  "the-dreamrift": "the-blinding-vale",
  "march-on-queldanas": "murder-row",
  sporefall: "altar-of-fangs",
};

// Measured native cut points of the raid panels (same values as raidHubControls.ts).
const panels: Record<RaidHubSlug, readonly number[]> = {
  "venomous-abyss": [168, 144, 144, 144],
  "the-voidspire": [136, 112, 136, 112],
  "the-dreamrift": [160, 128, 160, 128],
  "march-on-queldanas": [160, 144, 160, 144],
  sporefall: [136, 128, 136, 128],
};

const px = (value: number) => `${value.toFixed(2)}px`;
const widths = (values: readonly number[], scale: number) => values.map((value) => px(value * scale)).join(" ");

function buttonVars(slug: RaidHubSlug, prefix = "--mythic-button", height = 68): CSSProperties {
  const button = buttons.find((asset) => asset.slug === slug)!;
  const { top, right, bottom, left } = button.recommendedSlice;
  const scale = height / button.height;
  const slices = [top, right, bottom, left];
  return {
    [`${prefix}-image`]: `url("${button.url}")`,
    [`${prefix}-slice`]: slices.join(" "),
    [`${prefix}-width`]: widths(slices, scale),
    [`${prefix}-top`]: px(top * scale), [`${prefix}-right`]: px(right * scale),
    [`${prefix}-bottom`]: px(bottom * scale), [`${prefix}-left`]: px(left * scale),
    [`${prefix}-pad-top`]: px(top * scale + 4),
    [`${prefix}-pad-bottom`]: px(bottom * scale + 4),
    [`${prefix}-inset`]: px(Math.max(left, right) * scale + 8),
  } as CSSProperties;
}

/** Plaque geometry of one raid kit plus its accent (the plaque's light, base and line derive from it). */
export function raidPlaqueStyle(slug: RaidHubSlug): CSSProperties {
  return {
    ...buttonVars(slug),
    "--mythic-panel-image": `url("/assets/wow/raids/hub/controls/panels/${slug}.webp")`,
    "--mythic-panel-slice": panels[slug].join(" "),
    "--mythic-panel-width": widths(panels[slug], .18),
    "--mythic-panel-width-mobile": widths(panels[slug], .14),
    "--material-accent": raidCardThemes[slug].accent,
  } as CSSProperties;
}

type PlaqueProps = Omit<ComponentProps<typeof MaterialPlaque>, "kit"> & { raid: RaidHubSlug };

/** A painted plaque of the raid's own kit around live HTML. Never nest plaques. */
export function RaidPlaque({ raid, style, ...props }: PlaqueProps) {
  return <MaterialPlaque {...props} kit={nearestKit[raid]} style={{ ...raidPlaqueStyle(raid), ...style }} />;
}

type ButtonProps = Omit<ComponentProps<typeof MaterialLinkButton>, "kit" | "size"> & {
  raid: RaidHubSlug;
  /** `row` is the 56 px list chip of the raid hub (boss chips); `button` the 68 px action. */
  shape?: "button" | "row";
};

/**
 * A painted nine-slice link button of the raid's own kit; the label stays live HTML. The shared slot sets
 * the Mythic+ geometry inline, so the raid geometry rides on a contents-only wrapper and is re-applied on
 * the button itself (raidMaterial.module.css).
 */
export function RaidLinkButton({ raid, shape = "button", className, ...props }: ButtonProps) {
  return <span className={styles.scope} style={buttonVars(raid, "--raid-kit-button", shape === "row" ? 56 : 68)}>
    <MaterialLinkButton {...props} kit={nearestKit[raid]} className={clsx(styles.button, shape === "row" && styles.row, className)} />
  </span>;
}

/** The painted square frame around a game icon (the raid's nearest Mythic+ skill frame). */
export function raidIconFrameStyle(raid: RaidHubSlug, size = 52): CSSProperties {
  return materialIconFrameStyle(nearestKit[raid], size);
}

export const raidMaterialStyles = materialStyles;
