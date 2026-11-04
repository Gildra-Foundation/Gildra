'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import { Tooltip } from '@gildra/atlas-ui/valyro-ui/basic/Tooltip';
import { AtlasDialog } from '@gildra/atlas-ui/AtlasDialog';
import bridge from '@gildra/atlas-ui/valyroAtlasBridge.module.css';
import { voidspireGuideCopy } from './voidspireGuideCopy';
import styles from './voidspireGuide.module.css';

/** Hover/focus uses Valyro; pressing opens the same text with touch, Escape and focus-return support. */
export function VoidspireGuideHint({ title, children, detail, source, locale, spellId, portrait, portraitPosition }: {
  title: string; children?: ReactNode; detail: ReactNode; source?: string; locale: 'ru' | 'en'; spellId?: number; portrait?: string; portraitPosition?: string;
}) {
  const [open, setOpen] = useState(false);
  const t = voidspireGuideCopy[locale];
  const heading = (dialog = false) => <div className={portrait ? styles.enemyHintHeading : undefined}>
    {portrait && <span className={`${styles.enemyHintPortrait} ${portraitPosition ? styles.enemyHintScene : ''}`}><Image src={portrait} width={112} height={112} alt="" unoptimized={!!portraitPosition} style={portraitPosition ? { objectFit: 'none', objectPosition: portraitPosition } : undefined} data-enemy-portrait /></span>}
    {dialog ? <h3>{title}</h3> : <strong>{title}</strong>}
  </div>;
  return <>
    <Tooltip disabled={open} content={<>{heading()}<div className={styles.hintText}>{detail}</div></>} delay={180} animation="fade" className={`${bridge.scope} ${portrait ? styles.enemyHintTooltip : ''}`} data-enemy-hint={portrait ? title : undefined}>
      <button type="button" className={styles.hintTrigger} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} data-player-spell={spellId} data-enemy-hint-trigger={portrait ? title : undefined}>{children ?? title}</button>
    </Tooltip>
    <AtlasDialog open={open} onClose={() => setOpen(false)} label={title} className={styles.hintDialog}>
      <div className={`${styles.hintContent} ${portrait ? styles.enemyHintContent : ''}`} data-enemy-hint={portrait ? title : undefined}>
        <header>{heading(true)}<button type="button" onClick={() => setOpen(false)}>{t.close}</button></header>
        <div>{detail}</div>
        {source && <a href={source} target="_blank" rel="noreferrer">{t.spellSource} ↗</a>}
      </div>
    </AtlasDialog>
  </>;
}
