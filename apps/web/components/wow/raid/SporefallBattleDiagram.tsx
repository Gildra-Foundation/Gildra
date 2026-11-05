import Image from 'next/image';
import { ArrowUp, Shield, Users, Sprout, MoveRight } from 'lucide-react';
import { RaidPlaque } from './raidMaterial';
import { sporefallGuide } from '@/lib/data/wow/raid/sporefallGuide';
import { sporefallGuideCopy } from './sporefallGuideCopy';
import styles from './sporefallGuide.module.css';

type Props = { locale: 'ru' | 'en'; difficulty: 'normal' | 'heroic' };
export function SporefallBattleDiagram({locale, difficulty}: Props) {
  const copy = sporefallGuideCopy[locale], heroic = difficulty === 'heroic';
  return <RaidPlaque as="figure" raid="sporefall" className={`${styles.panel} ${styles.diagram}`} data-sporefall-diagram={difficulty}>
    <h2>{copy.positioning}</h2>
    <div className={styles.zones}>
      <div className={styles.battleZone}>
        <span className={styles.zoneLabel}>{copy.gathering}</span>
        <div className={styles.bossPosition}><Image src="/assets/wow/raids/sporefall/rotmire-journal.png" width={128} height={64} alt="" /><strong>{sporefallGuide.name[locale]}</strong><span><Shield aria-hidden="true" />{copy.tank}</span></div>
        {heroic && <div className={styles.capPosition}><Sprout aria-hidden="true" /><strong>{copy.sporecap}</strong><small>{copy.stationary}</small></div>}
        <div className={styles.addApproach}><Users aria-hidden="true" /><span>{copy.chasedPlayer}</span><ArrowUp aria-hidden="true" /></div>
      </div>
      <div className={styles.edgeZone}><MoveRight aria-hidden="true" /><strong>{copy.vinesEdge}</strong><span>{copy.distance}</span><small>{copy.ground}</small></div>
    </div>
    <figcaption>{(heroic ? sporefallGuide.diagram.heroicCaption : sporefallGuide.diagram.caption)[locale]}</figcaption>
  </RaidPlaque>;
}
