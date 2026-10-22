"use client";

import { useEffect } from "react";
import { Minus, Plus, RefreshCw, X } from "lucide-react";
import type { TalentKind, TalentNode } from "@/lib/talentCalculatorData";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasDialog } from "@gildra/atlas-ui/AtlasDialog";
import { TalentDescription } from "./TalentDescription";
import { talentCalculatorCopy, type TalentCopyLang } from "./talentCalculatorCopy";
import styles from "./TalentTouchInspector.module.css";

/** Touch has no hover or right mouse button: inspect first, then edit explicitly. */
export function TalentTouchInspector({ node, kind, lang, rank, selectedChoice, lockReason, budgetFull, budget, opener, onRank, onSwitch, onClose }: {
  node: TalentNode; kind: TalentKind; lang: TalentCopyLang; rank: number; selectedChoice?: number;
  lockReason: string; budgetFull: boolean; budget: number; opener: HTMLButtonElement;
  onRank: (direction: 1 | -1) => void; onSwitch: () => void; onClose: () => void;
}) {
  // Removing the modal from React skips native dialog.close() focus restoration.
  useEffect(() => () => {
    window.requestAnimationFrame(() => { if (opener.isConnected) opener.focus({ preventScroll: true }); });
  }, [opener]);
  const copy = talentCalculatorCopy[lang];
  const selected = node.choices.find((choice) => choice.externalId === selectedChoice);
  const title = selected?.name ?? node.choices[0]?.name ?? copy.apex;
  let firstRank = 1;
  return (
    <AtlasDialog open onClose={onClose} label={title} variant="sheet" className={styles.sheet}>
      <header className={styles.header}>
        <div><p>{copy.treeLabels[kind]}</p><h2>{title}</h2></div>
        <AtlasButton variant="ghost" aria-label={copy.close} onClick={onClose} className={styles.close}><X aria-hidden="true" /></AtlasButton>
      </header>
      <div className={styles.content}>
        <p className={styles.rank} role="status" aria-live="polite">{copy.currentRank}<strong>{rank} / {node.maxRanks}</strong></p>
        {node.freeNode ? <p className={styles.notice}>{copy.learnedAutomatically}</p> : null}
        {lockReason ? <p className={styles.notice}>{copy.howToUnlock}: {lockReason}</p> : null}
        {budgetFull && rank < node.maxRanks && !node.freeNode ? <p className={styles.notice}>{copy.treeFull(budget)}</p> : null}
        {node.choices.map((choice) => {
          const start = firstRank;
          firstRank += choice.maxRanks;
          return <section className={styles.choice} key={choice.externalId} data-selected={choice.externalId === selectedChoice}>
            {node.choices.length > 1 ? <h3>{node.nodeType === "tiered" ? copy.rankRange(`${start}${choice.maxRanks > 1 ? `–${firstRank - 1}` : ""}`) : choice.name}{choice.externalId === selectedChoice ? <span>{copy.selected}</span> : null}</h3> : null}
            <TalentDescription talent={choice} locale={lang} />
          </section>;
        })}
      </div>
      <footer className={styles.actions}>
        <AtlasButton icon={<Minus aria-hidden="true" />} disabled={node.freeNode || rank <= 0} onClick={() => onRank(-1)}>{copy.removeRank}</AtlasButton>
        <AtlasButton variant="primary" icon={<Plus aria-hidden="true" />} disabled={node.freeNode || Boolean(lockReason) || budgetFull || rank >= node.maxRanks} onClick={() => onRank(1)}>{rank >= node.maxRanks ? copy.maxRank : copy.addRank}</AtlasButton>
        {node.nodeType === "choice" && rank > 0 ? <AtlasButton className={styles.switchChoice} icon={<RefreshCw aria-hidden="true" />} onClick={onSwitch}>{copy.switchChoice}</AtlasButton> : null}
      </footer>
    </AtlasDialog>
  );
}
