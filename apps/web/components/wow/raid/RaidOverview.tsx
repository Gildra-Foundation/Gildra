import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import type { RaidDefinition } from "@/lib/data/wow/raid/midnightRaidData";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import { VoidspirePageBackdrop } from "./VoidspirePageBackdrop";
import backdrop from "./voidspirePageBackdrop.module.css";
import { AtlasShareButton } from "@gildra/atlas-ui/AtlasShareButton";
import { raidSceneArt } from "@/lib/data/wow/raid/midnightRaidData";
import { RaidReviewNotes } from "./RaidReviewNotes";
import { trail } from "@/lib/routes/registry";
import { RaidPullSection } from "./RaidPullSection";
import { RaidBossChips } from "./RaidBossChips";

/** Raid page of a Midnight Season 1 raid: what the raid is and its encounters. */
export function RaidOverview({ raid, locale }: { raid: RaidDefinition; locale: RaidLocale }) {
  const copy = raidGuideCopy[locale];
  const raidName = locale === "ru" ? raid.nameRu : raid.nameEn;
  const prefix = locale === "ru" ? "/ru" : "";

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
      <AtlasSection id="bosses" title={copy.bossesTitle}>
        <RaidBossChips raid={raid.slug} label={copy.encountersLabel} bosses={raid.bosses.map((boss) => ({
          href: `${prefix}/wow/raids/${raid.slug}/${boss.slug}`,
          name: locale === "ru" ? boss.nameRu : boss.nameEn,
          artwork: boss.artwork,
        }))} />
      </AtlasSection>
      <RaidReviewNotes raidSlug={raid.slug} locale={locale} />
    </AtlasFrame>
  );
}
