import Image from 'next/image';
import { Shield, Users, UserRound, Crosshair, ArrowRight, ArrowUp, CircleOff } from 'lucide-react';
import { voidspireBeginnerGuides } from '@/lib/data/wow/raid/voidspireBeginnerGuide';
import { voidspireGuideCopy } from './voidspireGuideCopy';
import styles from './voidspireGuide.module.css';

/** Relative relationships for one named moment; deliberately not an arena map. */
export function VoidspireBattleDiagram({ slug, locale, artwork }: { slug: string; locale: 'ru' | 'en'; artwork: string }) {
  const t = voidspireGuideCopy[locale];
  const d = t.diagramLabels;
  const diagram = voidspireBeginnerGuides[slug].diagram;
  const group = <span className={styles.diagramActor}><Users size={22} aria-hidden="true" /><span>{t.group}</span></span>;
  const tank = <span className={styles.diagramActor}><Shield size={22} aria-hidden="true" /><span>{t.tank}</span></span>;
  const boss = (label: string, portrait = true) => <span className={styles.diagramEnemy}>{portrait ? <Image src={artwork} width={44} height={44} alt="" /> : <Crosshair size={28} aria-hidden="true" />}<span>{label}</span></span>;
  const arrow = <ArrowRight className={styles.diagramArrow} size={24} aria-hidden="true" />;
  return <figure className={styles.diagram} data-battle-diagram={slug}>
    <figcaption><h3>{diagram.title[locale]}</h3></figcaption>
    <div className={styles.diagramStage} aria-hidden="true">
      {slug === 'imperator-averzian' && <div className={styles.collapseDiagram}><div className={styles.sharedCircle}><span className={styles.diagramEnemy}><Crosshair size={28} /><span>{d.voidshaper}</span></span><div className={styles.diagramLine}>{tank}{group}</div></div><span className={styles.diagramLabel}>{d.sharedCircle}</span></div>}
      {slug === 'vorasius' && <><div className={styles.diagramLine}>{boss(t.boss)}{tank}</div><div className={styles.diagramLine}><span className={styles.diagramActor}><Crosshair size={22} /><span>{d.fixated}</span></span>{arrow}<span className={styles.diagramWall}>{t.wall}<small>{d.bug}</small></span></div><div className={styles.diagramLine}>{group}<span className={styles.diagramLabel}>{d.clearPath}</span></div></>}
      {slug === 'fallen-king-salhadaar' && <><div className={styles.diagramLine}><span className={styles.diagramOrbs}>● ●<small>{d.orbs}</small></span>{arrow}<span className={styles.diagramLabel}>{d.killBeforeBoss}</span></div><div className={styles.diagramEdge}><span className={styles.diagramLabel}>{t.edge}</span>{boss(t.boss)}{tank}</div><div className={styles.diagramLine}>{group}<CircleOff className={styles.diagramArrow} size={22} /><span className={styles.diagramActor}><Crosshair size={22} /><span>{d.marksAway}</span></span></div></>}
      {slug === 'vaelgor-ezzorak' && <><div className={styles.dragonsDiagram}><div>{tank}<ArrowUp className={styles.diagramArrow} size={22} />{boss(d.vaelgor, false)}<span className={styles.diagramLabel}>{d.tail}</span></div><div className={styles.diagramFlank}>{group}<span className={styles.diagramLabel}>{t.safeSide}</span></div><div>{tank}<ArrowUp className={styles.diagramArrow} size={22} />{boss(d.ezzorak, false)}<span className={styles.diagramLabel}>{d.tail}</span></div></div><p className={styles.diagramDistance}>{d.dragonsDistance}</p></>}
      {slug === 'lightblinded-vanguard' && <><div className={styles.diagramLine}><span className={styles.diagramAura}>{boss(d.activeBoss, false)}<small>{d.aura}</small></span><span className={styles.diagramDistance}>40+<small>{d.yards}</small></span>{boss(d.otherBosses, false)}</div><div className={styles.diagramLine}>{group}<span className={styles.diagramLabel}>{d.outsidePeace}</span></div></>}
      {slug === 'crown-of-the-cosmos' && <><div className={styles.sentinelsDiagram}>{[d.focusSentinel,d.sentinel,d.sentinel].map((label,index) => <div key={index}>{boss(label, false)}<span className={styles.diagramActor}><UserRound size={18} /><small>{d.meleePlayer}</small></span>{index === 0 && group}</div>)}</div><p className={styles.diagramDistance}>{d.threeSentinels}</p></>}
    </div>
    <p className={styles.diagramCaption}>{diagram.caption[locale]}</p>
  </figure>;
}
