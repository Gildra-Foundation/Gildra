import type { ComponentProps } from "react";
import clsx from "clsx";
import {
  MaterialLinkButton,
  MaterialPlaque,
  materialIconFrameStyle,
  materialStyles,
  type MaterialIconKit,
} from "@/components/wow/shared/materialAtlas";
import { raidHubControlLayout } from "./raidHubControls";
import type { RaidHubSlug } from "./raidHubData";
import styles from "./raidMaterial.module.css";

/**
 * The raid pages wear their own raid kit through the shared material (gildra-wow-material-design §4.0):
 * plaques and buttons take the raid slug directly. Icon frames exist for the Mythic+ kits only, so each
 * raid names its closest one until the raid skill frames are generated (docs/raid-assets/CODEX-PROMPTS.v2.md).
 */
const skillFrameKit: Record<RaidHubSlug, MaterialIconKit> = {
  "venomous-abyss": "temple-of-sethraliss",
  "the-voidspire": "voidscar-arena",
  "the-dreamrift": "the-blinding-vale",
  "march-on-queldanas": "murder-row",
  sporefall: "altar-of-fangs",
};

type PlaqueProps = Omit<ComponentProps<typeof MaterialPlaque>, "kit"> & { raid: RaidHubSlug };

/** A painted plaque of the raid's own kit around live HTML. Never nest plaques. */
export function RaidPlaque({ raid, ...props }: PlaqueProps) {
  return <MaterialPlaque {...props} kit={raid} />;
}

type ButtonProps = Omit<ComponentProps<typeof MaterialLinkButton>, "kit" | "size"> & {
  raid: RaidHubSlug;
  /** `row` is the 56 px list chip of the raid hub (boss chips); `button` the 68 px action. */
  shape?: "button" | "row";
};

/**
 * A painted nine-slice link button of the raid's own kit; the label stays live HTML. The 56 px row reads
 * the raid hub's row geometry (raidHubControlLayout) from a contents-only wrapper (raidMaterial.module.css).
 */
export function RaidLinkButton({ raid, shape = "button", className, ...props }: ButtonProps) {
  const button = <MaterialLinkButton {...props} kit={raid} className={clsx(shape === "row" && styles.row, className)} />;
  return shape === "row" ? <span className={styles.scope} style={raidHubControlLayout(raid)}>{button}</span> : button;
}

/** The painted square frame around a game icon (the raid's nearest Mythic+ skill frame). */
export function raidIconFrameStyle(raid: RaidHubSlug, size = 52) {
  return materialIconFrameStyle(skillFrameKit[raid], size);
}

export const raidMaterialStyles = materialStyles;
