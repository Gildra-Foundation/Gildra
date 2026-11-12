import { AtlasFrame, AtlasHero, AtlasSection } from '@/components/atlas';
import { AtlasShareButton } from '@gildra/atlas-ui/AtlasShareButton';
import { trail, trailLabel } from '@/lib/routes/registry';
import { sporefallGuide } from '@/lib/data/wow/raid/sporefallGuide';
import { SporefallPageBackdrop } from './SporefallPageBackdrop';
import { SporefallGuideClient } from './SporefallGuideClient';
import type { RaidLocale } from './raidGuideCopy';
import { sporefallGuideCopy } from './sporefallGuideCopy';
import styles from './sporefallGuide.module.css';

/** One encounter, one page: personal positioning, battle order and responses. */
export function SporefallPage({ locale }: { locale: RaidLocale; view?: 'raid' | 'boss' }) {
  const name = sporefallGuide.raidName[locale];
  return <AtlasFrame lang={locale} className={styles.page} still foot={false}>
    <SporefallPageBackdrop />
    <AtlasHero className={styles.pageHero} breadcrumbsLabel={trailLabel(locale)} breadcrumbs={trail(locale, 'raids', {label:name})} title={name}
      eyebrow={sporefallGuideCopy[locale].context} toolbar={<AtlasShareButton title={name} locale={locale} />} />
    <AtlasSection className={styles.guideSection} id="encounter"><SporefallGuideClient locale={locale} /></AtlasSection>
  </AtlasFrame>;
}
