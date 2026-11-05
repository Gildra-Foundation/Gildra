'use client';

import Image from 'next/image';
import { useEffect, useSyncExternalStore, type MouseEvent } from 'react';
import { ArrowDown, Sparkles } from 'lucide-react';
import { AtlasDisclosure } from '@gildra/atlas-ui/AtlasDisclosure';
import { AtlasTabs } from '@gildra/atlas-ui/AtlasTabs';
import { lessMotion, subscribeSiteMotion } from '@gildra/atlas-ui/motionPreference';
import { AtlasField } from '@gildra/atlas-ui/AtlasField';
import { AtlasSegmented } from '@gildra/atlas-ui/AtlasSegmented';
import { venomousGuide } from '@/lib/data/wow/raid/venomousGuide';
import type { VenomousGuideBoss } from '@/lib/data/wow/raid/venomousGuide.types';
import { voidspireBeginnerTerms } from '@/lib/data/wow/raid/voidspireBeginnerGuide';
import type { CounterKind } from '@/lib/data/wow/raid/voidspireVideoGuide';
import { guideCounters, guideRole, guideSpecs } from './voidspireGuideCounters';
import { voidspireGuideCopy } from './voidspireGuideCopy';
import { VoidspireSpecPicker } from './VoidspireSpecPicker';
import { VoidspireGuideHint } from './VoidspireGuideHint';
import { raidGuideMaterial } from './raidGuideMaterial';
import { RaidPlaque } from './raidMaterial';
import { VenomousBattleDiagram } from './VenomousBattleDiagram';
import { venomousGuideCopy } from './venomousGuideCopy';
import styles from './venomousGuide.module.css';

type Locale = 'ru' | 'en';
type Difficulty = 'normal' | 'heroic';
function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback); window.addEventListener('popstate', callback);
  return () => { window.removeEventListener('hashchange', callback); window.removeEventListener('popstate', callback); };
}
const snapshot = () => window.location.hash;
const serverSnapshot = () => '';
const railQuery = '(min-width: 1101px)';
function subscribeRail(callback: () => void) {
  const media = matchMedia(railQuery); media.addEventListener('change',callback);
  return () => media.removeEventListener('change',callback);
}
const railSnapshot = () => matchMedia(railQuery).matches;
const railServerSnapshot = () => false;

export function VenomousGuideClient({locale}: {locale: Locale}) {
  const vertical = useSyncExternalStore(subscribeRail,railSnapshot,railServerSnapshot);
  const hash = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const query = new URLSearchParams(hash.slice(1));
  const specId = guideSpecs.some(spec => spec.id === Number(query.get('spec'))) ? Number(query.get('spec')) : 0;
  const difficulty: Difficulty = query.get('difficulty') === 'heroic' ? 'heroic' : 'normal';
  const role = guideRole(specId), ru = locale === 'ru', heroic = difficulty === 'heroic';
  const t = voidspireGuideCopy[locale], copy = venomousGuideCopy[locale];
  const guide = venomousGuide.bosses.find(boss => boss.id === query.get('boss')) ?? venomousGuide.bosses[0];
  useEffect(() => {
    const list = document.querySelector<HTMLElement>('[data-venomous-guide] [role="tablist"]');
    const selected = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !selected) return;
    const rail = list.getBoundingClientRect(), button = selected.getBoundingClientRect();
    if (vertical && (button.top < rail.top || button.bottom > rail.bottom)) list.scrollTo({top:list.scrollTop+button.top-rail.top,behavior:'instant'});
    if (!vertical && (button.left < rail.left || button.right > rail.right)) list.scrollTo({left:list.scrollLeft+button.left-rail.left-(rail.width-button.width)/2,behavior:'instant'});
  },[guide.id,vertical]);
  const select = (update: {boss?: string; spec?: number; difficulty?: Difficulty}) => {
    const next = new URLSearchParams(window.location.hash.slice(1));
    next.set('boss', update.boss ?? guide.id); next.set('spec', String(update.spec ?? specId)); next.set('difficulty', update.difficulty ?? difficulty);
    window.history.pushState(window.history.state, '', `#${next}`); window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  const jump = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); const target = document.getElementById(`venomous-${id}`);
    target?.focus({preventScroll:true}); target?.scrollIntoView({behavior:'instant',block:'start'});
  };
  const adds = guide.adds.filter(add => heroic || !add.heroicOnly);
  const content = <div className={styles.encounter} data-venomous-encounter={guide.id}>
    <RaidPlaque raid="venomous-abyss" className={`${styles.panel} ${styles.intro}`}>
      <header className={styles.bossHeader}>{guide.image && <Image src={guide.image} width={176} height={100} alt="" />}<div><p className={styles.eyebrow}>{copy.scope}</p><h2>{guide.name[locale]}</h2><p className={styles.goal}>{guide.goal[locale]}</p></div></header>
      <nav className={styles.priorities} aria-label={t.priorities}>{guide.priorities.map((priority,index) => <a key={priority.id} href={`#boss=${guide.id}&spec=${specId}&difficulty=${difficulty}&mechanic=${priority.id}`} onClick={event => jump(event,priority.id)}><span>{index+1}</span><strong>{priority.title[locale]}</strong><ArrowDown aria-hidden="true" /></a>)}</nav>
    </RaidPlaque>
    <div className={styles.briefing}>
      <RaidPlaque as="section" raid="venomous-abyss" className={`${styles.panel} ${styles.personal}`} aria-labelledby="venomous-role-title">
        <div className={styles.toolbar}><VoidspireSpecPicker raid="venomous-abyss" locale={locale} value={specId} onChange={spec => select({spec})} /><AtlasField label={t.difficulty}><AtlasSegmented aria-label={t.difficulty} value={difficulty} onValueChange={value => select({difficulty:value as Difficulty})} options={[{value:'normal',label:t.normal},{value:'heroic',label:t.heroic}]} /></AtlasField></div>
        <h2 id="venomous-role-title">{role ? t.roles[role] : copy.yourJob}</h2>
        {role ? <><p data-role-position={role}>{guide.roles[role].position[locale]}</p><ul className={styles.roleActions}>{guide.roles[role].actions.map(action => <li key={action.en}>{action[locale]}</li>)}</ul>{heroic && guide.roles[role].heroic && <p className={styles.heroic}>{guide.roles[role].heroic[locale]}</p>}</> : null}
      </RaidPlaque>
      <VenomousBattleDiagram locale={locale} difficulty={difficulty} guide={guide} />
    </div>
    <RaidPlaque as="section" raid="venomous-abyss" className={`${styles.panel} ${styles.flow}`} aria-labelledby="venomous-flow-title"><h2 id="venomous-flow-title">{copy.flow}</h2><ol>{guide.flow.map((step,index) => <li key={step.id}><span>{index+1}</span><div><h3>{step.title[locale]}</h3><p>{(heroic && step.heroicBody ? step.heroicBody : step.body)[locale]}</p></div></li>)}</ol></RaidPlaque>
    <RaidPlaque as="section" raid="venomous-abyss" className={`${styles.panel} ${styles.mechanics}`} aria-labelledby="venomous-mechanics-title"><h2 id="venomous-mechanics-title">{t.mechanics}</h2><div className={styles.tableHead} aria-hidden="true"><span>{t.signal}</span><span>{t.response}</span></div><ol>{guide.mechanics.filter(item => heroic || !item.heroicOnly).map(mechanic => <li key={mechanic.id} id={`venomous-${mechanic.id}`} tabIndex={-1} data-guide-mechanic={mechanic.id} data-venomous-mechanic={mechanic.id}>
      <div className={styles.signal}><div className={styles.spellTitle}>{mechanic.spellIcon && <Image src={mechanic.spellIcon} width={36} height={36} alt="" />}<h3>{mechanic.name[locale]}</h3></div><p>{mechanic.signal[locale]}</p></div>
      <div className={styles.response}><span className={styles.mobileLabel}>{t.response}</span><p>{mechanic.response[locale]}</p>{role && mechanic.roleActions?.[role] && <p className={styles.personalAction} data-role-action={role}><strong>{t.roles[role]}: </strong>{mechanic.roleActions[role]![locale]}</p>}{heroic && mechanic.heroic && <p className={styles.heroic}><strong>{t.heroic}: </strong>{mechanic.heroic[locale]}</p>}{specId > 0 && (!mechanic.counterRoles?.length || (role && mechanic.counterRoles.includes(role))) && <CounterTools locale={locale} specId={specId} kinds={mechanic.counters} instruction={mechanic.response[locale]} target={guide.adds.find(add => add.id === mechanic.targetId)} />}</div>
    </li>)}</ol></RaidPlaque>
    {adds.length > 0 && <section className={styles.enemies} aria-labelledby="venomous-adds-title"><h2 id="venomous-adds-title">{copy.adds}</h2><div className={styles.addGrid}>{adds.map(add => <RaidPlaque as="article" key={add.id} raid="venomous-abyss" className={`${styles.panel} ${styles.add}`} data-venomous-add={add.npcId}>
      <header>{add.portrait && <span className={styles.addPortrait}><Image src={add.portrait} width={96} height={112} alt="" /></span>}<div>{add.heroicOnly && <p className={styles.eyebrow}>{t.heroic}</p>}<h3><VoidspireGuideHint raid="venomous-abyss" locale={locale} title={add.name[locale]} portrait={add.portrait} source={`https://www.wowhead.com/${ru ? 'ru/' : ''}npc=${add.npcId}`} detail={<div className={styles.hintFacts}><p>{add.description[locale]}</p><p><strong>{t.response}: </strong>{add.action[locale]}</p>{add.cast && <><p><strong>{t.cast}: </strong>{add.cast.name[locale]}</p><p>{add.cast.action[locale]}</p></>}</div>} /></h3></div></header>
      <p>{add.description[locale]}</p><p className={styles.personalAction}>{add.action[locale]}</p>{add.cast && <div className={styles.enemyCast}><span>{t.cast}</span><VoidspireGuideHint raid="venomous-abyss" locale={locale} title={add.cast.name[locale]} source={`https://www.wowhead.com/${ru ? 'ru/' : ''}spell=${add.cast.spellId}`} detail={<div className={styles.hintFacts}><p>{add.cast.description[locale]}</p><p>{add.cast.action[locale]}</p></div>} /><p>{add.cast.action[locale]}</p>{specId > 0 && guide.mechanics.some(mechanic => mechanic.targetId === add.id && mechanic.counters.includes('interrupt')) && <CounterTools locale={locale} specId={specId} kinds={['interrupt']} target={add} />}</div>}<p className={styles.death}><Sparkles aria-hidden="true" />{add.death[locale]}</p>
    </RaidPlaque>)}</div></section>}
    <RaidPlaque as="footer" raid="venomous-abyss" className={`${styles.panel} ${styles.sources}`}><AtlasDisclosure summary={t.sources}><ul>{guide.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></li>)}</ul></AtlasDisclosure></RaidPlaque>
  </div>;
  return <div className={styles.guide} style={raidGuideMaterial('venomous-abyss')} data-venomous-guide data-boss={guide.id} data-difficulty={difficulty} data-spec={specId} data-guide-motion="static">
    <VenomousMotion encounter={guide.id} vertical={vertical} />
    <AtlasTabs orientation={vertical ? 'vertical' : 'horizontal'} className={styles.bossTabs} label={copy.bosses} value={guide.id} onChange={boss => select({boss})} tabs={venomousGuide.bosses.map((boss,index) => ({
      id: boss.id,
      label: <span className={styles.bossTabLabel}>{boss.image && <Image src={boss.image} width={48} height={40} alt="" />}<span><small>{copy.encounter} {index+1}</small><strong>{boss.name[locale]}</strong></span></span>,
      content: boss.id === guide.id ? content : null,
    }))} />
  </div>;
}

function CounterTools({locale,specId,kinds,target,instruction}: {locale:Locale;specId:number;kinds:CounterKind[];instruction?:string;target?: VenomousGuideBoss['adds'][number]}) {
  const t = voidspireGuideCopy[locale], ru = locale === 'ru';
  return <div className={styles.tools}>{kinds.map(kind => {
    const tools = guideCounters(kind,specId);
    return <div key={kind} data-counter-kind={kind}><strong>{kind === 'interrupt' || kind === 'defend' || kind === 'aoe' ? <VoidspireGuideHint raid="venomous-abyss" title={kind === 'interrupt' ? t.yourKick : t.kinds[kind]} locale={locale} detail={<p>{voidspireBeginnerTerms[kind === 'interrupt' ? 'interrupt' : 'defensive'].detail[locale]}</p>} /> : t.kinds[kind]}</strong>{tools.length ? <ul>{tools.map(({spell,talent,note}) => <li key={spell.id}><VoidspireGuideHint raid="venomous-abyss" title={spell.name[locale]} locale={locale} spellId={spell.id} source={`https://www.wowhead.com/${ru ? 'ru/' : ''}spell=${spell.id}`} detail={<div className={styles.hintFacts}>{kind === 'interrupt' && target?.cast ? <><p><strong>{t.target}: </strong>{target.name[locale]}</p><p><strong>{t.cast}: </strong>{target.cast.name[locale]}</p><p>{target.cast.action[locale]}</p></> : <p>{instruction ?? t.kinds[kind]}</p>}{talent && <p>{t.talent}</p>}{note && <p>{note[locale]}</p>}</div>}><Image src={spell.iconUrl} width={24} height={24} alt="" />{spell.name[locale]}{talent && <small> · {t.talent}</small>}</VoidspireGuideHint></li>)}</ul> : <p>{t.noTool[kind]}</p>}</div>;
  })}</div>;
}

/** Keep the shared selection spring and local illumination inside all motion preferences. */
function VenomousMotion({encounter,vertical}: {encounter:string;vertical:boolean}) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-venomous-guide]');
    if (!root) return;
    const media = ['(prefers-reduced-motion: reduce)', '(prefers-reduced-transparency: reduce)', '(forced-colors: active)'].map(query => matchMedia(query));
    const sync = () => {
      const reduced = lessMotion() || media.some(query => query.matches) || !!root.closest('[data-motion="reduced"], [data-ui-motion="reduce"], [data-transparency="reduced"]');
      root.dataset.guideMotion = reduced ? 'static' : 'ready';
      if (reduced) root.querySelectorAll('[data-flip-id]').forEach(element => element.getAnimations().filter(animation => animation.id === 'ui-flip').forEach(animation => animation.cancel()));
    };
    const observer = new MutationObserver(sync);
    for (let element:HTMLElement|null=root; element; element=element.parentElement) observer.observe(element,{attributes:true,attributeFilter:['data-motion','data-ui-motion','data-transparency']});
    const unsubscribe = subscribeSiteMotion(sync);
    media.forEach(query => query.addEventListener('change',sync));
    sync();
    return () => { observer.disconnect(); unsubscribe(); media.forEach(query => query.removeEventListener('change',sync)); };
  },[encounter,vertical]);
  return null;
}
