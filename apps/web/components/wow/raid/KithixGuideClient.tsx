'use client';

import Image from 'next/image';
import { useSyncExternalStore, type CSSProperties } from 'react';
import { Shield, Skull, Users, Sun, Bug, MoveRight, CircleDot } from 'lucide-react';
import { AtlasSegmented } from '@gildra/atlas-ui/AtlasSegmented';
import { AtlasField } from '@gildra/atlas-ui/AtlasField';
import { AtlasDisclosure } from '@gildra/atlas-ui/AtlasDisclosure';
import { MaterialButton } from '@/components/wow/shared/materialAtlas';
import { RaidPlaque } from './raidMaterial';
import { VoidspireGuideHint } from './VoidspireGuideHint';
import { raidGuideMaterial } from './raidGuideMaterial';
import { kithixRaid } from './kithixRaidData';
import { kithixGuideCopy, kithixPhases, kithixMechanics, kithixEnemies, kithixGuideSources, type KithixLocale, type KithixRole } from './kithixGuideData';
import shared from './sporefallGuide.module.css';
import styles from './kithixGuide.module.css';

const raid = kithixRaid.slug;
function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback);
  window.addEventListener('popstate', callback);
  return () => { window.removeEventListener('hashchange', callback); window.removeEventListener('popstate', callback); };
}
const snapshot = () => window.location.hash;
const serverSnapshot = () => '';

export function KithixGuideClient({locale}: {locale:KithixLocale}) {
  const hash = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const query = new URLSearchParams(hash.slice(1));
  const phase = kithixPhases.find(item => item.id === query.get('phase')) ?? kithixPhases[0];
  const difficulty = query.get('difficulty') === 'heroic' ? 'heroic' : 'normal';
  const role: KithixRole = query.get('role') === 'tank' ? 'tank' : query.get('role') === 'healer' ? 'healer' : 'dps';
  const heroic = difficulty === 'heroic', copy = kithixGuideCopy[locale];
  const select = (update: Record<string,string>) => {
    const next = new URLSearchParams(window.location.hash.slice(1));
    Object.entries(update).forEach(([key,value]) => next.set(key,value));
    window.history.pushState(window.history.state, '', `#${next}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  const material = {...raidGuideMaterial(raid), '--kithix-accent':kithixRaid.accent} as CSSProperties;
  return <div className={`${shared.guide} ${styles.guide}`} style={material} data-kithix-guide data-difficulty={difficulty} data-phase={phase.id} data-role={role}>
    <RaidPlaque raid={raid} className={`${styles.panel} ${styles.intro}`}>
      <h2>{copy.before}</h2><p>{copy.preparation}</p>
      <nav className={styles.phases} aria-label={copy.phases}>{kithixPhases.map((item,index) => <MaterialButton key={item.id} kit={raid} className={styles.phaseButton} aria-pressed={item.id === phase.id} onClick={() => select({phase:item.id})}>{index + 1}{" · "}{item.title[locale]}</MaterialButton>)}</nav>
    </RaidPlaque>
    <div className={shared.briefing}>
      <RaidPlaque raid={raid} as="section" className={`${styles.panel} ${shared.personal}`} aria-labelledby="kithix-phase-title">
        <div className={shared.toolbar}>
          <AtlasField label={copy.difficulty}><AtlasSegmented aria-label={copy.difficulty} value={difficulty} onValueChange={value => select({difficulty:value})} options={(['normal','heroic'] as const).map(value => ({value,label:copy[value]}))} /></AtlasField>
          <AtlasField label={copy.role}><AtlasSegmented aria-label={copy.role} value={role} onValueChange={value => select({role:value})} options={(['tank','healer','dps'] as const).map(value => ({value,label:copy[value]}))} /></AtlasField>
        </div>
        <div><p className={styles.trigger}>{phase.trigger[locale]}</p><h2 id="kithix-phase-title">{phase.title[locale]}</h2></div>
        <p className={styles.call}>{phase.call[locale]}</p>
        <p className={shared.personalAction} data-kithix-role-action><strong>{copy[role]}: </strong>{phase.roles[role][locale]}</p>
        {heroic && phase.heroic && <p className={shared.heroic} data-kithix-heroic>{phase.heroic[locale]}</p>}
        <p className={styles.next}><MoveRight aria-hidden="true" />{phase.next[locale]}</p>
      </RaidPlaque>
      <RaidPlaque raid={raid} as="figure" className={`${styles.panel} ${shared.diagram}`} aria-label={copy.positioning}>
        <h2>{copy.positioning}</h2>
        <div className={styles.diagram} data-kithix-diagram={phase.id}>
          {phase.id === 'swarm' ? <>
            <div className={styles.zone}><Skull aria-hidden="true" /><strong>{copy.boss}</strong><Shield aria-hidden="true" /></div>
            <p className={styles.distance}>↕ {copy.move}</p>
            <div className={styles.zone}><Bug aria-hidden="true" /><strong>{copy.adds}</strong><span>{copy.addPair}</span></div>
            <div className={styles.group}><Users aria-hidden="true" />{copy.raid}</div>
          </> : phase.id === 'darkness' ? <>
            <div className={`${styles.zone} ${styles.light}`}><Sun aria-hidden="true" /><strong>{copy.light}</strong><div className={styles.group}><Users aria-hidden="true" />{copy.raid}</div><span>{copy.edge} · <Shield aria-hidden="true" /> {copy.tankHit}</span></div>
            {heroic && <p className={styles.distance}>{copy.fragmentPath} → <Shield aria-hidden="true" /> → {copy.liadrin}</p>}
          </> : <>
            <div className={styles.zone}><Skull aria-hidden="true" /><strong>{copy.boss}</strong><span>{copy.burn}</span></div>
            <div className={styles.group}><Users aria-hidden="true" />{copy.raid}</div>
            <div className={styles.gates}><CircleDot aria-hidden="true" /><strong>{copy.gates}</strong><span><Shield aria-hidden="true" /> {copy.gateAction}</span></div>
          </>}
        </div>
      </RaidPlaque>
    </div>
    <RaidPlaque raid={raid} as="section" className={`${styles.panel} ${shared.mechanics}`} aria-labelledby="kithix-mechanics-title">
      <h2 id="kithix-mechanics-title">{copy.mechanics}</h2>
      <div className={shared.tableHead} aria-hidden="true"><span>{copy.signal}</span><span>{copy.response}</span></div>
      <ol>{kithixMechanics.filter(item => item.phases.includes(phase.id) && (heroic || !item.heroicOnly)).map(item => <li key={item.name.en} data-kithix-mechanic={item.name.en}>
        <div className={shared.signal}><h3>{item.name[locale]}</h3><p>{item.signal[locale]}</p></div>
        <div className={shared.response}><p>{item.response[locale]}</p>{heroic && item.heroic && <p className={shared.heroic}>{item.heroic[locale]}</p>}</div>
      </li>)}</ol>
    </RaidPlaque>
    <section className={shared.enemies} aria-labelledby="kithix-enemies-title"><h2 id="kithix-enemies-title">{copy.enemies}</h2><div className={styles.enemies}>{kithixEnemies.filter(enemy => heroic || !enemy.heroicOnly).map(enemy => <RaidPlaque key={enemy.id} raid={raid} as="article" className={`${styles.panel} ${shared.add}`} data-kithix-enemy={enemy.id}>
      <p className={styles.trigger}>{copy[enemy.priority]}</p>
      <div className={styles.enemyHeading}><Image className={styles.portrait} src={`/assets/wow/raids/kithix/npc-${enemy.npcId}.webp`} alt={enemy.name[locale]} width={112} height={112} /><h3><VoidspireGuideHint raid={raid} locale={locale} title={enemy.name[locale]} portrait={`/assets/wow/raids/kithix/npc-${enemy.npcId}.webp`} source={enemy.npcId ? `https://www.wowhead.com/${locale === 'ru' ? 'ru/' : ''}npc=${enemy.npcId}` : undefined} detail={<div className={shared.hintFacts}><p>{enemy.detail[locale]}</p><p><strong>{enemy.spell[locale]}</strong></p><p>{enemy.action[locale]}</p></div>} /></h3></div>
      <p>{enemy.detail[locale]}</p><p className={shared.personalAction}>{enemy.action[locale]}</p>
    </RaidPlaque>)}</div></section>
    <div className={styles.sources}><AtlasDisclosure summary={copy.sources}><ul>{kithixGuideSources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title[locale]} ↗</a></li>)}</ul></AtlasDisclosure></div>
  </div>;
}
