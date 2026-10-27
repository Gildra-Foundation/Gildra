import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { raidCardThemes } from "./raidCardThemes";
import { raidHubFrameArtwork, raidHubFrameLayout } from "./raidHubFrames";
import type { RaidHubSlug } from "./raidHubData";
import styles from "./raidHubCards.module.css";

/**
 * A painting inside a raid kit's measured frame (design.md §4.3) — the same canvas, aperture and clip as
 * the raid hub cards. With `href` the painting is a mouse target only; the card's heading carries the real link.
 */
export function RaidFramedArt({ raid, src, href, sizes, position = "center", fit = "cover", priority }: { raid: RaidHubSlug; src: string; href?: string; sizes: string; position?: string; fit?: "cover" | "contain"; priority?: boolean }) {
  const theme = raidCardThemes[raid];
  const style = { ...raidHubFrameLayout(raid), "--raid-card-base": `color-mix(in srgb, ${theme.accent} 16%, var(--atlas-bg))` } as CSSProperties;
  const canvas = <div className={styles.frameCanvas}>
      <div className={styles.artWindow}>
        <Image src={src} alt="" fill sizes={sizes} priority={priority} className={styles.sceneImage} style={{ objectPosition: position, objectFit: fit }} />
        <span className={styles.artShade} aria-hidden="true" />
      </div>
      <Image src={raidHubFrameArtwork(raid)} alt="" fill sizes={sizes} className={styles.frameImage} aria-hidden="true" />
    </div>;
  return href
    ? <Link className={styles.artLink} href={href} tabIndex={-1} aria-hidden="true" style={style}>{canvas}</Link>
    : <div className={styles.artLink} style={style}>{canvas}</div>;
}
