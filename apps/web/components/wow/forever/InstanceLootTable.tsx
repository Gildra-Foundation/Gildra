"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { AtlasSection } from "@gildra/atlas-ui/AtlasSection";
import { AtlasTable } from "@gildra/atlas-ui/AtlasTable";
import { AtlasField, AtlasInput, AtlasSelect } from "@gildra/atlas-ui/AtlasField";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasEmpty } from "@gildra/atlas-ui/AtlasState";
import { MaterialPlaque, materialIconFrameStyle, materialStyles } from "@/components/wow/shared/materialAtlas";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import type { Lang } from "@/lib/i18n-paths";
import { FOREVER_KIT } from "./foreverKit";
import { instanceDetailCopy } from "./instanceDetailCopy";
import { instanceName } from "./instanceLocalization";
import { matchesSearch } from "./foreverFilters";
import styles from "./instanceDetails.module.css";
import ux from "./foreverUx.module.css";
export type LootItem = { id: number; name: Record<Lang, string>; icon: string; level: number; itemLevel: number; slot: number; boss: string; url: string; quality?: number; external?: boolean };
/** A long list opens with its first rows; the rest is one press away. */
const FIRST_ROWS = 12;
const iconFrame = materialIconFrameStyle(FOREVER_KIT, 40);
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
  return <AtlasSection id="loot" title={t.loot}><MaterialPlaque kit={FOREVER_KIT}>
    <div className={ux.filters}>
      <AtlasField label={t.search} htmlFor="loot-search"><AtlasInput id="loot-search" type="search" icon={<Search aria-hidden="true" />} value={query} onChange={e => setQuery(e.target.value)} /></AtlasField>
      <AtlasField label={t.slot} htmlFor="loot-slot"><AtlasSelect id="loot-slot" value={slot} onChange={e => setSlot(e.target.value)}><option value="">{t.allSlots}</option>{[...new Set(items.map(row => t.slots[row.slot] || t.other))].sort((a, b) => a.localeCompare(b, lang)).map(value => <option key={value} value={value}>{value}</option>)}</AtlasSelect></AtlasField>
      <AtlasField label={t.enemy} htmlFor="loot-boss"><AtlasSelect id="loot-boss" value={boss} onChange={e => setBoss(e.target.value)}><option value="">{t.allEnemies}</option>{[...new Set(items.map(row => row.boss).filter(Boolean))].map(value => <option key={value} value={value}>{instanceName(value, lang)}</option>)}</AtlasSelect></AtlasField>
      <AtlasField label={t.yourLevel} htmlFor="loot-level"><AtlasInput id="loot-level" type="number" min={1} max={60} inputMode="numeric" value={level} onChange={e => setLevel(e.target.value)} /></AtlasField>
      {filtered && <AtlasButton variant="ghost" onClick={reset}>{t.reset}</AtlasButton>}
    </div>
    {rows.length ? <>
      <AtlasTable className={styles.loot} label={t.loot} rows={shown} rowKey={row => `${row.id}-${row.boss}`} columns={[
        { key: "item", header: t.item, rowHeader: true, cell: row => <a className={styles.item} href={row.url} {...(row.external ? { target: "_blank", rel: "noreferrer" } : {})}>
          <span className={materialStyles.iconFrame} style={iconFrame}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={row.icon} alt="" width={40} height={40} loading="lazy" />
          </span>
          <span className={styles.itemName} style={row.quality !== undefined && row.quality in itemQualityColors ? { color: itemQualityColors[row.quality as keyof typeof itemQualityColors].text } : undefined}>{row.name[lang]}{lang === "ru" && row.name.ru !== row.name.en && <span className={ux.alias} lang="en">{row.name.en}</span>}</span>
        </a> },
        { key: "slot", header: t.slot, cell: row => t.slots[row.slot] || "—" },
        { key: "level", header: t.required, numeric: true, cell: row => row.level ? <><span className={styles.levelLabel}>{t.levelShort} </span>{row.level}</> : "—" },
        { key: "boss", header: t.enemy, cell: row => instanceName(row.boss, lang) || "—" },
      ]} />
      {rows.length > FIRST_ROWS && <div className={styles.more}><AtlasButton variant="ghost" aria-expanded={all} onClick={() => setAll(value => !value)}>{all ? t.showLess : `${t.showAll} · ${rows.length}`}</AtlasButton></div>}
    </> : <AtlasEmpty title={t.noResults} action={<AtlasButton onClick={reset}>{t.reset}</AtlasButton>} />}
  </MaterialPlaque></AtlasSection>;
}
