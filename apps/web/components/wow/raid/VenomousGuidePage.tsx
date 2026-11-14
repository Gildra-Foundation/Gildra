import { AtlasFrame, AtlasHero, AtlasSection } from '@/components/atlas';
import { AtlasShareButton } from '@gildra/atlas-ui/AtlasShareButton';
import { trail, trailLabel } from '@/lib/routes/registry';
import { venomousGuide } from '@/lib/data/wow/raid/venomousGuide';
import { VenomousPageBackdrop } from './VenomousPageBackdrop';
import { VenomousGuideClient } from './VenomousGuideClient';
import type { RaidLocale } from './raidGuideCopy';
import { venomousGuideCopy } from './venomousGuideCopy';
import styles from './venomousGuide.module.css';

/** Eight encounters, one page: personal positioning, battle order and responses. */
export function VenomousGuidePage({ locale }: { locale: RaidLocale }) {
  const name = venomousGuide.raidName[locale];
  return <AtlasFrame lang={locale} className={styles.page} still foot={false}>
    <VenomousPageBackdrop />
    <AtlasHero className={styles.pageHero} breadcrumbsLabel={trailLabel(locale)} breadcrumbs={trail(locale, 'raids', {label:name})} title={name}
      eyebrow={venomousGuideCopy[locale].context} toolbar={<AtlasShareButton title={name} locale={locale} />} />
    <AtlasSection className={styles.guideSection} id="encounter"><VenomousGuideClient locale={locale} /></AtlasSection>
  </AtlasFrame>;
}
