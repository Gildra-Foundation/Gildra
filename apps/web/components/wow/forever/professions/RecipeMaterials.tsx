'use client';
import { useState, type CSSProperties } from 'react';
import { itemQualityColors } from '@/lib/atlas/dataPalette';
import { ForeverList, ForeverListRow } from '../shared/ForeverCards';
import { ForeverFilters, ForeverLevel } from '../shared/ForeverFilters';
import { ForeverIcon } from '../shared/ForeverPanel';
import { copy } from './copy';
import styles from './professions.module.css';

export type RecipeReagent = { id: number; quantity: number; name: string; icon: string; quality: number; href: string };

/** Reagents of a recipe for any number of crafts: the icon with the quality on its edge, the name, the amount to bring. */
export function RecipeMaterials({ reagents, lang }: { reagents: RecipeReagent[]; lang: 'en' | 'ru' }) {
  const [value, setValue] = useState('1');
  const crafts = /^\d{1,3}$/.test(value) ? Math.max(1, Math.min(999, Number(value))) : 1;
  const c = copy[lang];
  return <>
    <ForeverFilters lang={lang} live className={styles.crafts}>
      <ForeverLevel label={c.crafts} min={1} max={999} value={value} onChange={event => setValue(event.target.value)} onBlur={() => setValue(String(crafts))} />
    </ForeverFilters>
    <div aria-live="polite" aria-atomic="true">
      <ForeverList label={c.materials}>
        {reagents.map(reagent => {
          const colour = itemQualityColors[reagent.quality as keyof typeof itemQualityColors];
          return <ForeverListRow key={reagent.id} href={reagent.href}
            icon={<span className={styles.itemIcon} style={colour ? { '--material-icon-edge': colour.frame } as CSSProperties : undefined}><ForeverIcon src={reagent.icon} size={44} /></span>}
            title={<b className={styles.itemName} style={colour ? { color: colour.text } : undefined}>{reagent.name}</b>}
            values={<span className={styles.amount}>× {reagent.quantity * crafts}</span>} />;
        })}
      </ForeverList>
    </div>
  </>;
}
