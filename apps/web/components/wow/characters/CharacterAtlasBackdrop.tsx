import Image from "next/image";
import { FrostLoginAtmosphere } from "./FrostLoginAtmosphere";
import styles from "./characterAtlas.module.css";

/** The Frost scene of the section (Icecrown): one painting behind the hero on the right, snow over it (design.md §4.5). */
export const CHARACTER_SCENE = "/assets/wow/loading/characters-icecrown-20261106.webp";

export function CharacterAtlasBackdrop() {
  return <div className={styles.backdrop} aria-hidden="true" data-character-backdrop>
    <div className={styles.scene}>
      <Image src={CHARACTER_SCENE} alt="" fill priority sizes="(max-width: 767px) 100vw, 72vw" className={styles.sceneImage} style={{ objectPosition: "74% top" }} />
    </div>
    <FrostLoginAtmosphere />
  </div>;
}
