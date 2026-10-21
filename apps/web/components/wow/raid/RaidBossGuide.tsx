import { ExternalLink, Hourglass } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasNotice, AtlasSection } from "@/components/atlas";
import { RaidBattlePlan } from "./RaidBattlePlan";
import { RaidMechanicList } from "./RaidMechanicList";
import { EncounterSwitcher, RaidPager } from "./RaidNavigation";
import type { RaidBoss, RaidDefinition } from "./midnightRaidData";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import { getBossStrategy } from "./raidStrategy";
import styles from "./raidGuide.module.css";
import { AtlasShareButton } from "@gildra/atlas-ui/AtlasShareButton";
import { getRaidReview } from "@/lib/data/raidReviews";
import { RaidReviewNotes } from "./RaidReviewNotes";
import { RaidSpellReference } from "./RaidSpellReference";
import { trail } from "@/lib/routes/registry";

/** Boss guide of a Midnight Season 1 raid: header, encounter switcher, battle plan, one mechanics list. */
export function RaidBossGuide({ raid, boss, locale }: { raid: RaidDefinition; boss: RaidBoss; locale: RaidLocale }) {
  const copy = raidGuideCopy[locale];
  const reviewed = Boolean(getRaidReview(raid.slug));
  const raidName = locale === "ru" ? raid.nameRu : raid.nameEn;
  const bossName = (entry: RaidBoss) => locale === "ru" ? entry.nameRu : entry.nameEn;
  const prefix = locale === "ru" ? "/ru" : "";
  const raidHref = `${prefix}/wow/raids/${raid.slug}`;
  const order = raid.bosses.indexOf(boss);
  const strategy = getBossStrategy(raid, boss);
  const encounters = raid.bosses.map((item) => ({ href: `${raidHref}/${item.slug}`, name: bossName(item), image: item.artwork, current: item.slug === boss.slug }));
  const hasMechanics = Boolean(strategy?.guide) || boss.mechanics.length > 0;

  return (
    <AtlasFrame lang={locale} art={boss.artwork} artPosition="center 28%" morphKey={`/wow/raids/${raid.slug}/${boss.slug}`}>
      <AtlasHero
        breadcrumbs={trail(locale, "raids", { label: raidName, href: raidHref }, { label: bossName(boss) })}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={<>{raidName} · {copy.encounterOf(order + 1, raid.bosses.length)}</>}
        title={<span data-testid="boss-title">{bossName(boss)}</span>}
        lede={locale === "ru" ? boss.descriptionRu : boss.descriptionEn}
        actions={<AtlasShareButton title={`${bossName(boss)} — ${raidName}`} locale={locale} />}
      />

      <EncounterSwitcher items={encounters} label={copy.encountersLabel} />

      <RaidReviewNotes raidSlug={raid.slug} bossSlug={boss.slug} locale={locale} />

      {strategy?.tactic ? (
        <AtlasSection id="plan" title={copy.planTitle} description={copy.planText}>
          <RaidBattlePlan tactic={strategy.tactic} bossArtwork={boss.artwork} locale={locale} />
        </AtlasSection>
      ) : reviewed ? null : (
        <AtlasSection>
          <AtlasNotice tone="caution" icon={<Hourglass />} title={copy.strategyPendingTitle}>{copy.strategyPendingText}</AtlasNotice>
        </AtlasSection>
      )}

      {hasMechanics ? (
        <AtlasSection id="mechanics" title={copy.mechanicsTitle} description={strategy?.guide ? copy.mechanicsText : copy.mechanicsJournalText}>
          <RaidMechanicList guide={strategy?.guide} journal={boss.mechanics} locale={locale} />
          <p className={styles.sources} data-text-links>
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

      <RaidSpellReference encounterId={boss.encounterId} exclude={[...boss.mechanics.map((ability) => ability.spellId), ...(strategy?.guide?.mechanics.flatMap((mechanic) => mechanic.spell ? [mechanic.spell.id] : []) ?? [])]} locale={locale} />

      <RaidPager label={copy.pagerLabel} back={{ href: raidHref, label: copy.allBosses(raidName) }} next={encounters[order + 1]} nextLabel={copy.nextBoss} />
    </AtlasFrame>
  );
}
