'use client';

import Image from 'next/image';
import { useEffect, useRef, useSyncExternalStore, type MouseEvent } from 'react';
import { AtlasTabs } from '@gildra/atlas-ui/AtlasTabs';
import { AtlasSegmented } from '@gildra/atlas-ui/AtlasSegmented';
import { AtlasField } from '@gildra/atlas-ui/AtlasField';
import { AtlasDisclosure } from '@gildra/atlas-ui/AtlasDisclosure';
import { voidspireVideoGuides } from '@/lib/data/wow/raid/voidspireVideoGuide';
import { voidspireBeginnerGuides, roleBasics as voidspireRoleBasics, voidspireFactSources } from '@/lib/data/wow/raid/voidspireBeginnerGuide';
import { raidHubControlLayout } from './raidHubControls';
import { VoidspireGuideMotion } from './VoidspireGuideMotion';
import { VoidspireBattleDiagram } from './VoidspireBattleDiagram';
import { voidspireRolePositions } from '@/lib/data/wow/raid/voidspireRoleTactics';
import { guideRole, guideSpecs } from './voidspireGuideCounters';
import { guideHash, readGuideSelection, type GuideSelection } from './voidspireGuideState';
import { voidspireGuideCopy } from './voidspireGuideCopy';
import { VoidspireSpecPicker } from './VoidspireSpecPicker';
import { VoidspireGuideMechanics } from './VoidspireGuideMechanics';
import { RaidPlaque } from './raidMaterial';
import { RaidPullWorkspace } from './RaidPullWorkspace';
import type { RaidPullPlan } from './raidPullTypes';
import styles from './voidspireGuide.module.css';

type Boss = { slug: string; nameRu: string; nameEn: string; artwork: string };
function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback);
  window.addEventListener('popstate', callback);
  return () => { window.removeEventListener('hashchange', callback); window.removeEventListener('popstate', callback); };
}
const snapshot = () => window.location.hash;
const serverSnapshot = () => '';
function subscribeWide(callback: () => void) {
  const media = window.matchMedia('(min-width: 1100px)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
const wideSnapshot = () => window.matchMedia('(min-width: 1100px)').matches;

export function VoidspireGuideClient({ bosses, locale, pulls }: { bosses: Boss[]; locale: 'ru' | 'en'; pulls: RaidPullPlan | null }) {
  const wide = useSyncExternalStore(subscribeWide, wideSnapshot, () => false);
  const guideRef = useRef<HTMLDivElement>(null);
  const hash = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const selection = readGuideSelection(hash);
  useEffect(() => {
    if (!wide) {
      const tab = guideRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${selection.boss}"]`);
      const rail = tab?.parentElement;
      if (tab && rail) rail.scrollLeft = Math.max(0, tab.offsetLeft - rail.offsetLeft - (rail.clientWidth - tab.clientWidth) / 2);
    }
  }, [selection.boss, wide]);
  const t = voidspireGuideCopy[locale];
  const guide = voidspireVideoGuides.find(item => item.slug === selection.boss) ?? voidspireVideoGuides[0];
  const role = guideRole(selection.specId);
  const beginner = voidspireBeginnerGuides[guide.slug];
  const position = role ? voidspireRolePositions[guide.slug]?.[role] : undefined;
  const boss = bosses.find(item => item.slug === guide.slug)!;
  const select = (update: Partial<GuideSelection>) => {
    const next = { ...selection, ...update };
    if (voidspireVideoGuides.find(item => item.slug === next.boss)?.heroicOnly) next.difficulty = 'heroic';
    const pull = new URLSearchParams(window.location.hash.slice(1)).get('raid-pull');
    const nextHash = guideHash(next) + (next.boss === 'trash' && selection.boss === 'trash' && pull ? `&raid-pull=${encodeURIComponent(pull)}` : '');
    window.history.pushState(window.history.state, '', nextHash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  const openBossLink = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest('a');
    if (!link || link.target === '_blank' || link.hasAttribute('data-guide-jump')) return;
    const url = new URL(link.href, window.location.href);
    const slug = new URLSearchParams(url.hash.slice(1)).get('boss');
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || !bosses.some(item => item.slug === slug)) return;
    event.preventDefault();
    select({boss:slug!});
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${slug}"]`)?.focus({preventScroll:true});
    event.currentTarget.scrollIntoView({block:'start', behavior:'instant'});
  };
  const specPicker = <VoidspireSpecPicker locale={locale} value={selection.specId} onChange={specId => select({specId})} />;
  const scrollToMechanic = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const row = document.getElementById(`guide-mechanic-${id}`);
    row?.focus({preventScroll:true});
    row?.scrollIntoView({block:'start', behavior:'instant'});
  };
  const content = <article className={styles.encounter}>
    <RaidPlaque raid="the-voidspire" className={styles.plaque} data-guide-reveal>
      <header className={styles.bossHeader}>
        <Image className={styles.bossArt} src={boss.artwork} width={320} height={190} sizes="(max-width: 700px) 88px, 190px" alt="" />
        <div><p className={styles.eyebrow}>{String(bosses.indexOf(boss) + 1).padStart(2, '0')} / 06{guide.heroicOnly ? ` · ${t.scope}` : ''}</p>
          <h2>{locale === 'ru' ? boss.nameRu : boss.nameEn}</h2>
          <p className={styles.summary}><span>{t.goal}</span>{beginner.goal[locale]}</p>
        </div>
      </header>
      <nav className={styles.priorities} aria-label={t.priorities}>
        {beginner.priorities.map((priority, index) => <a key={priority.mechanicId} data-guide-jump href={`#${guideHash(selection).slice(1)}&mechanic=${priority.mechanicId}`} onClick={event => scrollToMechanic(event, priority.mechanicId)}><span aria-hidden="true">{index + 1}</span><strong>{priority.title[locale]}</strong><span aria-hidden="true">↓</span></a>)}
      </nav>
    </RaidPlaque>
    <div className={styles.briefing}>
      <RaidPlaque as="section" raid="the-voidspire" className={`${styles.materialPanel} ${styles.positioning}`} aria-labelledby="guide-position-title" data-guide-reveal>
        <div className={styles.toolbar}>
          {specPicker}
          {!guide.heroicOnly && <AtlasField label={t.difficulty}><AtlasSegmented aria-label={t.difficulty} value={selection.difficulty} onValueChange={value => select({ difficulty: value as GuideSelection['difficulty'] })} options={['normal','heroic'].map(value => ({ value, label: t[value as 'normal' | 'heroic'] }))} /></AtlasField>}
        </div>
        {role ? <p className={styles.roleDefinition}>{voidspireRoleBasics[role][locale]}</p> : <div className={styles.roleBasics}>{(['tank','healer','melee','ranged'] as const).map(item => <p key={item}>{voidspireRoleBasics[item][locale]}</p>)}</div>}
        <h3 id="guide-position-title">{t.positioning}{role && <small className={styles.roleLabel}>{t.roles[role]}</small>}</h3>
        <p data-role-position={role ?? 'all'}>{(position ?? beginner.startingPosition)[locale]}</p>
        {guideSpecs.find(spec => spec.id === selection.specId)?.classId === 13 && <p className={styles.rangeNote}>{t.evokerRange}</p>}
      </RaidPlaque>
      <VoidspireBattleDiagram slug={guide.slug} locale={locale} artwork={boss.artwork} />
    </div>
    <RaidPlaque raid="the-voidspire" className={`${styles.materialPanel} ${styles.flow}`} data-guide-reveal>
      <AtlasDisclosure summary={t.flowDetails}><ol>{guide.phases.map((phase, index) => <li key={phase.en}><span aria-hidden="true">{index+1}</span><div><h4>{phase.title[locale]}</h4><p>{phase[locale]}</p></div></li>)}</ol></AtlasDisclosure>
    </RaidPlaque>
    <VoidspireGuideMechanics key={`${guide.slug}:${selection.specId}`} guide={guide} locale={locale} difficulty={selection.difficulty} specId={selection.specId} />
    <footer className={styles.sources}>
      <a href={`https://www.youtube.com/watch?v=${guide.video}`} target="_blank" rel="noreferrer">{t.source} · {guide.author} ↗</a>
      <AtlasDisclosure summary={t.sources}><p>{t.provenance}</p><ul>{voidspireFactSources.map(source => <li key={source.href}><a href={source.href} target="_blank" rel="noreferrer">{source.label[locale]} ↗</a></li>)}</ul><ol>{guide.mechanics.map(mechanic => <li key={mechanic.id}><a href={`https://www.youtube.com/watch?v=${guide.video}&t=${mechanic.at}s`} target="_blank" rel="noreferrer">{Math.floor(mechanic.at/60)}:{String(mechanic.at%60).padStart(2,'0')} · {mechanic.name[locale]}</a></li>)}</ol></AtlasDisclosure>
    </footer>
  </article>;
  return <div ref={guideRef} className={styles.guide} style={raidHubControlLayout('the-voidspire')} onClickCapture={openBossLink} data-voidspire-guide data-guide-boss={selection.boss} data-difficulty={selection.difficulty}>
    <VoidspireGuideMotion encounter={selection.boss} />
    <AtlasTabs orientation={wide ? 'vertical' : 'horizontal'} className={styles.bossTabs} label={t.bosses} value={selection.boss} onChange={slug => select({boss:slug})} tabs={[
      ...bosses.map((item,index) => ({id:item.slug,label:<span className={styles.bossChoice}><Image src={item.artwork} width={52} height={52} alt="" /><span><small>{String(index+1).padStart(2,'0')}</small>{locale === 'ru' ? item.nameRu : item.nameEn}</span></span>,content:selection.boss === item.slug ? content : null})),
      ...(pulls ? [{id:'trash',label:<span className={styles.trashChoice}>{t.trash}</span>,content:selection.boss === 'trash' ? <RaidPullWorkspace plan={pulls} locale={locale} guideSpecId={selection.specId} guideSpecPicker={specPicker} onGuideSpecChange={specId => select({specId})} /> : null}] : []),
    ]} />
  </div>;
}
