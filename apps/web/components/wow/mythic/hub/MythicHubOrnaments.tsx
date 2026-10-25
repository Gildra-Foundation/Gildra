import type { CSSProperties } from "react";
import Image from "next/image";
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
        <Image
          className={styles.asset}
          src={ornament.path}
          width={ornament.width}
          height={ornament.height}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          unoptimized
        />
      </span>
    </span>
  </div>;
}
