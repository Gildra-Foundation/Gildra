import { Hourglass, ListChecks } from "lucide-react";
import { AtlasCard, AtlasFrame, AtlasHero, AtlasNotice, AtlasPath, AtlasSection } from "@/components/atlas";
import type { RaidBoss, RaidDefinition } from "./midnightRaidData";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import { getBossStrategy, isRaidStrategyPublished } from "./raidStrategy";
import styles from "./raidGuide.module.css";
import { VoidEye } from "./VoidEye";
import { AtlasShareButton } from "@/components/atlas/AtlasShareButton";

/** Raid page of a Midnight Season 1 raid: what the raid is and its encounters. */
export function RaidOverview({ raid, locale }: { raid: RaidDefinition; locale: RaidLocale }) {
  const copy = raidGuideCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const raidHref = `${prefix}/wow/raids/${raid.slug}`;
  const published = isRaidStrategyPublished(raid);
  const single = raid.bosses.length === 1;
  const mechanicsMeta = (boss: RaidBoss) => {
    const guide = getBossStrategy(raid, boss)?.guide;
    return guide ? [{ icon: <ListChecks aria-hidden="true" />, label: copy.mechanicCount(guide.mechanics.length) }] : undefined;
  };

  return (
    <AtlasFrame
      lang={locale}
      art={raid.slug === "the-voidspire" ? "/assets/wow/raids/midnight/backgrounds/the-voidspire-scene.webp" : raid.artwork}
      artPosition="center 30%"
      tint={`${raid.accent}2e`}
      // The Voidspire's eye is alive: a shader of our own over the painting's void.
      artLayer={raid.slug === "the-voidspire" ? <VoidEye imageSize={[1920, 734]} focus={[0.5, 0.3]} eye={[0.601, 0.2956]} eyeRadius={18} /> : undefined}
    >
      <AtlasHero
        breadcrumbs={[{ label: copy.wow, href: `${prefix}/wow` }, { label: copy.raids, href: `${prefix}/wow/raids` }, { label: raid.nameEn }]}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={<>{copy.season(1)} · {raid.locationEn}</>}
        title={raid.nameEn}
        lede={locale === "ru" ? raid.descriptionRu : raid.descriptionEn}
        actions={<AtlasShareButton title={raid.nameEn} locale={locale} />}
      />

      <AtlasSection id="bosses" title={copy.bossesTitle} description={published ? copy.bossesText : copy.bossesTextPending}>
        <div className={styles.stack}>
          {published ? null : <AtlasNotice tone="caution" icon={<Hourglass />} title={copy.strategyPendingTitle}>{copy.strategyPendingText}</AtlasNotice>}
          {single ? (
            <AtlasCard
              href={`${raidHref}/${raid.bosses[0].slug}`}
              layout="feature"
              image={{ src: raid.bosses[0].artwork, alt: "", priority: true }}
              title={raid.bosses[0].nameEn}
              description={locale === "ru" ? raid.bosses[0].descriptionRu : raid.bosses[0].descriptionEn}
              meta={mechanicsMeta(raid.bosses[0])}
              cta={copy.openGuide}
            />
          ) : (
            // The encounters in the order the raid meets them.
            <AtlasPath
              label={copy.bossesTitle}
              steps={raid.bosses.map((boss) => ({
                href: `${raidHref}/${boss.slug}`,
                title: boss.nameEn,
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
