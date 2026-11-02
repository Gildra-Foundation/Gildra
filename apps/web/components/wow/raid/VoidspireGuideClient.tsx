'use client';

import Image from 'next/image';
import { useSyncExternalStore, type MouseEvent } from 'react';
import { AtlasTabs } from '@gildra/atlas-ui/AtlasTabs';
import { AtlasSegmented } from '@gildra/atlas-ui/AtlasSegmented';
import { AtlasField, AtlasSelect } from '@gildra/atlas-ui/AtlasField';
import { AtlasDisclosure } from '@gildra/atlas-ui/AtlasDisclosure';
import { voidspireVideoGuides } from '@/lib/data/wow/raid/voidspireVideoGuide';
import { guideSpecs } from './voidspireGuideCounters';
import { guideHash, readGuideSelection, type GuideSelection } from './voidspireGuideState';
import { voidspireGuideCopy } from './voidspireGuideCopy';
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

export function VoidspireGuideClient({ bosses, locale, pulls }: { bosses: Boss[]; locale: 'ru' | 'en'; pulls: RaidPullPlan | null }) {
  const hash = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const selection = readGuideSelection(hash);
  const t = voidspireGuideCopy[locale];
  const guide = voidspireVideoGuides.find(item => item.slug === selection.boss) ?? voidspireVideoGuides[0];
  const boss = bosses.find(item => item.slug === guide.slug)!;
  const select = (update: Partial<GuideSelection>) => {
    const next = { ...selection, ...update };
    if (voidspireVideoGuides.find(item => item.slug === next.boss)?.heroicOnly) next.difficulty = 'heroic';
    window.history.pushState(window.history.state, '', guideHash(next));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  const openBossLink = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest('a');
    if (!link || link.target === '_blank') return;
    const url = new URL(link.href, window.location.href);
    const slug = new URLSearchParams(url.hash.slice(1)).get('boss');
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || !bosses.some(item => item.slug === slug)) return;
    event.preventDefault();
    select({boss:slug!});
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${slug}"]`)?.focus({preventScroll:true});
    event.currentTarget.scrollIntoView({block:'start', behavior:'instant'});
  };
  const content = <RaidPlaque raid="the-voidspire" className={styles.plaque}>
    <header className={styles.bossHeader}>
      <div><p className={styles.eyebrow}>{String(bosses.indexOf(boss) + 1).padStart(2, '0')} / 06{guide.heroicOnly ? ` · ${t.scope}` : ''}</p>
        <h2>{locale === 'ru' ? boss.nameRu : boss.nameEn}</h2><p className={styles.summary}>{guide.summary[locale]}</p>
      </div>
      <Image className={styles.bossArt} src={boss.artwork} width={320} height={190} alt="" />
    </header>
    <div className={styles.toolbar}>
      {!guide.heroicOnly && <AtlasField label={t.difficulty}><AtlasSegmented aria-label={t.difficulty} value={selection.difficulty} onValueChange={value => select({ difficulty: value as GuideSelection['difficulty'] })} options={['normal','heroic'].map(value => ({ value, label: t[value as 'normal' | 'heroic'] }))} /></AtlasField>}
      <AtlasField label={t.spec} htmlFor="guide-spec"><AtlasSelect id="guide-spec" value={selection.specId} onChange={event => select({specId:Number(event.target.value)})}>
        <option value={0}>{t.examples}</option>
        {[...new Set(guideSpecs.map(spec => spec.classId))].map(classId => <optgroup key={classId} label={guideSpecs.find(spec => spec.classId === classId)!.className[locale]}>
          {guideSpecs.filter(spec => spec.classId === classId).map(spec => <option key={spec.id} value={spec.id}>{spec.className[locale]} · {spec.name[locale]}</option>)}
        </optgroup>)}
      </AtlasSelect></AtlasField>
    </div>
    <div className={styles.plan}>
      <section className={styles.flow} aria-labelledby="guide-flow-title"><h3 id="guide-flow-title">{t.sequence}</h3><ol>{guide.phases.map((phase, index) => <li key={phase.en}><span aria-hidden="true">{index+1}</span><p>{phase[locale]}</p></li>)}</ol></section>
      <section className={styles.positioning} aria-labelledby="guide-position-title"><h3 id="guide-position-title">{t.positioning}</h3><p>{guide.positioning[locale]}</p></section>
    </div>
    <VoidspireGuideMechanics guide={guide} locale={locale} difficulty={selection.difficulty} specId={selection.specId} />
    <footer className={styles.sources}>
      <a href={`https://www.youtube.com/watch?v=${guide.video}`} target="_blank" rel="noreferrer">{t.source} · {guide.author} ↗</a>
      <AtlasDisclosure summary={t.sources}><p>{t.provenance}</p><ol>{guide.mechanics.map(mechanic => <li key={mechanic.id}><a href={`https://www.youtube.com/watch?v=${guide.video}&t=${mechanic.at}s`} target="_blank" rel="noreferrer">{Math.floor(mechanic.at/60)}:{String(mechanic.at%60).padStart(2,'0')} · {mechanic.name[locale]}</a></li>)}</ol></AtlasDisclosure>
    </footer>
  </RaidPlaque>;
  return <div className={styles.guide} onClickCapture={openBossLink} data-voidspire-guide data-guide-boss={selection.boss} data-difficulty={selection.difficulty}>
    <AtlasTabs className={styles.bossTabs} label={t.bosses} value={selection.boss} onChange={slug => select({boss:slug})} tabs={[
      ...bosses.map((item,index) => ({id:item.slug,label:<span className={styles.bossChoice}><Image src={item.artwork} width={52} height={52} alt="" /><span><small>{String(index+1).padStart(2,'0')}</small>{locale === 'ru' ? item.nameRu : item.nameEn}</span></span>,content:selection.boss === item.slug ? content : null})),
      ...(pulls ? [{id:'trash',label:<span className={styles.trashChoice}>{t.trash}</span>,content:selection.boss === 'trash' ? <RaidPullWorkspace plan={pulls} locale={locale} /> : null}] : []),
    ]} />
  </div>;
}
