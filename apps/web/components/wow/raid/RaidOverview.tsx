import { Hourglass, ListChecks } from "lucide-react";
import { AtlasCard, AtlasFrame, AtlasHero, AtlasNotice, AtlasPath, AtlasSection } from "@/components/atlas";
import type { RaidBoss, RaidDefinition } from "@/lib/data/wow/raid/midnightRaidData";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import { getBossStrategy, isRaidStrategyPublished } from "@/lib/data/wow/raid/raidStrategy";
import styles from "./raidGuide.module.css";
import { VoidspirePageBackdrop } from "./VoidspirePageBackdrop";
import backdrop from "./voidspirePageBackdrop.module.css";
import { AtlasShareButton } from "@gildra/atlas-ui/AtlasShareButton";
import { raidSceneArt } from "@/lib/data/wow/raid/midnightRaidData";
import { getRaidReview } from "@/lib/data/raidReviews";
import { RaidReviewNotes } from "./RaidReviewNotes";
import { trail } from "@/lib/routes/registry";
import { RaidPullSection } from "./RaidPullSection";

/** Raid page of a Midnight Season 1 raid: what the raid is and its encounters. */
export function RaidOverview({ raid, locale }: { raid: RaidDefinition; locale: RaidLocale }) {
  const copy = raidGuideCopy[locale];
  const raidName = locale === "ru" ? raid.nameRu : raid.nameEn;
  const planner = raid.slug === "the-voidspire";

  return (
    <AtlasFrame
      lang={locale}
      className={raid.slug === "the-voidspire" ? backdrop.page : undefined}
      morphKey={`/wow/raids/${raid.slug}`}
      art={raid.slug === "the-voidspire" ? undefined : raidSceneArt(raid)}
      artPosition="center 30%"
      tint={`${raid.accent}2e`}
    >
      {raid.slug === "the-voidspire" && <VoidspirePageBackdrop />}
      <AtlasHero
        breadcrumbs={trail(locale, "raids", { label: raidName })}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={<>{copy.season(1)} · {locale === "ru" ? raid.locationRu : raid.locationEn}</>}
        title={raidName}
        lede={locale === "ru" ? raid.descriptionRu : raid.descriptionEn}
        actions={<AtlasShareButton title={raidName} locale={locale} />}
      />

      <RaidPullSection slug={raid.slug} locale={locale} />
      {!planner && <><RaidReviewNotes raidSlug={raid.slug} locale={locale} /><RaidBossCatalog raid={raid} locale={locale} /></>}
    </AtlasFrame>
  );
}

function RaidBossCatalog({ raid, locale }: { raid: RaidDefinition; locale: RaidLocale }) {
  const copy = raidGuideCopy[locale];
  const reviewed = Boolean(getRaidReview(raid.slug));
  const published = isRaidStrategyPublished(raid);
  const single = raid.bosses.length === 1;
  const raidHref = `${locale === "ru" ? "/ru" : ""}/wow/raids/${raid.slug}`;
  const bossName = (entry: RaidBoss) => locale === "ru" ? entry.nameRu : entry.nameEn;
  const mechanicsMeta = (boss: RaidBoss) => {
    const guide = getBossStrategy(raid, boss)?.guide;
    return guide ? [{ icon: <ListChecks aria-hidden="true" />, label: copy.mechanicCount(guide.mechanics.length) }] : undefined;
  };
  return <AtlasSection id="bosses" title={copy.bossesTitle} description={published || reviewed ? copy.bossesText : copy.bossesTextPending}>
        <div className={styles.stack}>
          {published || reviewed ? null : <AtlasNotice tone="caution" icon={<Hourglass />} title={copy.strategyPendingTitle}>{copy.strategyPendingText}</AtlasNotice>}
          {single ? (
            <AtlasCard
              href={`${raidHref}/${raid.bosses[0].slug}`}
              morph
              layout="feature"
              image={{ src: raid.bosses[0].artwork, alt: "", priority: true }}
              title={bossName(raid.bosses[0])}
              description={locale === "ru" ? raid.bosses[0].descriptionRu : raid.bosses[0].descriptionEn}
              meta={mechanicsMeta(raid.bosses[0])}
              cta={copy.openGuide}
            />
          ) : (
            // The encounters in the order the raid meets them.
            <AtlasPath
              morph
              label={copy.bossesTitle}
              steps={raid.bosses.map((boss) => ({
                href: `${raidHref}/${boss.slug}`,
                title: bossName(boss),
                image: { src: boss.artwork, position: "center 30%" },
                description: locale === "ru" ? boss.descriptionRu : boss.descriptionEn,
                meta: mechanicsMeta(boss),
                cta: copy.openGuide,
              }))}
            />
          )}
        </div>
      </AtlasSection>;
}
