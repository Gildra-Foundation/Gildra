import { AtlasFrame, AtlasHero, AtlasSection } from '@/components/atlas';
import { AtlasShareButton } from '@gildra/atlas-ui/AtlasShareButton';
import { trail, trailLabel } from '@/lib/routes/registry';
import { dreamriftGuide } from '@/lib/data/wow/raid/dreamriftGuide';
import { DreamriftPageBackdrop } from './DreamriftPageBackdrop';
import { DreamriftGuideClient } from './DreamriftGuideClient';
import type { RaidLocale } from './raidGuideCopy';
import { dreamriftGuideCopy } from './dreamriftGuideCopy';
import styles from './dreamriftGuide.module.css';

/** One encounter, one page: personal positioning, battle order and responses. */
export function DreamriftPage({ locale }: { locale: RaidLocale }) {
  const name = dreamriftGuide.raidName[locale];
  return <AtlasFrame lang={locale} className={styles.page} still foot={false}>
    <DreamriftPageBackdrop />
    <AtlasHero className={styles.pageHero} breadcrumbsLabel={trailLabel(locale)} breadcrumbs={trail(locale, 'raids', {label:name})} title={name}
      eyebrow={dreamriftGuideCopy[locale].context} toolbar={<AtlasShareButton title={name} locale={locale} />} />
    <AtlasSection className={styles.guideSection} id="encounter"><DreamriftGuideClient locale={locale} /></AtlasSection>
  </AtlasFrame>;
}
