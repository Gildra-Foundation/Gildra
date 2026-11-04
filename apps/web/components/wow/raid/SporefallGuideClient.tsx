'use client';

import Image from 'next/image';
import { useEffect, useRef, useSyncExternalStore, type MouseEvent } from 'react';
import { ArrowDown, Leaf } from 'lucide-react';
import { AtlasDisclosure } from '@gildra/atlas-ui/AtlasDisclosure';
import { AtlasField } from '@gildra/atlas-ui/AtlasField';
import { AtlasSegmented } from '@gildra/atlas-ui/AtlasSegmented';
import { lessMotion, subscribeSiteMotion } from '@gildra/atlas-ui/motionPreference';
import { sporefallGuide } from '@/lib/data/wow/raid/sporefallGuide';
import { roleBasics, voidspireBeginnerTerms } from '@/lib/data/wow/raid/voidspireBeginnerGuide';
import type { CounterKind } from '@/lib/data/wow/raid/voidspireVideoGuide';
import { guideCounters, guideRole, guideSpecs } from './voidspireGuideCounters';
import { voidspireGuideCopy } from './voidspireGuideCopy';
import { VoidspireSpecPicker } from './VoidspireSpecPicker';
import { VoidspireGuideHint } from './VoidspireGuideHint';
import { raidGuideMaterial } from './raidGuideMaterial';
import { RaidPlaque } from './raidMaterial';
import { SporefallBattleDiagram } from './SporefallBattleDiagram';
import { sporefallGuideCopy } from './sporefallGuideCopy';
import styles from './sporefallGuide.module.css';

type Locale = 'ru' | 'en';
type Difficulty = 'normal' | 'heroic';
function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback); window.addEventListener('popstate', callback);
  return () => { window.removeEventListener('hashchange', callback); window.removeEventListener('popstate', callback); };
}
const snapshot = () => window.location.hash;
const serverSnapshot = () => '';

export function SporefallGuideClient({locale}: {locale: Locale}) {
  const root = useRef<HTMLDivElement>(null);
  const hash = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const query = new URLSearchParams(hash.slice(1));
  const specId = guideSpecs.some(spec => spec.id === Number(query.get('spec'))) ? Number(query.get('spec')) : 0;
  const difficulty: Difficulty = query.get('difficulty') === 'heroic' ? 'heroic' : 'normal';
  const role = guideRole(specId), ru = locale === 'ru', heroic = difficulty === 'heroic';
  const t = voidspireGuideCopy[locale], copy = sporefallGuideCopy[locale], guide = sporefallGuide;
  const select = (update: {spec?: number; difficulty?: Difficulty}) => {
    const next = new URLSearchParams(window.location.hash.slice(1));
    next.set('boss', 'rotmire'); next.set('spec', String(update.spec ?? specId)); next.set('difficulty', update.difficulty ?? difficulty);
    window.history.pushState(window.history.state, '', `#${next}`); window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  const jump = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); const target = document.getElementById(`sporefall-${id}`);
    target?.focus({preventScroll:true}); target?.scrollIntoView({behavior:'instant',block:'start'});
  };
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const media = ['(prefers-reduced-motion: reduce)','(prefers-reduced-transparency: reduce)','(forced-colors: active)'].map(value => window.matchMedia(value));
    const sync = () => {
      const reduced = lessMotion() || media.some(item => item.matches) || !!element.closest('[data-motion="reduced"], [data-ui-motion="reduce"], [data-transparency="reduced"]');
      element.dataset.sporeMotion = reduced ? 'static' : 'ready';
      if (reduced) element.querySelectorAll('[data-flip-id]').forEach(node => node.getAnimations().filter(animation => animation.id === 'ui-flip').forEach(animation => animation.cancel()));
    };
    sync();
    const unsubscribe = subscribeSiteMotion(sync), observer = new MutationObserver(sync);
    for(let node: HTMLElement | null = element; node; node = node.parentElement) observer.observe(node,{attributes:true,attributeFilter:['data-motion','data-ui-motion','data-transparency']});
    media.forEach(item => item.addEventListener('change',sync));
    return () => { unsubscribe(); observer.disconnect(); media.forEach(item => item.removeEventListener('change',sync)); };
  }, []);
  const adds = guide.adds.filter(add => heroic || !add.heroicOnly);
  return <div className={styles.guide} style={raidGuideMaterial('sporefall')} ref={root} data-sporefall-guide data-difficulty={difficulty} data-spec={specId}>
    <RaidPlaque raid="sporefall" className={`${styles.panel} ${styles.intro}`}>
      <span className={styles.spores} aria-hidden="true">{Array.from({length:8}, (_,index) => <i key={index} />)}</span>
      <header className={styles.bossHeader}><Image src="/assets/wow/raids/sporefall/rotmire-journal.png" width={128} height={64} alt="" /><div><p className={styles.eyebrow}>{copy.scope}</p><h2>{guide.name[locale]}</h2><p className={styles.goal}>{guide.goal[locale]}</p></div></header>
      <nav className={styles.priorities} aria-label={t.priorities}>{guide.priorities.map((priority,index) => <a key={priority.id} href={`#boss=rotmire&spec=${specId}&difficulty=${difficulty}&mechanic=${priority.id}`} onClick={event => jump(event,priority.id)}><span>{index+1}</span><strong>{priority.title[locale]}</strong><ArrowDown aria-hidden="true" /></a>)}</nav>
    </RaidPlaque>
    <div className={styles.briefing}>
      <RaidPlaque as="section" raid="sporefall" className={`${styles.panel} ${styles.personal}`} aria-labelledby="sporefall-role-title">
        <div className={styles.toolbar}><VoidspireSpecPicker raid="sporefall" locale={locale} value={specId} onChange={spec => select({spec})} /><AtlasField label={t.difficulty}><AtlasSegmented aria-label={t.difficulty} value={difficulty} onValueChange={value => select({difficulty:value as Difficulty})} options={[{value:'normal',label:t.normal},{value:'heroic',label:t.heroic}]} /></AtlasField></div>
        <h2 id="sporefall-role-title">{role ? t.roles[role] : copy.yourJob}</h2>
        {role ? <><p className={styles.roleDefinition}>{roleBasics[role][locale]}</p><p data-role-position={role}>{guide.roles[role].position[locale]}</p><ul className={styles.roleActions}>{guide.roles[role].actions.map(action => <li key={action.en}>{action[locale]}</li>)}</ul>{heroic && guide.roles[role].heroic && <p className={styles.heroic}>{guide.roles[role].heroic[locale]}</p>}</> : <><div className={styles.roleBasics}>{(['tank','healer','melee','ranged'] as const).map(item => <p key={item}>{roleBasics[item][locale]}</p>)}</div></>}
      </RaidPlaque>
      <SporefallBattleDiagram locale={locale} difficulty={difficulty} />
    </div>
    <RaidPlaque as="section" raid="sporefall" className={`${styles.panel} ${styles.flow}`} aria-labelledby="sporefall-flow-title"><h2 id="sporefall-flow-title">{copy.flow}</h2><ol>{guide.flow.map((step,index) => <li key={step.id}><span>{index+1}</span><div><h3>{step.title[locale]}</h3><p>{(heroic && step.heroicBody ? step.heroicBody : step.body)[locale]}</p></div></li>)}</ol></RaidPlaque>
    <RaidPlaque as="section" raid="sporefall" className={`${styles.panel} ${styles.mechanics}`} aria-labelledby="sporefall-mechanics-title"><h2 id="sporefall-mechanics-title">{t.mechanics}</h2><div className={styles.tableHead} aria-hidden="true"><span>{t.signal}</span><span>{t.response}</span></div><ol>{guide.mechanics.filter(item => heroic || !item.heroicOnly).map(mechanic => <li key={mechanic.id} id={`sporefall-${mechanic.id}`} tabIndex={-1} data-guide-mechanic={mechanic.id} data-sporefall-mechanic={mechanic.id}>
      <div className={styles.signal}><div className={styles.spellTitle}>{mechanic.spellIcon && <Image src={mechanic.spellIcon} width={36} height={36} alt="" />}<h3>{mechanic.name[locale]}</h3></div><p>{mechanic.signal[locale]}</p></div>
      <div className={styles.response}><span className={styles.mobileLabel}>{t.response}</span><p>{mechanic.response[locale]}</p>{role && mechanic.roleActions?.[role] && <p className={styles.personalAction} data-role-action={role}><strong>{t.roles[role]}: </strong>{mechanic.roleActions[role]![locale]}</p>}{heroic && mechanic.heroic && <p className={styles.heroic}><strong>{t.heroic}: </strong>{mechanic.heroic[locale]}</p>}{specId > 0 && (!mechanic.counterRoles?.length || (role && mechanic.counterRoles.includes(role))) && <CounterTools locale={locale} specId={specId} kinds={mechanic.counters} />}</div>
    </li>)}</ol></RaidPlaque>
    <section className={styles.enemies} aria-labelledby="sporefall-adds-title"><h2 id="sporefall-adds-title">{copy.adds}</h2><div className={styles.addGrid}>{adds.map(add => <RaidPlaque as="article" key={add.id} raid="sporefall" className={`${styles.panel} ${styles.add}`} data-sporefall-add={add.npcId}>
      <header>{add.portrait && <Image src={add.portrait} width={96} height={112} alt="" />}<div>{add.heroicOnly && <p className={styles.eyebrow}>{t.heroic}</p>}<h3><VoidspireGuideHint raid="sporefall" locale={locale} title={add.name[locale]} portrait={add.portrait} source={`https://www.wowhead.com/${ru ? 'ru/' : ''}npc=${add.npcId}`} detail={<div className={styles.hintFacts}><p>{add.description[locale]}</p><p><strong>{t.response}: </strong>{add.action[locale]}</p>{add.cast && <><p><strong>{t.cast}: </strong>{add.cast.name[locale]}</p><p>{add.cast.action[locale]}</p></>}</div>} /></h3></div></header>
      <p>{add.description[locale]}</p><p className={styles.personalAction}>{add.action[locale]}</p>{add.cast && <div className={styles.enemyCast}><span>{t.cast}</span><VoidspireGuideHint raid="sporefall" locale={locale} title={add.cast.name[locale]} source={`https://www.wowhead.com/${ru ? 'ru/' : ''}spell=${add.cast.spellId}`} detail={<div className={styles.hintFacts}><p>{add.cast.description[locale]}</p><p>{add.cast.action[locale]}</p></div>} /><p>{add.cast.action[locale]}</p>{specId > 0 && <CounterTools locale={locale} specId={specId} kinds={['interrupt']} />}</div>}<p className={styles.death}><Leaf aria-hidden="true" />{add.death[locale]}</p>
    </RaidPlaque>)}</div></section>
    <footer className={styles.sources}><AtlasDisclosure summary={t.sources}><ul>{guide.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></li>)}</ul></AtlasDisclosure></footer>
  </div>;
}

function CounterTools({locale,specId,kinds}: {locale:Locale;specId:number;kinds:CounterKind[]}) {
  const t = voidspireGuideCopy[locale], ru = locale === 'ru';
  return <div className={styles.tools}>{kinds.map(kind => {
    const tools = guideCounters(kind,specId), target = kind === 'interrupt' ? sporefallGuide.adds.find(add => add.cast) : undefined;
    return <div key={kind} data-counter-kind={kind}><strong>{kind === 'interrupt' || kind === 'defend' || kind === 'aoe' ? <VoidspireGuideHint raid="sporefall" title={kind === 'interrupt' ? t.yourKick : t.kinds[kind]} locale={locale} detail={<p>{voidspireBeginnerTerms[kind === 'interrupt' ? 'interrupt' : 'defensive'].detail[locale]}</p>} /> : t.kinds[kind]}</strong>{tools.length ? <ul>{tools.map(({spell,talent,note}) => <li key={spell.id}><VoidspireGuideHint raid="sporefall" title={spell.name[locale]} locale={locale} spellId={spell.id} source={`https://www.wowhead.com/${ru ? 'ru/' : ''}spell=${spell.id}`} detail={<div className={styles.hintFacts}>{target?.cast ? <><p><strong>{t.target}: </strong>{target.name[locale]}</p><p><strong>{t.cast}: </strong>{target.cast.name[locale]}</p><p>{target.cast.action[locale]}</p></> : <p>{t.kinds[kind]}</p>}{talent && <p>{t.talent}</p>}{note && <p>{note[locale]}</p>}</div>}><Image src={spell.iconUrl} width={24} height={24} alt="" />{spell.name[locale]}{talent && <small> · {t.talent}</small>}</VoidspireGuideHint></li>)}</ul> : <p>{t.noTool[kind]}</p>}</div>;
  })}</div>;
}
