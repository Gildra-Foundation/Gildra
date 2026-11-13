'use client';
import { Suspense, lazy, useState } from 'react';
import { ListOrdered } from 'lucide-react';
import type { TierListProps } from '@gildra/atlas-ui/valyro-ui/gaming/TierList';
import { MaterialButton } from '@/components/wow/shared/materialAtlas';
import { FOREVER_KIT } from '../foreverKit';
import { ForeverPanel } from '../shared/ForeverPanel';
import { ForeverSkeleton } from '../shared/ForeverStates';
import { copy } from './tierListsCopy';
import styles from './tierLists.module.css';

const Board = lazy(() => import('@gildra/atlas-ui/AtlasTierBoard').then(m => ({ default: m.AtlasTierBoard })));

/** The reader's own order: the board (drag, copy as text) is loaded when asked for. */
export function PersonalRanking({ lang, items, placement, title }: { lang: 'en' | 'ru'; items: TierListProps['items']; placement: TierListProps['defaultValue']; title: string }) {
  const [opened, setOpened] = useState(false);
  const c = copy[lang];
  return <ForeverPanel>
    {opened
      ? <Suspense fallback={<ForeverSkeleton lang={lang} variant="rows" count={4} />}><Board key={title} className={styles.myBoard} locale={lang} title={title} items={items} tiers={[{ id: 'S', label: 'S' }, { id: 'A', label: 'A' }, { id: 'B', label: 'B' }, { id: 'C', label: 'C' }]} defaultValue={placement} defaultMode="edit" exportName="forever-personal-ranking" /></Suspense>
      : <div className={styles.personal}>
        <p>{c.personalText}</p>
        <MaterialButton kit={FOREVER_KIT} fit="stack" icon={<ListOrdered aria-hidden="true" />} onClick={() => setOpened(true)}>{c.personalStart}</MaterialButton>
      </div>}
  </ForeverPanel>;
}
