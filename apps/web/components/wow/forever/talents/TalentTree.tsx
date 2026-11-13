"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import { RotateCcw } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasTooltip } from "@gildra/atlas-ui/AtlasTooltip";
import { ForeverIcon } from "@/components/wow/forever/shared/ForeverPanel";
import { requirementsMet, treePoints } from "@/lib/forever/talents/engine";
import { foreverTalentIcon } from "@/lib/forever/talents/links";
import type { TalentBuild, TalentNode, TalentTree as Tree } from "@/lib/forever/talents/types";
import { foreverTreeArt, treeKey } from "./talentArt";
import { talentCopy } from "./talentCopy";
import styles from "./talents.module.css";

type Props = {
  classSlug: string; tree: Tree; build: TalentBuild; lang: "en" | "ru";
  /** The tree on show where one tree fits (the switch above the trees picks it). */
  open: boolean;
  /** Points are left to spend: without them an empty talent is as closed as a locked one. */
  canSpend: boolean;
  /** The talent the side panel shows, and the one that holds the tree's tab stop. */
  shownId: number; tabStopId: number;
  /** The talent whose rank has just changed: one flash of its frame. */
  pulse: { id: number | null; n: number } | null;
  /** Touch: a tap opens the talent in the panel, its buttons spend the points; the name is not shown on hover. */
  touch: boolean;
  onShow: (node: TalentNode, focused?: boolean) => void;
  onEdit: (node: TalentNode, delta: 1 | -1) => void;
  onKey: (event: KeyboardEvent<HTMLButtonElement>, node: TalentNode) => void;
  onReset: () => void;
};

/** One tree as the game draws it: its backdrop, the 4 × 7 grid of talents with ranks, the arrows of what unlocks what. */
export function TalentTree({ classSlug, tree, build, lang, open, canSpend, shownId, tabStopId, pulse, touch, onShow, onEdit, onKey, onReset }: Props) {
  const t = talentCopy[lang], points = treePoints(tree, build.ranks);
  return <section id={`tree-${treeKey(tree)}`} className={styles.tree} data-open={open ? "" : undefined} aria-labelledby={`heading-${tree.id}`}
    style={{ "--tree-art": `url("${foreverTreeArt(classSlug, tree)}")` } as CSSProperties}>
    <header className={styles.treeHead}>
      <ForeverIcon src={foreverTalentIcon(tree.iconFileId)} size={48} />
      <h2 id={`heading-${tree.id}`}>{tree.name[lang]}</h2>
      <strong className={styles.treePoints} aria-label={`${t.spent}: ${points}`} data-tree-points>{points}</strong>
      <AtlasButton size="sm" variant="ghost" className={styles.treeReset} disabled={!points} aria-label={`${t.resetTree}: ${tree.name[lang]}`} onClick={onReset} icon={<RotateCcw aria-hidden size={16} />}>{t.resetTree}</AtlasButton>
    </header>
    <div className={styles.grid}>
      {tree.nodes.flatMap(node => node.prerequisites.map(pre => {
        const parent = tree.nodes.find(item => item.id === pre.nodeId)!;
        // Every arrow of the game runs along a column or a row.
        const side = parent.row === node.row;
        const [from, to] = side ? [parent.column, node.column] : [parent.row, node.row];
        const span = `${Math.min(from, to) + 1} / ${Math.max(from, to) + 2}`;
        return <span key={`${parent.id}-${node.id}`} className={styles.edge} aria-hidden="true" data-met={(build.ranks[parent.id] ?? 0) >= pre.ranks}
          data-dir={side ? "side" : "down"} data-back={to < from ? "" : undefined}
          style={(side ? { gridRow: node.row + 1, gridColumn: span, "--edge-span": Math.abs(to - from) + 1 } : { gridColumn: node.column + 1, gridRow: span }) as CSSProperties} />;
      }))}
      {tree.nodes.map(node => {
        const rank = build.ranks[node.id] ?? 0;
        const unlocked = requirementsMet(tree, node, build.ranks) && build.level + build.talented >= node.level;
        const state = rank === node.maxRanks ? "max" : rank > 0 ? "ranked" : unlocked && canSpend ? "open" : "locked";
        return <div key={node.id} className={styles.slot} style={{ gridRow: node.row + 1, gridColumn: node.column + 1 }}>
          <AtlasTooltip content={touch ? "" : node.name[lang]}>
            <button className={styles.node} type="button" data-node={node.id} data-rank={rank} data-state={state} data-locked={!unlocked} data-max={rank === node.maxRanks}
              data-shown={shownId === node.id ? "" : undefined} tabIndex={tabStopId === node.id ? 0 : -1}
              aria-label={`${node.name[lang]}, ${t.rank} ${rank}/${node.maxRanks}`} aria-disabled={!unlocked || rank === node.maxRanks || !canSpend}
              onFocus={() => onShow(node, true)}
              onPointerEnter={event => { if (event.pointerType === "mouse") onShow(node); }}
              onClick={event => {
                onShow(node);
                if (!(touch && event.detail > 0)) onEdit(node, event.shiftKey ? -1 : 1);
              }}
              onContextMenu={event => { event.preventDefault(); onShow(node); onEdit(node, -1); }}
              onKeyDown={event => onKey(event, node)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local client-derived icon, fixed dimensions */}
              <img src={foreverTalentIcon(node.iconFileId)} width={52} height={52} alt="" loading="lazy" decoding="async" />
              <span className={styles.rank}>{rank}/{node.maxRanks}</span>
              {pulse?.id === node.id && <span key={pulse.n} className={styles.flash} aria-hidden="true" />}
            </button>
          </AtlasTooltip>
        </div>;
      })}
    </div>
  </section>;
}
