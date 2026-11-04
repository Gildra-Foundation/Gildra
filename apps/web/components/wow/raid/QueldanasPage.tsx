import { AtlasFrame, AtlasHero, AtlasSection } from '@/components/atlas';
import { AtlasShareButton } from '@gildra/atlas-ui/AtlasShareButton';
import { trail } from '@/lib/routes/registry';
import { queldanasGuide } from '@/lib/data/wow/raid/queldanasGuide';
import { QueldanasPageBackdrop } from './QueldanasPageBackdrop';
import { QueldanasGuideClient } from './QueldanasGuideClient';
import type { RaidLocale } from './raidGuideCopy';
import { queldanasGuideCopy } from './queldanasGuideCopy';
import styles from './queldanasGuide.module.css';

/** Two encounters, one page: personal positioning, battle order and responses. */
export function QueldanasPage({ locale }: { locale: RaidLocale }) {
  const name = queldanasGuide.raidName[locale];
  return <AtlasFrame lang={locale} className={styles.page} still foot={false}>
    <QueldanasPageBackdrop />
    <AtlasHero className={styles.pageHero} breadcrumbs={trail(locale, 'raids', {label:name})} title={name}
      eyebrow={queldanasGuideCopy[locale].context} toolbar={<AtlasShareButton title={name} locale={locale} />} />
    <AtlasSection className={styles.guideSection} id="encounter"><QueldanasGuideClient locale={locale} /></AtlasSection>
  </AtlasFrame>;
}
