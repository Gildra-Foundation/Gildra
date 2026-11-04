import { ArrowRightLeft, Layers, Users } from 'lucide-react';
import { dreamriftGuide } from '@/lib/data/wow/raid/dreamriftGuide';
import { RaidPlaque } from './raidMaterial';
import { dreamriftGuideCopy } from './dreamriftGuideCopy';
import styles from './dreamriftGuide.module.css';

/** A task diagram: the two realms overlap; these boxes do not claim map coordinates. */
export function DreamriftBattleDiagram({locale}: {locale:'ru'|'en'; difficulty?:'normal'|'heroic'}) {
  const plan = dreamriftGuide.realmPlan, copy = dreamriftGuideCopy[locale];
  return <RaidPlaque as="figure" raid="the-dreamrift" className={`${styles.panel} ${styles.diagram}`} data-dreamrift-realms>
    <h2>{plan.title[locale]}</h2><p className={styles.realmSetup}><Users aria-hidden="true" />{plan.setup[locale]}</p>
    <div className={styles.realmZones}>{plan.realms.map(realm => <div key={realm.id} className={styles.realm} data-dreamrift-realm={realm.id}>
      <Layers aria-hidden="true" /><h3>{realm.title[locale]}</h3><p>{realm.body[locale]}</p>
    </div>)}</div>
    <h3 className={styles.rotationTitle}><ArrowRightLeft aria-hidden="true" />{copy.groupOrder}</h3>
    <ol className={styles.rotation} data-dreamrift-groups>{plan.rotation.map((step,index) => <li key={step.id} data-dreamrift-rotation={step.id}><span>{index+1}</span><div><strong>{step.title[locale]}</strong><p>{step.body[locale]}</p></div></li>)}</ol>
    <p className={styles.returnNote}>{plan.returnNote[locale]}</p><figcaption>{copy.relative}</figcaption>
  </RaidPlaque>;
}
