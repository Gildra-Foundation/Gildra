import { AtlasFrame, AtlasHero, AtlasSection } from '@/components/atlas';
import { AtlasShareButton } from '@gildra/atlas-ui/AtlasShareButton';
import type { RaidDefinition } from '@/lib/data/wow/raid/midnightRaidData';
import { trail, trailLabel } from '@/lib/routes/registry';
import { VoidspirePageBackdrop } from './VoidspirePageBackdrop';
import { VoidspireGuideClient } from './VoidspireGuideClient';
import { getRaidPullPlan } from './raidPullPlans.server';
import { voidspireGuideCopy } from './voidspireGuideCopy';
import backdrop from './voidspirePageBackdrop.module.css';
import styles from './voidspireGuide.module.css';

export function VoidspireRaidGuide({ raid, locale }: { raid: RaidDefinition; locale: 'ru' | 'en' }) {
  const name = locale === 'ru' ? raid.nameRu : raid.nameEn;
  const bosses = raid.bosses.map(({slug, nameRu, nameEn, artwork}) => ({slug, nameRu, nameEn, artwork}));
  return <AtlasFrame lang={locale} className={backdrop.page} morphKey="/wow/raids/the-voidspire" tint={`${raid.accent}2e`}>
    <VoidspirePageBackdrop />
    <AtlasHero className={styles.pageHero} breadcrumbsLabel={trailLabel(locale)} breadcrumbs={trail(locale, 'raids', { label:name })} title={name} eyebrow={voidspireGuideCopy[locale].season} toolbar={<AtlasShareButton title={name} locale={locale} />} />
    <AtlasSection id="encounters" className={styles.encountersSection}><VoidspireGuideClient bosses={bosses} locale={locale} pulls={getRaidPullPlan(raid.slug) ?? null} /></AtlasSection>
  </AtlasFrame>;
}
