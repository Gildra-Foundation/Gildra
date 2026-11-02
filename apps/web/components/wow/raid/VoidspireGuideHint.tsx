'use client';

import { useState, type ReactNode } from 'react';
import { Tooltip } from '@gildra/atlas-ui/valyro-ui/basic/Tooltip';
import { AtlasDialog } from '@gildra/atlas-ui/AtlasDialog';
import bridge from '@gildra/atlas-ui/valyroAtlasBridge.module.css';
import { voidspireGuideCopy } from './voidspireGuideCopy';
import styles from './voidspireGuide.module.css';

/** Hover/focus uses Valyro; pressing opens the same text with touch, Escape and focus-return support. */
export function VoidspireGuideHint({ title, children, detail, source, locale, spellId }: {
  title: string; children?: ReactNode; detail: ReactNode; source?: string; locale: 'ru' | 'en'; spellId?: number;
}) {
  const [open, setOpen] = useState(false);
  const t = voidspireGuideCopy[locale];
  return <>
    <Tooltip disabled={open} content={<><strong>{title}</strong><div className={styles.hintText}>{detail}</div></>} delay={180} animation="fade" className={bridge.scope}>
      <button type="button" className={styles.hintTrigger} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} data-player-spell={spellId}>{children ?? title}</button>
    </Tooltip>
    <AtlasDialog open={open} onClose={() => setOpen(false)} label={title} className={styles.hintDialog}>
      <div className={styles.hintContent}>
        <header><h3>{title}</h3><button type="button" onClick={() => setOpen(false)}>{t.close}</button></header>
        <div>{detail}</div>
        {source && <a href={source} target="_blank" rel="noreferrer">{t.spellSource} ↗</a>}
      </div>
    </AtlasDialog>
  </>;
}
