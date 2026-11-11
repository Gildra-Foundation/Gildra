'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { copy } from './tierListsCopy';
import styles from './tierLists.module.css';
import type { TierListProps } from '@gildra/atlas-ui/valyro-ui/gaming/TierList';
const Board=dynamic(()=>import('@gildra/atlas-ui/AtlasTierBoard').then(m=>m.AtlasTierBoard));
export function PersonalRanking({lang,items,placement,title}:{lang:'en'|'ru';items:TierListProps['items'];placement:TierListProps['defaultValue'];title:string}) {
 const [opened,setOpened]=useState(false);
 return <details className={styles.personal} onToggle={e=>{if(e.currentTarget.open)setOpened(true);}}><summary>{copy[lang].personal}</summary>
  {opened && <Board key={title} locale={lang} title={title} items={items} tiers={[{id:'S',label:'S'},{id:'A',label:'A'},{id:'B',label:'B'},{id:'C',label:'C'}]} defaultValue={placement} defaultMode="edit" exportName="forever-personal-ranking" />}
 </details>;
}
