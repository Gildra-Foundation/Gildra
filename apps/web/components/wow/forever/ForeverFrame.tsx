import type { ReactNode } from "react";
import { AtlasFrame } from "@/components/atlas";
import { atlasLegal } from "@/components/atlas/AtlasFrame";
import { GildraCrest } from "@/components/brand/GildraCrest";
import { p, type Lang } from "@/lib/i18n-paths";
import { instanceCopy } from "./instanceCopy";
import { ForeverLanguageLinks } from "./ForeverLanguageLinks";
import styles from "@/components/atlas/AtlasFrame.module.css";

/** Keep the shared footer material and controls, with explicit version destinations. */
export function ForeverFrame({ lang, children }: { lang: Lang; children: ReactNode }) {
  const t = instanceCopy[lang];
  const footer = {
    legal: atlasLegal(lang),
    brand: <a className={styles.seal} href={p(lang, "/wow/forever")} aria-label="WowArcana — Forever"><GildraCrest height={56} className={styles.crest} /><span>WowArcana</span></a>,
    links: <>
      <div className={styles.footerGroup}><h3>Forever</h3><ul>
        <li><a href={p(lang, "/wow/forever")}>{t.overview}</a></li>
        <li><a href={p(lang, "/wow/forever/dungeons")}>{t.dungeons}</a></li>
        <li><a href={p(lang, "/wow/forever/raids")}>{t.raids}</a></li>
      </ul></div>
      <div className={styles.footerGroup}><h3>{t.versions}</h3><ul><li><a href={p(lang, "/wow")}>Retail</a></li></ul></div>
      <div className={styles.footerGroup}><h3>WowArcana</h3><ul><li><a href={p(lang, "/privacy")}>{t.privacy}</a></li></ul></div>
    </>,
    language: <ForeverLanguageLinks lang={lang} />,
  };
  return <AtlasFrame lang={lang} scene="wow" footer={footer}>{children}</AtlasFrame>;
}
