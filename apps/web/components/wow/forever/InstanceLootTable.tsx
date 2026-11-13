"use client";
import { useState } from "react";
import { AtlasSection } from "@gildra/atlas-ui/AtlasSection";
import { AtlasTable } from "@gildra/atlas-ui/AtlasTable";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import type { Lang } from "@/lib/i18n-paths";
import { ForeverFilters, ForeverLevel, ForeverSearch, ForeverSelect } from "./shared/ForeverFilters";
import { ForeverPanel, foreverIconFrame, foreverPanelStyles } from "./shared/ForeverPanel";
import { ForeverEmpty } from "./shared/ForeverStates";
import { instanceDetailCopy } from "./instanceDetailCopy";
import { instanceName } from "./instanceLocalization";
import { matchesSearch } from "./foreverFilters";
import styles from "./instanceDetails.module.css";
export type LootItem = { id: number; name: Record<Lang, string>; icon: string; level: number; itemLevel: number; slot: number; boss: string; url: string; quality?: number; external?: boolean };
/** A long list opens with its first rows; the rest is one press away. */
const FIRST_ROWS = 12;
const iconFrame = foreverIconFrame(40);
export function InstanceLootTable({ items, lang }: { items: LootItem[]; lang: Lang }) {
  const [query, setQuery] = useState("");
  const [slot, setSlot] = useState("");
  const [boss, setBoss] = useState("");
  const [level, setLevel] = useState("");
  const [all, setAll] = useState(false);
  if (!items?.length) return null;
  const t = instanceDetailCopy[lang];
  const filtered = Boolean(query || slot || boss || level);
  const reset = () => { setQuery(""); setSlot(""); setBoss(""); setLevel(""); };
  const rows = items.filter(row => matchesSearch(query, [row.name.en, row.name.ru]) && (!slot || (t.slots[row.slot] || t.other) === slot) && (!boss || row.boss === boss) && (!level || row.level <= Number(level)));
  const shown = all ? rows : rows.slice(0, FIRST_ROWS);
  const slots = [...new Set(items.map(row => t.slots[row.slot] || t.other))].sort((a, b) => a.localeCompare(b, lang));
  const enemies = [...new Set(items.map(row => row.boss).filter(Boolean))];
  return <AtlasSection id="loot" title={t.loot}><ForeverPanel>
    <ForeverFilters lang={lang} live inline onReset={filtered ? reset : undefined}
      search={<ForeverSearch id="loot-search" label={t.search} placeholder={t.searchHint} value={query} onChange={e => setQuery(e.target.value)} />}>
      <ForeverSelect id="loot-slot" label={t.slot} value={slot} onChange={e => setSlot(e.target.value)} options={[{ value: "", label: t.allSlots }, ...slots.map(value => ({ value, label: value }))]} />
      <ForeverSelect id="loot-boss" label={t.enemy} value={boss} onChange={e => setBoss(e.target.value)} options={[{ value: "", label: t.allEnemies }, ...enemies.map(value => ({ value, label: instanceName(value, lang) }))]} />
      <ForeverLevel id="loot-level" label={t.yourLevel} value={level} onChange={e => setLevel(e.target.value)} />
    </ForeverFilters>
    {rows.length ? <>
      <AtlasTable className={styles.loot} label={t.loot} rows={shown} rowKey={row => `${row.id}-${row.boss}`} columns={[
        { key: "item", header: t.item, rowHeader: true, cell: row => <a className={styles.item} href={row.url} {...(row.external ? { target: "_blank", rel: "noreferrer" } : {})}>
          <span className={foreverPanelStyles.iconFrame} style={iconFrame}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={row.icon} alt="" width={40} height={40} loading="lazy" />
          </span>
          <span className={styles.itemName} style={row.quality !== undefined && row.quality in itemQualityColors ? { color: itemQualityColors[row.quality as keyof typeof itemQualityColors].text } : undefined}>{row.name[lang]}{lang === "ru" && row.name.ru !== row.name.en && <span className={styles.alias} lang="en">{row.name.en}</span>}</span>
        </a> },
        { key: "slot", header: t.slot, cell: row => t.slots[row.slot] || "—" },
        { key: "level", header: t.required, numeric: true, cell: row => row.level ? <><span className={styles.levelLabel}>{t.levelShort} </span>{row.level}</> : "—" },
        { key: "boss", header: t.enemy, cell: row => instanceName(row.boss, lang) || "—" },
      ]} />
      {rows.length > FIRST_ROWS && <div className={styles.more}><button type="button" className={foreverPanelStyles.link} aria-expanded={all} onClick={() => setAll(value => !value)}>{all ? t.showLess : `${t.showAll} · ${rows.length}`}</button></div>}
    </> : <ForeverEmpty lang={lang} title={t.noResults} />}
  </ForeverPanel></AtlasSection>;
}
