import type { CSSProperties } from "react";
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
  rootPadding: number;
};

const ornaments: Record<RaidHubSlug, readonly Ornament[]> = {
  "the-unbinding-of-kithix": [{ name: "kithix-organic-roots", rootPadding: 12, width: 384, height: 547, theme: "void", anchor: "right", duration: 1600, delay: 400 }],
  "venomous-abyss": [{ name: "jade-vine", rootPadding: 18, width: 384, height: 375, theme: "jade", anchor: "left", duration: 1600, delay: 400 }],
  "the-voidspire": [{ name: "void-crystals", rootPadding: 23, width: 384, height: 387, theme: "void", anchor: "right", duration: 1200, delay: 400 }],
  "the-dreamrift": [{ name: "dream-shoot", rootPadding: 18, width: 384, height: 382, theme: "dream", anchor: "left", duration: 1800, delay: 400 }],
  "march-on-queldanas": [{ name: "sun-feather", rootPadding: 17, width: 384, height: 410, theme: "sun", anchor: "right", duration: 1500, delay: 400 }],
  sporefall: [
    { name: "spore-tall", rootPadding: 19, width: 384, height: 372, theme: "spore", anchor: "left", duration: 1600, delay: 400 },
    { name: "spore-shelf", rootPadding: 51, width: 384, height: 382, theme: "spore", anchor: "right", duration: 1500, delay: 650 },
    { name: "spore-buds", rootPadding: 34, width: 384, height: 381, theme: "spore", anchor: "buds", duration: 1400, delay: 900 },
  ],
};

const ORNAMENT_DIR = "/assets/wow/raids/hub/stylized/ornaments";
// Cutouts are at most 96 CSS px wide: the 192 px file covers 1x and 2x screens.
const ORNAMENT_SIZES = "96px";

/** Static server-rendered cutouts. The shared motion observer supplies per-piece
 * decode, first-visibility and activity hooks; CSS owns their finite growth. */
export function RaidHubOrnaments({ slug }: { slug: RaidHubSlug }) {
  return <div className={styles.ornaments} data-raid-ornaments={slug} aria-hidden="true">
    {ornaments[slug].map((ornament) => <span
      key={ornament.name}
      className={`${styles.piece} ${styles[ornament.theme]} ${styles[ornament.anchor]}`}
      data-raid-ornament-piece={ornament.name}
      style={{ "--growth-duration": `${ornament.duration}ms`, "--growth-delay": `${ornament.delay}ms`, "--raid-root-padding": ornament.rootPadding / ornament.width } as CSSProperties}
    >
      <span className={styles.growth} data-growth={ornament.theme}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static cutout with its own 192/384 widths */}
        <img
          className={styles.asset}
          src={`${ORNAMENT_DIR}/${ornament.name}.webp`}
          srcSet={`${ORNAMENT_DIR}/${ornament.name}-192.webp 192w, ${ORNAMENT_DIR}/${ornament.name}.webp 384w`}
          sizes={ORNAMENT_SIZES}
          width={ornament.width}
          height={ornament.height}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      </span>
    </span>)}
  </div>;
}
