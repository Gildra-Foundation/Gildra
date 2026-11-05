import type { ReactNode } from "react";
import { AtlasFrame } from "@/components/atlas";
import { CharacterAtlasBackdrop } from "./CharacterAtlasBackdrop";
import { characterAtlasMaterial } from "./characterAtlasMaterial";
import styles from "./characterAtlas.module.css";

/** The Characters frame around a connected character's page: the Frost scene behind the hero and the section's kit. */
export function CharacterProfileFrame({ locale, children }: { locale: "en" | "ru"; children: ReactNode }) {
  return (
    <AtlasFrame lang={locale} still foot={false} className={styles.page} dataAttributes={{ "data-character-atlas": true, "data-roster-view": "profile", "data-frost-login": true }}>
      <CharacterAtlasBackdrop />
      <div className={styles.material} style={characterAtlasMaterial}>{children}</div>
    </AtlasFrame>
  );
}
