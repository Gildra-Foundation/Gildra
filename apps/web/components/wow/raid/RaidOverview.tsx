import type { RaidPayload } from "@/lib/data/gamecontent/types";
import { Hourglass, ListChecks } from "lucide-react";
import { AtlasCard, AtlasFrame, AtlasHero, AtlasNotice, AtlasPath, AtlasSection } from "@/components/atlas";
import type { RaidBoss, RaidDefinition } from "./midnightRaidData";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import { getBossStrategy, isRaidStrategyPublished } from "./raidStrategy";
import styles from "./raidGuide.module.css";
import { VoidEye } from "./VoidEye";
import { AtlasShareButton } from "@gildra/atlas-ui/AtlasShareButton";
import { raidSceneArt } from "./midnightRaidData";
import { getRaidReview } from "@/lib/data/raidReviews";
import { RaidReviewNotes } from "./RaidReviewNotes";
import { trail } from "@/lib/routes/registry";

/** Raid page of a Midnight Season 1 raid: what the raid is and its encounters. */
export function RaidOverview({ raid, locale, content }: { raid: RaidDefinition; locale: RaidLocale; content?: RaidPayload }) {
  const copy = raidGuideCopy[locale];
  const reviewed = Boolean(getRaidReview(raid.slug, content?.reviews));
  const raidName = locale === "ru" ? raid.nameRu : raid.nameEn;
  const bossName = (entry: RaidBoss) => locale === "ru" ? entry.nameRu : entry.nameEn;
  const prefix = locale === "ru" ? "/ru" : "";
  const raidHref = `${prefix}/wow/raids/${raid.slug}`;
  const published = content ? raid.bosses.some((boss) => Boolean(content.strategies[boss.slug])) : isRaidStrategyPublished(raid);
  const single = raid.bosses.length === 1;
  const mechanicsMeta = (boss: RaidBoss) => {
    const guide = (content ? content.strategies[boss.slug] : getBossStrategy(raid, boss))?.guide;
    return guide ? [{ icon: <ListChecks aria-hidden="true" />, label: copy.mechanicCount(guide.mechanics.length) }] : undefined;
  };

  return (
    <AtlasFrame
      lang={locale}
      morphKey={`/wow/raids/${raid.slug}`}
      art={raidSceneArt(raid)}
      artPosition="center 30%"
      tint={`${raid.accent}2e`}
      // The Voidspire's eye is alive: a shader of our own over the painting's void.
      artLayer={raid.slug === "the-voidspire" ? <VoidEye imageSize={[1920, 734]} focus={[0.5, 0.3]} eye={[0.601, 0.2956]} eyeRadius={18} /> : undefined}
    >
      <AtlasHero
        breadcrumbs={trail(locale, "raids", { label: raidName })}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={<>{content ? content.manifest.seasons.find((entry) => entry.canonicalSlug === content.catalog.entries.find((entry) => entry.slug === raid.slug)?.season)?.names[locale] : copy.season(1)} · {locale === "ru" ? raid.locationRu : raid.locationEn}</>}
        title={raidName}
        lede={locale === "ru" ? raid.descriptionRu : raid.descriptionEn}
        actions={<AtlasShareButton title={raidName} locale={locale} />}
      />

      <RaidReviewNotes raidSlug={raid.slug} locale={locale} reviews={content?.reviews} />

      <AtlasSection id="bosses" title={copy.bossesTitle} description={published || reviewed ? copy.bossesText : copy.bossesTextPending}>
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
      </AtlasSection>
    </AtlasFrame>
  );
}
