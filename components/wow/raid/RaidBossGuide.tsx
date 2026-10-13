import { ExternalLink, Hourglass } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasNotice, AtlasSection } from "@/components/atlas";
import { RaidBattlePlan } from "./RaidBattlePlan";
import { RaidMechanicList } from "./RaidMechanicList";
import { EncounterSwitcher, RaidPager } from "./RaidNavigation";
import type { RaidBoss, RaidDefinition } from "./midnightRaidData";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import { getBossStrategy } from "./raidStrategy";
import styles from "./raidGuide.module.css";
import { AtlasShareButton } from "@/components/atlas/AtlasShareButton";

/** Boss guide of a Midnight Season 1 raid: header, encounter switcher, battle plan, one mechanics list. */
export function RaidBossGuide({ raid, boss, locale }: { raid: RaidDefinition; boss: RaidBoss; locale: RaidLocale }) {
  const copy = raidGuideCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const raidHref = `${prefix}/wow/raids/${raid.slug}`;
  const order = raid.bosses.indexOf(boss);
  const strategy = getBossStrategy(raid, boss);
  const encounters = raid.bosses.map((item) => ({ href: `${raidHref}/${item.slug}`, name: item.nameEn, image: item.artwork, current: item.slug === boss.slug }));
  const hasMechanics = Boolean(strategy?.guide) || boss.mechanics.length > 0;

  return (
    <AtlasFrame lang={locale} art={boss.artwork} artPosition="center 28%">
      <AtlasHero
        breadcrumbs={[
          { label: copy.wow, href: `${prefix}/wow` },
          { label: copy.raids, href: `${prefix}/wow/raids` },
          { label: raid.nameEn, href: raidHref },
          { label: boss.nameEn },
        ]}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={<>{raid.nameEn} · {copy.encounterOf(order + 1, raid.bosses.length)}</>}
        title={<span data-testid="boss-title">{boss.nameEn}</span>}
        lede={locale === "ru" ? boss.descriptionRu : boss.descriptionEn}
        actions={<AtlasShareButton title={`${boss.nameEn} — ${raid.nameEn}`} locale={locale} />}
      />

      <EncounterSwitcher items={encounters} label={copy.encountersLabel} />

      {strategy?.tactic ? (
        <AtlasSection id="plan" title={copy.planTitle} description={copy.planText}>
          <RaidBattlePlan tactic={strategy.tactic} bossArtwork={boss.artwork} locale={locale} />
        </AtlasSection>
      ) : (
        <AtlasSection>
          <AtlasNotice tone="caution" icon={<Hourglass />} title={copy.strategyPendingTitle}>{copy.strategyPendingText}</AtlasNotice>
        </AtlasSection>
      )}

      {hasMechanics ? (
        <AtlasSection id="mechanics" title={copy.mechanicsTitle} description={strategy?.guide ? copy.mechanicsText : copy.mechanicsJournalText}>
          <RaidMechanicList guide={strategy?.guide} journal={boss.mechanics} locale={locale} />
          <p className={styles.sources}>
            {strategy?.guide ? (
              <>
                {copy.strategySource(strategy.guide.sourceUpdatedAt, strategy.guide.checkedAt)}{" "}
                <a href={strategy.guide.sourceUrl} target="_blank" rel="noreferrer">{copy.strategySourceLink}<ExternalLink aria-hidden="true" /></a>{" "}
              </>
            ) : null}
            {copy.descriptionsSource}
          </p>
        </AtlasSection>
      ) : null}

      <RaidPager label={copy.encountersLabel} back={{ href: raidHref, label: copy.allBosses(raid.nameEn) }} next={encounters[order + 1]} nextLabel={copy.nextBoss} />
    </AtlasFrame>
  );
}
