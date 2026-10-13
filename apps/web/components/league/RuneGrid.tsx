"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import type { LeagueContentEntry } from "@/lib/games/league-of-legends/api";
import styles from "./league.module.css";

type RuneTreeDefinition = {
  id: string;
  key: string;
  color: string;
  rows: string[][];
};

// Topology from Riot Data Dragon 16.17.1 runesReforged.json. Entries and
// localizations still come from the published Gildra catalog.
const runeTrees: RuneTreeDefinition[] = [
  { id: "8200", key: "Sorcery", color: "#8f6cff", rows: [["8214", "8229", "8230", "8992"], ["8224", "8226", "8275"], ["8210", "8234", "8233"], ["8237", "8232", "8236"]] },
  { id: "8000", key: "Precision", color: "#d7a645", rows: [["8005", "8008", "8021", "8010"], ["9101", "9111", "8009"], ["9104", "9105", "9103"], ["8014", "8017", "8299"]] },
  { id: "8100", key: "Domination", color: "#d75962", rows: [["8112", "8128", "9923"], ["8126", "8139", "8143"], ["8137", "8140", "8141"], ["8135", "8105", "8106"]] },
  { id: "8400", key: "Resolve", color: "#69ad67", rows: [["8437", "8439", "8465"], ["8446", "8463", "8401"], ["8429", "8444", "8473"], ["8451", "8453", "8242"]] },
  { id: "8300", key: "Inspiration", color: "#65b9c4", rows: [["8351", "8360", "8369"], ["8306", "8304", "8321"], ["8313", "8352", "8345"], ["8347", "8410", "8316"]] },
];

const runeShardRows = [
  ["5008", "5005", "5007"],
  ["5008", "5010", "5001"],
  ["5011", "5012", "5013"],
] as const;

const copy = {
  en_US: {
    eyebrow: "RUNE WORKSPACE",
    title: "Build a rune page",
    description: "Choose a primary path, a secondary path and the runes you want to compare.",
    primary: "Primary path",
    secondary: "Secondary path",
    keystone: "Keystone",
    row: "Row",
    selected: "Selected setup",
    selectedCoreCount: "4 primary · 2 secondary",
    selectedCount: "4 primary · 2 secondary · 3 shards",
    shards: "Stat shards",
    shard: "Shard",
    source: "Official Data Dragon tree",
    noStats: "Match win rates are intentionally hidden until a verified statistics source is connected.",
    shardNote: "Shard metadata comes from the localized League client data; images are served by Data Dragon.",
  },
  ru_RU: {
    eyebrow: "КОНСТРУКТОР РУН",
    title: "Соберите страницу рун",
    description: "Выберите основную и дополнительную ветки, затем отметьте нужные руны.",
    primary: "Основная ветка",
    secondary: "Дополнительная ветка",
    keystone: "Ключевая руна",
    row: "Ряд",
    selected: "Выбранная сборка",
    selectedCoreCount: "4 основные · 2 дополнительные",
    selectedCount: "4 основные · 2 дополнительные · 3 осколка",
    shards: "Осколки характеристик",
    shard: "Осколок",
    source: "Официальное дерево Data Dragon",
    noStats: "Винрейт намеренно скрыт, пока не подключён проверенный источник статистики матчей.",
    shardNote: "Метаданные осколков взяты из локализованных данных клиента, изображения — из Data Dragon.",
  },
} as const;

function firstAvailable(tree: RuneTreeDefinition, entries: Map<string, LeagueContentEntry>, startRow = 0) {
  const result: Record<number, string> = {};
  tree.rows.forEach((row, index) => {
    if (index >= startRow) {
      const rune = row.find((id) => entries.has(id));
      if (rune) result[index] = rune;
    }
  });
  return result;
}

function treeStyle(tree: RuneTreeDefinition) {
  return { "--rune-tree-color": tree.color } as CSSProperties;
}

export function RuneGrid({ entries, locale }: { entries: LeagueContentEntry[]; locale: "en_US" | "ru_RU" }) {
  const text = copy[locale];
  const entriesByID = useMemo(() => new Map(entries.map((entry) => [entry.externalKey, entry])), [entries]);
  const availableTrees = useMemo(() => runeTrees.filter((tree) => entriesByID.has(tree.id)), [entriesByID]);
  const initialPrimary = availableTrees.find((tree) => tree.id === "8200") ?? availableTrees[0];
  const initialSecondary = availableTrees.find((tree) => tree.id === "8000") ?? availableTrees[1] ?? availableTrees[0];
  const [primaryID, setPrimaryID] = useState(initialPrimary?.id ?? "");
  const [secondaryID, setSecondaryID] = useState(initialSecondary?.id ?? "");
  const [primaryRunes, setPrimaryRunes] = useState<Record<number, string>>(() => initialPrimary ? firstAvailable(initialPrimary, entriesByID) : {});
  const [secondaryRunes, setSecondaryRunes] = useState<Record<number, string>>(() => {
    if (!initialSecondary) return {};
    const defaults = firstAvailable(initialSecondary, entriesByID, 1);
    return Object.fromEntries(Object.entries(defaults).slice(0, 2));
  });
  const [selectedShards, setSelectedShards] = useState<Record<number, string>>(() => Object.fromEntries(
    runeShardRows.map((row, index) => [index, row.find((id) => entriesByID.has(id)) ?? ""]).filter(([, id]) => Boolean(id)),
  ));

  const availableShardRows = runeShardRows.every((row) => row.every((id) => entriesByID.has(id))) ? runeShardRows : [];

  if (availableTrees.length < 2) return null;
  const primaryTree = availableTrees.find((tree) => tree.id === primaryID) ?? availableTrees[0];
  const secondaryTree = availableTrees.find((tree) => tree.id === secondaryID && tree.id !== primaryTree.id)
    ?? availableTrees.find((tree) => tree.id !== primaryTree.id)
    ?? availableTrees[0];

  const choosePrimaryTree = (tree: RuneTreeDefinition) => {
    setPrimaryID(tree.id);
    setPrimaryRunes(firstAvailable(tree, entriesByID));
    if (tree.id === secondaryTree.id) {
      const replacement = availableTrees.find((candidate) => candidate.id !== tree.id);
      if (replacement) {
        setSecondaryID(replacement.id);
        setSecondaryRunes(Object.fromEntries(Object.entries(firstAvailable(replacement, entriesByID, 1)).slice(0, 2)));
      }
    }
  };

  const chooseSecondaryTree = (tree: RuneTreeDefinition) => {
    if (tree.id === primaryTree.id) return;
    setSecondaryID(tree.id);
    setSecondaryRunes(Object.fromEntries(Object.entries(firstAvailable(tree, entriesByID, 1)).slice(0, 2)));
  };

  const chooseSecondaryRune = (rowIndex: number, runeID: string) => {
    setSecondaryRunes((current) => {
      const next = { ...current };
      if (next[rowIndex] === runeID) return current;
      next[rowIndex] = runeID;
      const rows = Object.keys(next).map(Number).sort((a, b) => a - b);
      if (rows.length > 2) delete next[rows.find((row) => row !== rowIndex) ?? rows[0]];
      return next;
    });
  };

  const selectedIDs = [...Object.values(primaryRunes), ...Object.values(secondaryRunes), ...Object.values(selectedShards)];
  const selectedEntries = selectedIDs.map((id, index) => ({ key: `${index}-${id}`, entry: entriesByID.get(id) }))
    .filter((value): value is { key: string; entry: LeagueContentEntry } => Boolean(value.entry));

  return <section className={styles.runeBuilder} aria-labelledby="rune-builder-title" data-testid="rune-builder">
    <header className={styles.runeBuilderHeader}>
      <div>
        <span>{text.eyebrow}</span>
        <h2 id="rune-builder-title">{text.title}</h2>
        <p>{text.description}</p>
      </div>
      <aside>
        <span>{text.source}</span>
        <strong>{selectedEntries.length} / {6 + availableShardRows.length}</strong>
        <small>{availableShardRows.length > 0 ? text.selectedCount : text.selectedCoreCount}</small>
      </aside>
    </header>

    <div className={styles.runePathPickers}>
      <RunePathPicker label={text.primary} trees={availableTrees} activeID={primaryTree.id} disabledID="" onSelect={choosePrimaryTree} entries={entriesByID} />
      <RunePathPicker label={text.secondary} trees={availableTrees} activeID={secondaryTree.id} disabledID={primaryTree.id} onSelect={chooseSecondaryTree} entries={entriesByID} />
    </div>

    <div className={styles.runeColumns}>
      <RuneTreeCard
        label={text.primary}
        rowLabel={text.row}
        keystoneLabel={text.keystone}
        tree={primaryTree}
        entries={entriesByID}
        selected={primaryRunes}
        onSelect={(rowIndex, runeID) => setPrimaryRunes((current) => ({ ...current, [rowIndex]: runeID }))}
      />
      <RuneTreeCard
        label={text.secondary}
        rowLabel={text.row}
        keystoneLabel={text.keystone}
        tree={secondaryTree}
        entries={entriesByID}
        selected={secondaryRunes}
        secondary
        onSelect={chooseSecondaryRune}
        shardLabel={text.shards}
        shardRowLabel={text.shard}
        shardRows={availableShardRows}
        shardSelected={selectedShards}
        onShardSelect={(rowIndex, shardID) => setSelectedShards((current) => ({ ...current, [rowIndex]: shardID }))}
      />
    </div>

    <div className={styles.runeSelectionSummary}>
      <div><span>{text.selected}</span><strong>{selectedEntries.map(({ entry }) => entry.name).join(" · ")}</strong></div>
      <div className={styles.runeSelectedIcons}>{selectedEntries.map(({ key, entry }) => entry.iconUrl && <img key={key} src={entry.iconUrl} alt={entry.name} />)}</div>
    </div>
    <footer className={styles.runeBuilderNote}><span>{text.noStats}</span><span>{text.shardNote}</span></footer>
  </section>;
}

function RunePathPicker({ label, trees, activeID, disabledID, onSelect, entries }: {
  label: string;
  trees: RuneTreeDefinition[];
  activeID: string;
  disabledID: string;
  onSelect: (tree: RuneTreeDefinition) => void;
  entries: Map<string, LeagueContentEntry>;
}) {
  return <div className={styles.runePathPicker}>
    <span>{label}</span>
    <div>{trees.map((tree) => {
      const entry = entries.get(tree.id);
      const disabled = tree.id === disabledID;
      return <button key={tree.id} type="button" aria-pressed={tree.id === activeID} disabled={disabled} onClick={() => onSelect(tree)} style={treeStyle(tree)}>
        {entry?.iconUrl && <img src={entry.iconUrl} alt="" />}
        <span>{entry?.name ?? tree.key}</span>
      </button>;
    })}</div>
  </div>;
}

function RuneTreeCard({ label, rowLabel, keystoneLabel, tree, entries, selected, secondary = false, onSelect, shardLabel, shardRowLabel, shardRows, shardSelected, onShardSelect }: {
  label: string;
  rowLabel: string;
  keystoneLabel: string;
  tree: RuneTreeDefinition;
  entries: Map<string, LeagueContentEntry>;
  selected: Record<number, string>;
  secondary?: boolean;
  onSelect: (rowIndex: number, runeID: string) => void;
  shardLabel?: string;
  shardRowLabel?: string;
  shardRows?: readonly (readonly string[])[];
  shardSelected?: Record<number, string>;
  onShardSelect?: (rowIndex: number, shardID: string) => void;
}) {
  const path = entries.get(tree.id);
  const rows = secondary ? tree.rows.slice(1) : tree.rows;
  const offset = secondary ? 1 : 0;
  return <article className={styles.runeTreeCard} style={treeStyle(tree)}>
    <header>
      {path?.iconUrl && <img src={path.iconUrl} alt="" />}
      <div><span>{label}</span><h3>{path?.name ?? tree.key}</h3></div>
    </header>
    <div className={styles.runeRows}>{rows.map((row, visibleIndex) => {
      const rowIndex = visibleIndex + offset;
      return <div className={styles.runeRow} key={rowIndex}>
        <span className={styles.runeRailDot} aria-hidden="true" />
        <small>{rowIndex === 0 ? keystoneLabel : `${rowLabel} ${rowIndex}`}</small>
        <div>{row.map((runeID) => {
          const rune = entries.get(runeID);
          if (!rune?.iconUrl) return null;
          const isSelected = selected[rowIndex] === runeID;
          return <button key={runeID} type="button" aria-label={rune.name} aria-pressed={isSelected} onClick={() => onSelect(rowIndex, runeID)}>
            <span className={styles.runeIcon}><img src={rune.iconUrl} alt="" /></span>
            <span className={styles.runeTooltip}>{rune.name}</span>
          </button>;
        })}</div>
      </div>;
    })}</div>
    {shardRows && shardRows.length > 0 && shardLabel && shardRowLabel && shardSelected && onShardSelect
      ? <RuneShardGrid label={shardLabel} rowLabel={shardRowLabel} rows={shardRows} entries={entries} selected={shardSelected} onSelect={onShardSelect} />
      : null}
  </article>;
}

function RuneShardGrid({ label, rowLabel, rows, entries, selected, onSelect }: {
  label: string;
  rowLabel: string;
  rows: readonly (readonly string[])[];
  entries: Map<string, LeagueContentEntry>;
  selected: Record<number, string>;
  onSelect: (rowIndex: number, shardID: string) => void;
}) {
  return <section className={styles.runeShardGrid} aria-label={label}>
    <header><span>{label}</span></header>
    <div>{rows.map((row, rowIndex) => <div className={styles.runeShardRow} key={rowIndex}>
      <span className={styles.runeRailDot} aria-hidden="true" />
      <small>{rowLabel} {rowIndex + 1}</small>
      <div>{row.map((shardID) => {
        const shard = entries.get(shardID);
        if (!shard?.iconUrl) return null;
        const isSelected = selected[rowIndex] === shardID;
        return <button key={`${rowIndex}-${shardID}`} type="button" aria-label={shard.name} aria-pressed={isSelected} onClick={() => onSelect(rowIndex, shardID)}>
          <span className={styles.runeShardIcon}><img src={shard.iconUrl} alt="" /></span>
          <span className={styles.runeTooltip}>{shard.name}</span>
        </button>;
      })}</div>
    </div>)}</div>
  </section>;
}
