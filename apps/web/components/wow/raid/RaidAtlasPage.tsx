import { ArrowDown, Archive } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { AtlasLinkButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasStats } from "@gildra/atlas-ui/AtlasStats";
import { trail } from "@/lib/routes/registry";
import { RaidHubBackdrop } from "./RaidHubBackdrop";
import { RaidHubCards } from "./RaidHubCards";
import { RaidHubMotion } from "./RaidHubMotion";
import { raidHubStats } from "./raidHubData";
import { raidAtlasCopy } from "./raidAtlasCopy";
import styles from "./raidAtlasPage.module.css";

export function RaidAtlasPage({ locale }: { locale: "ru" | "en" }) {
  const copy = raidAtlasCopy[locale];
  return <AtlasFrame lang={locale} className={styles.page} still foot={false} dataAttributes={{ "data-raid-hub": true }}>
    <RaidHubBackdrop />
    <RaidHubMotion />
    <div className={styles.hero} data-raid-hub-hero>
      <AtlasHero align="start" className={styles.heroHeader}
        breadcrumbs={trail(locale, "raids")} breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={copy.eyebrow} title={copy.title} lede={copy.hubLede}
        actions={<div className={styles.actions} data-raid-hub-actions>
          <AtlasLinkButton href="#current" variant="primary" iconAfter={<ArrowDown aria-hidden="true" />}>{copy.currentTitle}</AtlasLinkButton>
          <AtlasLinkButton href="#archive" icon={<Archive aria-hidden="true" />}>{copy.browseArchive}</AtlasLinkButton>
        </div>} />
      <div className={styles.seasonFacts}>
        <AtlasStats label={copy.statsLabel} items={[
          { value: String(raidHubStats.raids), label: copy.raids },
          { value: String(raidHubStats.bosses), label: copy.bosses },
          { value: "S2", label: copy.season },
        ]} />
      </div>
    </div>
    <div className={styles.current} data-raid-hub-reveal>
      <AtlasSection id="current" title={copy.currentTitle} description={copy.currentText}>
        <RaidHubCards locale={locale} section="current" />
      </AtlasSection>
    </div>
    <div className={styles.archive} data-raid-hub-reveal>
      <AtlasSection id="archive" title={copy.archiveTitle} description={copy.archiveText}>
        <RaidHubCards locale={locale} section="archive" />
      </AtlasSection>
    </div>
  </AtlasFrame>;
}
