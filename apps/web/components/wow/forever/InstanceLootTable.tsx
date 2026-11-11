"use client";
import { FOREVER_KIT } from "./foreverKit";
import { useState } from "react";
import { AtlasSection } from "@gildra/atlas-ui/AtlasSection";
import { AtlasTable } from "@gildra/atlas-ui/AtlasTable";
import { AtlasField, AtlasInput, AtlasSelect } from "@gildra/atlas-ui/AtlasField";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { MaterialPlaque } from "@/components/wow/shared/materialAtlas";
import type { Lang } from "@/lib/i18n-paths";
import { instanceDetailCopy } from "./instanceDetailCopy";
import { instanceName } from "./instanceLocalization";
import { matchesSearch } from "./foreverFilters";
import styles from "./instanceDetails.module.css";
import ux from "./foreverUx.module.css";
export type LootItem = { id: number; name: Record<Lang, string>; icon: string; level: number; itemLevel: number; slot: number; boss: string; url: string };
export function InstanceLootTable({ items, lang }: { items: LootItem[]; lang: Lang }) {
  const [query, setQuery] = useState("");
  const [slot, setSlot] = useState("");
  const [boss, setBoss] = useState("");
  const [level, setLevel] = useState("");
  if (!items?.length) return null;
  const t = instanceDetailCopy[lang];
  const rows = items.filter(row => matchesSearch(query, [row.name.en, row.name.ru]) && (!slot || (t.slots[row.slot] || t.other) === slot) && (!boss || row.boss === boss) && (!level || row.level <= Number(level)));
  return <AtlasSection id="loot" title={t.loot}><MaterialPlaque kit={FOREVER_KIT}>
    <div className={ux.filters}>
      <AtlasField label={t.search} htmlFor="loot-search"><AtlasInput id="loot-search" type="search" value={query} onChange={e => setQuery(e.target.value)} /></AtlasField>
      <AtlasField label={t.slot} htmlFor="loot-slot"><AtlasSelect id="loot-slot" value={slot} onChange={e => setSlot(e.target.value)}><option value="">{t.allSlots}</option>{[...new Set(items.map(row => t.slots[row.slot] || t.other))].sort((a, b) => a.localeCompare(b, lang)).map(value => <option key={value} value={value}>{value}</option>)}</AtlasSelect></AtlasField>
      <AtlasField label={t.enemy} htmlFor="loot-boss"><AtlasSelect id="loot-boss" value={boss} onChange={e => setBoss(e.target.value)}><option value="">{t.allEnemies}</option>{[...new Set(items.map(row => row.boss).filter(Boolean))].map(value => <option key={value} value={value}>{instanceName(value, lang)}</option>)}</AtlasSelect></AtlasField>
      <AtlasField label={t.yourLevel} htmlFor="loot-level"><AtlasInput id="loot-level" type="number" min={1} max={60} value={level} onChange={e => setLevel(e.target.value)} /></AtlasField>
      {(query || slot || boss || level) && <AtlasButton variant="ghost" onClick={() => { setQuery(""); setSlot(""); setBoss(""); setLevel(""); }}>{t.reset}</AtlasButton>}
    </div>
    {rows.length ? <AtlasTable label={t.loot} rows={rows} rowKey={row => `${row.id}-${row.boss}`} layout="cards" columns={[
      { key: "item", header: t.item, rowHeader: true, cell: row => <a className={styles.item} href={row.url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={row.icon} alt="" width={36} height={36} loading="lazy" /><span>{row.name[lang]}{lang === "ru" && row.name.ru !== row.name.en && <span className={ux.alias} lang="en">{row.name.en}</span>}</span>
      </a> },
      { key: "slot", header: t.slot, cell: row => t.slots[row.slot] || "—" },
      { key: "level", header: t.required, numeric: true, cell: row => row.level || "—" },
      { key: "boss", header: t.enemy, cell: row => instanceName(row.boss, lang) || "—" },
    ]} /> : <p role="status">{t.noResults}</p>}
  </MaterialPlaque></AtlasSection>;
}
