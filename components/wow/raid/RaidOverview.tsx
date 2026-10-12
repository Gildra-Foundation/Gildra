import { Hourglass, ListChecks } from "lucide-react";
import { AtlasCard, AtlasFrame, AtlasGrid, AtlasHero, AtlasNotice, AtlasSection } from "@/components/atlas";
import type { RaidDefinition } from "./midnightRaidData";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import { getBossStrategy, isRaidStrategyPublished } from "./raidStrategy";
import styles from "./raidGuide.module.css";

/** Raid page of a Midnight Season 1 raid: what the raid is and its encounters. */
export function RaidOverview({ raid, locale }: { raid: RaidDefinition; locale: RaidLocale }) {
  const copy = raidGuideCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const raidHref = `${prefix}/wow/raids/${raid.slug}`;
  const published = isRaidStrategyPublished(raid);
  const single = raid.bosses.length === 1;

  return (
    <AtlasFrame lang={locale} art={raid.slug === "the-voidspire" ? "/assets/wow/raids/midnight/backgrounds/the-voidspire-optimized.webp" : raid.artwork} artPosition="center 30%" tint={`${raid.accent}2e`}>
      <AtlasHero
        breadcrumbs={[{ label: copy.wow, href: `${prefix}/wow` }, { label: copy.raids, href: `${prefix}/wow/raids` }, { label: raid.nameEn }]}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={<>{copy.season(1)} · {raid.locationEn}</>}
        title={raid.nameEn}
        lede={locale === "ru" ? raid.descriptionRu : raid.descriptionEn}
      />

      <AtlasSection id="bosses" title={copy.bossesTitle} description={published ? copy.bossesText : copy.bossesTextPending}>
        <div className={styles.stack}>
          {published ? null : <AtlasNotice tone="caution" icon={<Hourglass />} title={copy.strategyPendingTitle}>{copy.strategyPendingText}</AtlasNotice>}
          <AtlasGrid min={360} as="ol">
            {raid.bosses.map((boss, index) => {
              const guide = getBossStrategy(raid, boss)?.guide;
              return (
                <li key={boss.slug} className={single ? styles.wide : undefined}>
                  <AtlasCard
                    href={`${raidHref}/${boss.slug}`}
                    layout={single ? "feature" : "vertical"}
                    image={{ src: boss.artwork, alt: "", priority: index < 4 }}
                    title={boss.nameEn}
                    description={locale === "ru" ? boss.descriptionRu : boss.descriptionEn}
                    meta={guide ? [{ icon: <ListChecks aria-hidden="true" />, label: copy.mechanicCount(guide.mechanics.length) }] : undefined}
                    cta={copy.openGuide}
                  />
                </li>
              );
            })}
          </AtlasGrid>
        </div>
      </AtlasSection>
    </AtlasFrame>
  );
}
