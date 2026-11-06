import type { CSSProperties } from "react";
import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import manifest from "../../../../public/assets/wow/mythic/hub/controls/ornaments/manifest.json";
import styles from "./mythicHubOrnaments.module.css";

/** The bitmap's painted base sits on the material panel's actual lower rail.
 * Images render statically without scripts; the hub observer enhances each
 * piece after its own decode and first visibility, once per visit. */
export function MythicHubOrnaments({ slug }: { slug: DungeonSlug }) {
  const ornament = manifest.entries[slug];
  return <div className={styles.ornaments} data-mythic-hub-ornaments={slug} aria-hidden="true">
    <span
      className={`${styles.piece} ${styles[ornament.theme]} ${styles[ornament.anchor]}`}
      data-mythic-hub-ornament-piece={slug}
      style={{
        "--growth-duration": `${ornament.duration}ms`,
        "--growth-delay": `${ornament.delay}ms`,
        "--mythic-root-padding": ornament.rootPadding / ornament.width,
        "--mythic-root-x": `${ornament.rootX / ornament.width * 100}%`,
        "--mythic-ornament-ratio": ornament.height / ornament.width,
      } as CSSProperties}
    >
      <span className={styles.growth} data-growth={ornament.theme}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static cutout with its own 192/384 widths */}
        <img
          className={styles.asset}
          src={ornament.path}
          // At most 96 CSS px wide: the 192 px file covers 1x and 2x screens.
          srcSet={`${ornament.path.replace(/\.webp$/, "-192.webp")} 192w, ${ornament.path} 384w`}
          sizes="96px"
          width={ornament.width}
          height={ornament.height}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      </span>
    </span>
  </div>;
}
