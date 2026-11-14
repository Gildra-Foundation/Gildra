"use client";

import { ArrowUpRight, Minus, Plus } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { ForeverIcon } from "@/components/wow/forever/shared/ForeverPanel";
import { foreverTalentIcon, foreverTalentSpellPath } from "@/lib/forever/talents/links";
import type { TalentNode, TalentTree } from "@/lib/forever/talents/types";
import { talentCopy } from "./talentCopy";
import styles from "./talents.module.css";

type Props = {
  tree: TalentTree; node: TalentNode; rank: number; lang: "en" | "ru";
  /** What is still missing to learn the talent, a line each. */
  requirements: string[];
  /** Points left to spend (shown where the panel is a dock under the tree). */
  left: number;
  canAdd: boolean; canRemove: boolean;
  onEdit: (delta: 1 | -1) => void;
};

/** The chosen talent: its name (a link to the spell), the rank now and the next one, what it requires, and the two buttons. */
export function TalentDetail({ tree, node, rank, lang, requirements, left, canAdd, canRemove, onEdit }: Props) {
  const t = talentCopy[lang], text = node.descriptions[lang];
  return <>
    <ForeverIcon src={foreverTalentIcon(node.iconFileId)} size={56} />
    <div className={styles.detailName}>
      <h2><a href={foreverTalentSpellPath(lang, node.rankSpellIds[Math.max(0, rank - 1)])} title={t.details}>{node.name[lang]}{"\u00a0"}<ArrowUpRight aria-hidden="true" /></a></h2>
      <p><span>{tree.name[lang]}</span><span>{t.rank} <strong data-selected-rank>{rank}/{node.maxRanks}</strong></span><span className={styles.dockLeft}>{t.remaining}: <strong>{left}</strong></span></p>
    </div>
    <div className={styles.detailActions}>
      <AtlasButton variant="primary" icon={<Plus aria-hidden size={16} />} disabled={!canAdd} onClick={() => onEdit(1)}>{t.add}</AtlasButton>
      <AtlasButton icon={<Minus aria-hidden size={16} />} disabled={!canRemove} onClick={() => onEdit(-1)}>{t.remove}</AtlasButton>
    </div>
    <div key={node.id} className={styles.detailBody}>
      {rank > 0 && <div className={styles.rankText} data-rank="current"><h3>{t.currentRank}</h3><p>{text[rank - 1]}</p></div>}
      {rank < node.maxRanks && <div className={styles.rankText} data-rank="next"><h3>{t.nextRank}</h3><p>{text[rank]}</p></div>}
      {requirements.length > 0 && <div className={styles.requirements}><h3>{t.requires}</h3><ul>{requirements.map(line => <li key={line}>{line}</li>)}</ul></div>}
    </div>
  </>;
}
