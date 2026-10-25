import type { CSSProperties } from "react";
import Image from "next/image";
import type { RaidHubSlug } from "./raidHubData";
import styles from "./raidHubOrnaments.module.css";

type Ornament = {
  name: string;
  width: number;
  height: number;
  theme: "spore" | "jade" | "void" | "dream" | "sun";
  anchor: "left" | "right" | "buds";
  duration: number;
  delay: number;
};

const ornaments: Record<RaidHubSlug, readonly Ornament[]> = {
  "venomous-abyss": [{ name: "jade-vine", width: 384, height: 375, theme: "jade", anchor: "left", duration: 1600, delay: 400 }],
  "the-voidspire": [{ name: "void-crystals", width: 384, height: 387, theme: "void", anchor: "right", duration: 1200, delay: 400 }],
  "the-dreamrift": [{ name: "dream-shoot", width: 384, height: 382, theme: "dream", anchor: "left", duration: 1800, delay: 400 }],
  "march-on-queldanas": [{ name: "sun-feather", width: 384, height: 410, theme: "sun", anchor: "right", duration: 1500, delay: 400 }],
  sporefall: [
    { name: "spore-tall", width: 384, height: 372, theme: "spore", anchor: "left", duration: 1600, delay: 400 },
    { name: "spore-shelf", width: 384, height: 382, theme: "spore", anchor: "right", duration: 1500, delay: 650 },
    { name: "spore-buds", width: 384, height: 381, theme: "spore", anchor: "buds", duration: 1400, delay: 900 },
  ],
};

/** Static server-rendered cutouts. The shared motion observer supplies per-piece
 * decode, first-visibility and activity hooks; CSS owns their finite growth. */
export function RaidHubOrnaments({ slug }: { slug: RaidHubSlug }) {
  return <div className={styles.ornaments} data-raid-ornaments={slug} aria-hidden="true">
    {ornaments[slug].map((ornament) => <span
      key={ornament.name}
      className={`${styles.piece} ${styles[ornament.theme]} ${styles[ornament.anchor]}`}
      data-raid-ornament-piece={ornament.name}
      style={{ "--growth-duration": `${ornament.duration}ms`, "--growth-delay": `${ornament.delay}ms` } as CSSProperties}
    >
      <span className={styles.growth} data-growth={ornament.theme}>
        <Image
          className={styles.asset}
          src={`/assets/wow/raids/hub/stylized/ornaments/${ornament.name}.webp`}
          width={ornament.width}
          height={ornament.height}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          unoptimized
        />
      </span>
    </span>)}
  </div>;
}
