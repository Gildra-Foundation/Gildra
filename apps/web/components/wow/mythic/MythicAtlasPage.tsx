import { ArrowDown, ArrowUpRight, Clock3 } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { MythicHubLinkButton as AtlasLinkButton } from "./hub/MythicHubLinkButton";
import { AtlasStats } from "@gildra/atlas-ui/AtlasStats";
import { DungeonCardGrid } from "./DungeonCardGrid";
import { MythicDataNotice } from "./MythicDataNotice";
import { MythicHubBackdrop } from "./MythicHubBackdrop";
import { MythicHubMotion } from "./MythicHubMotion";
import { MythicHubTimers } from "./MythicHubTimers";
import { mythicHubButtonLayout, mythicHubControlLayout } from "./hub/mythicHubControls";
import { dungeonRoutes, dungeonSlugs } from "@/lib/data/wow/mythic/dungeonRoutes";
import { mythicAtlasCopy } from "./mythicAtlasCopy";
import { trail } from "@/lib/routes/registry";
import styles from "./mythicAtlasPage.module.css";

export function MythicAtlasPage({ locale }: { locale: "ru" | "en" }) {
  const copy = mythicAtlasCopy[locale];
  const bossTotal = dungeonSlugs.reduce((sum, slug) => sum + dungeonRoutes[slug].stops.filter(stop => stop.kind === "boss").length, 0);
  const prefix = locale === "ru" ? "/ru" : "";
  return <AtlasFrame lang={locale} className={styles.page} still foot={false} dataAttributes={{ "data-mythic-hub": true }}>
    <MythicHubBackdrop />
    <MythicHubMotion />
    <div className={styles.hero} data-hub-hero>
      <AtlasHero align="start" className={styles.heroHeader}
        breadcrumbs={trail(locale, "mythicPlus")} breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={copy.eyebrow} title={copy.title} lede={copy.hubLede}
        actions={<div className={styles.actions} data-hub-actions>
          <span className={styles.actionSlot} style={mythicHubButtonLayout("ruby-life-pools")} data-mythic-asset-button="ruby-life-pools"><AtlasLinkButton className={styles.assetButton} href="#dungeons" variant="primary" iconAfter={<ArrowDown aria-hidden="true" />}>{copy.choose}</AtlasLinkButton></span>
          <span className={styles.actionSlot} style={mythicHubButtonLayout("voidscar-arena")} data-mythic-asset-button="voidscar-arena"><AtlasLinkButton className={styles.assetButton} href="#timers" icon={<Clock3 aria-hidden="true" />}>{copy.compare}</AtlasLinkButton></span>
        </div>} />
      <div className={styles.seasonFacts}>
        <AtlasStats label={copy.statsLabel} items={[
          { value: String(dungeonSlugs.length), label: copy.dungeons },
          { value: String(bossTotal), label: copy.bosses },
          { value: "S2", label: copy.season },
        ]} />
      </div>
    </div>
    <div className={styles.dungeons} data-hub-reveal>
      <AtlasSection id="dungeons" title={copy.listTitle} description={copy.chooseDescription}>
        <DungeonCardGrid locale={locale} hrefBase="/wow/mythic-plus/midnight-season-2" priority={false} />
      </AtlasSection>
    </div>
    <div className={styles.timerSection} data-hub-reveal><MythicHubTimers locale={locale} /></div>
    <div className={styles.metaLink} style={mythicHubControlLayout("voidscar-arena")} data-hub-reveal>
      <span><strong>{copy.metaTitle}</strong><span>{copy.metaDescription}</span></span>
      <span className={styles.metaAction} style={mythicHubButtonLayout("the-blinding-vale")} data-mythic-asset-button="the-blinding-vale"><AtlasLinkButton className={styles.assetButton} href={`${prefix}/wow/mythic-plus/meta`} iconAfter={<ArrowUpRight aria-hidden="true" />}>{copy.metaAction}</AtlasLinkButton></span>
    </div>
    <div className={styles.sourceNote} data-hub-reveal><MythicDataNotice locale={locale} /></div>
  </AtlasFrame>;
}
