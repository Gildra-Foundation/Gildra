import { ArrowLeft, ExternalLink } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { trail } from "@/lib/routes/registry";

import { RaidLinkButton, RaidPlaque } from "./raidMaterial";
import { kithixCopy, kithixRaid, kithixSource } from "./kithixRaidData";
import styles from "./raidPage.module.css";
import artStyles from "./kithixPage.module.css";

export function KithixPage({ locale }: { locale: "en" | "ru" }) {
  const copy = kithixCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  return <AtlasFrame lang={locale} still art={kithixRaid.artwork} artShade="deep" className={`${styles.page} ${artStyles.page}`} dataAttributes={{ "data-raid-page": kithixRaid.slug }}>
    <AtlasHero
      breadcrumbs={[...trail(locale, "raids"), { label: kithixRaid.names[locale] }]}
      eyebrow={copy.eyebrow}
      title={kithixRaid.names[locale]}
      lede={kithixRaid.descriptions[locale]}
      actions={<RaidLinkButton raid={kithixRaid.slug} className={artStyles.button} href={`${prefix}/wow/raids`} icon={<ArrowLeft aria-hidden="true" />}>{copy.back}</RaidLinkButton>}
    />
    <AtlasSection id="kithix" title={copy.boss}>
      <RaidPlaque raid={kithixRaid.slug} className={`${styles.plaque} ${artStyles.plaque}`}>
        <p>{copy.bossText}</p>
      </RaidPlaque>
    </AtlasSection>
    <AtlasSection title={copy.format}>
      <RaidPlaque raid={kithixRaid.slug} className={`${styles.plaque} ${artStyles.plaque}`}>
        <dl className={styles.facts}>
          <div><dt>{copy.difficulties}</dt><dd>{copy.difficultyText}</dd></div>
          <div><dt>{copy.mythic}</dt><dd>{copy.mythicText}</dd></div>
        </dl>
      </RaidPlaque>
      <p className={styles.quiet}><a href={kithixSource} target="_blank" rel="noreferrer">{copy.source}<ExternalLink aria-hidden="true" /></a></p>
    </AtlasSection>
  </AtlasFrame>;
}
