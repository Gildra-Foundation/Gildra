import "@/app/styles/talents.css";
import "@/app/styles/talents/premium.css";
import "@/app/styles/talents/atlas.css";
import type { ReactNode } from "react";
import { AtlasFrame } from "@/components/atlas";
import { TalentBackdrop } from "@/components/talents/TalentBackdrop";
import styles from "@/components/talents/talentAtlasPage.module.css";

/** Talent pages sit in the atlas frame (legal line at the foot) with the talents scene behind the hero. */
export default function RussianTalentsLayout({ children }: { children: ReactNode }) {
  return <>
    <link rel="preconnect" href="https://render.worldofwarcraft.com" />
    <AtlasFrame lang="ru" as="div" className={styles.frame} still foot={false} dataAttributes={{ "data-talent-route": true }}>
      <TalentBackdrop />
      {children}
    </AtlasFrame>
  </>;
}
