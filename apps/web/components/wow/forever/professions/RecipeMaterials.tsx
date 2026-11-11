'use client';
import { useState } from 'react';
import { foreverItemPath } from '@/lib/forever/guides/links';
import { AtlasField, AtlasInput } from '@gildra/atlas-ui/AtlasField';
import type { Recipe, Profession } from '@/lib/forever/guides/professions';
import { copy } from './copy';
import styles from './professions.module.css';
export function RecipeMaterials({ recipe, items, lang }: { recipe: Recipe; items: Profession['items']; lang: 'en' | 'ru' }) {
  const [value, setValue] = useState('1');
  const quantity = /^\d{1,3}$/.test(value) ? Math.max(1, Math.min(999, Number(value))) : 1;
  const c = copy[lang];
  return <>
    <AtlasField label={c.crafts} htmlFor="craft-count" className={styles.countField}>
      <AtlasInput id="craft-count" type="number" min={1} max={999} inputMode="numeric" value={value} onChange={e => setValue(e.target.value)} onBlur={() => setValue(String(quantity))} />
    </AtlasField>
    <ul className={styles.list} aria-live="polite" aria-atomic="true">{recipe.reagents.map(r => <li key={r.id}>
      <span className={styles.amount}>{r.quantity * quantity} × </span><a className={styles.link} href={foreverItemPath(r.id,lang)}>{items[r.id].name[lang]}</a>
    </li>)}</ul>
  </>;
}
