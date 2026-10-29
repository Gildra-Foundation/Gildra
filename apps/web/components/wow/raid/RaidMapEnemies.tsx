"use client";

import { ArrowUpRight, Eye, EyeOff } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasValyroSelect } from "@gildra/atlas-ui/AtlasValyroSelect";
import type { RaidMapEnemy } from "./raidPullTypes";
import { raidMapCopy } from "./raidMapCopy";
import styles from "./raidMap.module.css";

type EnemySelection = {
  enemies: RaidMapEnemy[];
  selected: string;
  locale: "ru" | "en";
  onSelect: (npcId: string) => void;
};

export function RaidMapEnemyControls({ enemies, selected, locale, onSelect, visible, onToggle }: EnemySelection & { visible: boolean; onToggle: () => void }) {
  if (!enemies.length) return null;
  const t = raidMapCopy[locale];
  const enemy = enemies.find(item => String(item.npcId) === selected);
  return <div className={styles.enemyControls} data-raid-enemy-controls>
    <div className={styles.enemyFields}>
      <AtlasButton size="sm" variant="ghost" aria-pressed={visible} onClick={onToggle} data-raid-enemy-toggle
        icon={visible ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}>{t.enemies}</AtlasButton>
      <AtlasValyroSelect aria-label={t.enemyFilter} value={selected} data-raid-enemy-select
        options={[{ value: "all", label: t.allEnemies }, ...enemies.map(item => ({ value: String(item.npcId), label: item.name[locale] }))]}
        onValueChange={onSelect} />
    </div>
    <p>{t.enemyHint}{enemy && <> <a href={enemy.sourceURL.replace(".com/", `.com/${t.sourceLocale}`)} target="_blank" rel="noreferrer">{enemy.name[locale]}<ArrowUpRight size={12} aria-hidden="true" /></a></>}</p>
  </div>;
}

/** Pointer selection duplicates the accessible enemy selector above the map.
 * Percentages use the original floor image; never project them onto an arena. */
export function RaidMapEnemyLayer({ enemies, selected, locale, onSelect, activeNpcIds, visible }: EnemySelection & { activeNpcIds: number[]; visible: boolean }) {
  if (!visible || !enemies.length) return null;
  return <svg className={styles.enemyLayer} aria-hidden="true" data-raid-enemy-layer
    onPointerUp={event => {
      const target = event.target;
      if (target instanceof SVGElement && target.dataset.npcId) onSelect(target.dataset.npcId);
    }}>
    {enemies.map(enemy => <g key={enemy.npcId} data-active={selected === String(enemy.npcId) || selected === "all" && activeNpcIds.includes(enemy.npcId)}
      data-muted={selected !== "all" && selected !== String(enemy.npcId)}>
      {enemy.points.map(point => <circle key={`${point.x}:${point.y}`} cx={`${point.x}%`} cy={`${point.y}%`} r="3"
        data-npc-id={enemy.npcId} data-raid-enemy-point={`${enemy.npcId}:${point.x}:${point.y}`}>
        <title>{`${enemy.name[locale]} · ${point.x}, ${point.y}`}</title>
      </circle>)}
    </g>)}
  </svg>;
}
