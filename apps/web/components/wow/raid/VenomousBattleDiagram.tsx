import { ArrowRight, ArrowRightLeft, Bomb, Box, CircleDot, Crosshair, Droplets, Egg, Flame, Footprints, Shield, Skull, Swords, Triangle, Users, Waves, Wind, type LucideIcon } from 'lucide-react';
import type { VenomousGuideBoss } from '@/lib/data/wow/raid/venomousGuide.types';
import { RaidPlaque } from './raidMaterial';
import { venomousGuideCopy } from './venomousGuideCopy';
import styles from './venomousGuide.module.css';

const stepIcons: Record<string, LucideIcon[]> = {
  'nekzali-the-soulcoiler': [Shield, Footprints, Users],
  'entombed-sentinels': [Users, CircleDot, ArrowRightLeft],
  'the-lost-explorers': [Box, Bomb, Users],
  'vashnik-the-malignant': [Droplets, Swords, Shield],
  sszorak: [Wind, Users, Crosshair],
  'the-twin-fangs': [Shield, Footprints, Users],
  'the-coiled-altar': [Users, Shield, Droplets],
  ulatek: [Egg, Footprints, Users],
};

function DiagramNode({icon: Icon, label, tone}: {icon:LucideIcon;label:string;tone?:'safe'|'danger'|'circle'|'platform'}) {
  return <span className={styles.diagramNode} data-tone={tone}><span><Icon /></span><small>{label}</small></span>;
}

/** These are relationships, never inferred arena coordinates or fixed compass directions. */
function PositionSketch({id, locale}: {id:string;locale:'ru'|'en'}) {
  const l = venomousGuideCopy[locale].diagramLabels;
  const arrow = <ArrowRight className={styles.relationArrow} />;
  let nodes;
  switch (id) {
    case 'nekzali-the-soulcoiler': nodes = <><DiagramNode icon={Skull} label={l.skeletons} />{arrow}<DiagramNode icon={Shield} label={l.intercept} tone="safe" />{arrow}<DiagramNode icon={Waves} label={l.well} /></>; break;
    case 'entombed-sentinels': nodes = <><DiagramNode icon={Users} label={l.green} tone="safe" /><span className={styles.separation} /><DiagramNode icon={Users} label={l.red} tone="danger" /></>; break;
    case 'the-lost-explorers': nodes = <>{[1,2,3].map(n => <DiagramNode key={n} icon={Users} label={`${l.group} ${n}`} tone="circle" />)}</>; break;
    case 'vashnik-the-malignant': nodes = <><DiagramNode icon={Droplets} label={l.fountains} />{arrow}<DiagramNode icon={Flame} label={l.slimes} tone="danger" />{arrow}<DiagramNode icon={CircleDot} label={l.cavity} /></>; break;
    case 'sszorak': nodes = <><DiagramNode icon={Wind} label={l.wind} />{arrow}<DiagramNode icon={Users} label={l.raid} tone="safe" />{arrow}<DiagramNode icon={Crosshair} label={l.cyst} tone="danger" /></>; break;
    case 'the-twin-fangs': nodes = <><DiagramNode icon={Shield} label={`${l.tank} 1`} tone="safe" /><span className={styles.separation} /><DiagramNode icon={Shield} label={`${l.tank} 2`} tone="safe" /></>; break;
    case 'the-coiled-altar': nodes = <><DiagramNode icon={Users} label={l.rear} tone="safe" /><DiagramNode icon={Skull} label={l.boss} /><DiagramNode icon={Triangle} label={l.front} tone="danger" /></>; break;
    case 'ulatek': nodes = <><DiagramNode icon={Swords} label={l.melee} tone="platform" /><span className={styles.separation} /><DiagramNode icon={Crosshair} label={l.ranged} tone="platform" /></>; break;
    default: return null;
  }
  return <div className={styles.positionSketch} data-venomous-position-sketch={id} aria-hidden="true">{nodes}</div>;
}

/** Relative jobs and safe-space relationships; the source does not provide map coordinates. */
export function VenomousBattleDiagram({locale,difficulty,guide}: {locale:'ru'|'en';difficulty:'normal'|'heroic';guide:VenomousGuideBoss}) {
  const plan = guide.diagram;
  return <RaidPlaque as="figure" raid="venomous-abyss" className={`${styles.panel} ${styles.diagram}`} data-venomous-diagram={guide.id}>
    <h2>{plan.title[locale]}</h2>
    <PositionSketch id={guide.id} locale={locale} />
    <ol className={styles.battleSteps}>{plan.steps.map((step,index) => { const Icon = stepIcons[guide.id]?.[index] ?? CircleDot; return <li key={step.id} data-venomous-diagram-step={step.id}>
      <span className={styles.stepSymbol} aria-hidden="true"><Icon /></span>
      <div><h3>{step.title[locale]}</h3><p>{step.body[locale]}</p></div>
    </li>; })}</ol>
    <p className={styles.diagramCaption}>{(difficulty === 'heroic' ? plan.heroicCaption : plan.caption)[locale]}</p>
  </RaidPlaque>;
}
