import { ArrowDown, Sun, Moon, Egg, Gem } from 'lucide-react';
import type { QueldanasGuideBoss } from '@/lib/data/wow/raid/queldanasGuide';
import { RaidPlaque } from './raidMaterial';
import { queldanasGuideCopy } from './queldanasGuideCopy';
import styles from './queldanasGuide.module.css';

export function QueldanasBattleDiagram({locale,difficulty,guide}: {locale:'ru'|'en';difficulty:'normal'|'heroic';guide:QueldanasGuideBoss}) {
  const plan = guide.diagram, phoenix = guide.id === 'beloren';
  return <RaidPlaque as="figure" raid="march-on-queldanas" className={`${styles.panel} ${styles.diagram}`} data-queldanas-diagram={guide.id}>
    <h2>{plan.title[locale]}</h2>
    <ol className={`${styles.battleSteps} ${phoenix ? styles.colorGroups : styles.crystalTasks}`}>{plan.steps.map((step,index) => <li key={step.id} data-queldanas-diagram-step={step.id}>
      <span className={styles.stepSymbol} aria-hidden="true">{phoenix ? index === 0 ? <Sun /> : index === 1 ? <Moon /> : <Egg /> : <Gem />}</span>
      <div><h3>{step.title[locale]}</h3><p>{step.body[locale]}</p></div>
      {phoenix && index < 2 && <ArrowDown className={styles.stepArrow} aria-hidden="true" />}
    </li>)}</ol>
    <p className={styles.diagramCaption}>{(difficulty === 'heroic' ? plan.heroicCaption : plan.caption)[locale]}</p>
    <figcaption>{queldanasGuideCopy[locale].relative}</figcaption>
  </RaidPlaque>;
}
