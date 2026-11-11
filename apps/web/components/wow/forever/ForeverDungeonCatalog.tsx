"use client";
import { FOREVER_KIT } from "./foreverKit";
import { useState } from "react";
import { AtlasField, AtlasInput } from "@gildra/atlas-ui/AtlasField";
import { AtlasTable } from "@gildra/atlas-ui/AtlasTable";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { MaterialPlaque } from "@/components/wow/shared/materialAtlas";
import { p, type Lang } from "@/lib/i18n-paths";
import { newDungeons, returningDungeonDetails } from "./instanceData";
import { instanceCopy } from "./instanceCopy";
import { instanceName } from "./instanceLocalization";
import { matchesSearch, matchesLevel } from "./foreverFilters";
import styles from "./foreverUx.module.css";
const dungeons = [...newDungeons, ...returningDungeonDetails].sort((a, b) => a.min - b.min || a.max - b.max || a.name.localeCompare(b.name));
export function ForeverDungeonCatalog({ lang }: { lang: Lang }) {
  const t = instanceCopy[lang];
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const rows = dungeons.filter(d => matchesSearch(query, [d.name, instanceName(d.name, lang), d.location, instanceName(d.location, lang)]) && matchesLevel(level, d.min, d.max));
  return <MaterialPlaque kit={FOREVER_KIT}>
    <div className={styles.filters}>
      <AtlasField label={t.search} htmlFor="dungeon-search"><AtlasInput id="dungeon-search" type="search" value={query} onChange={e => setQuery(e.target.value)} /></AtlasField>
      <AtlasField label={t.yourLevel} htmlFor="dungeon-level"><AtlasInput id="dungeon-level" type="number" min={1} max={60} inputMode="numeric" value={level} onChange={e => setLevel(e.target.value)} /></AtlasField>
      {(query || level) && <AtlasButton variant="ghost" onClick={() => { setQuery(""); setLevel(""); }}>{t.reset}</AtlasButton>}
    </div>
    {rows.length ? <AtlasTable label={t.dungeons} rows={rows} rowKey={d => d.slug} layout="cards" columns={[
      { key: "name", header: t.dungeons, rowHeader: true, cell: d => <a className={styles.dungeonLink} href={p(lang, `/wow/forever/dungeons/${d.slug}`)}><span>{instanceName(d.name, lang)}</span>{instanceName(d.name, lang) !== d.name && <span className={styles.alias} lang="en">{d.name}</span>}{d.location && <span className={styles.alias}>{instanceName(d.location, lang)}</span>}</a> },
      { key: "level", header: t.recommended, numeric: true, cell: d => `${d.min}–${d.max}` },
    ]} /> : <p role="status">{t.noResults}</p>}
  </MaterialPlaque>;
}
