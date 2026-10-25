import type { ComponentProps, CSSProperties } from "react";
import { ResilientImage } from "@/components/media/ResilientImage";
import styles from "./dungeonPullArt.module.css";

/** Keep the real spell image and its fallback underneath a transparent painted frame. */
export function DungeonSpellIcon({ size = 48, ...image }: ComponentProps<typeof ResilientImage> & { size?: number }) {
  return <span className={styles.spellFrame} data-combat-frame="spell" style={{ "--pull-icon-size": `${size}px` } as CSSProperties}>
    <ResilientImage {...image} />
  </span>;
}
