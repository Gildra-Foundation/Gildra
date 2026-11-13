"use client";
import { useState } from "react";
import { p, type Lang } from "@/lib/i18n-paths";
import { ForeverFilters, ForeverLevel, ForeverSearch } from "./shared/ForeverFilters";
import { ForeverPanel } from "./shared/ForeverPanel";
import { ForeverEmpty } from "./shared/ForeverStates";
import { bossCount, instanceCopy } from "./instanceCopy";
import type { DungeonCardFacts } from "./instanceFacts";
import { InstanceCard, InstanceCardGrid } from "./InstanceCard";
import { matchesSearch, matchesLevel } from "./foreverFilters";
import styles from "./foreverInstances.module.css";

/** Every dungeon as a card with its painting; search by name or place, filter by the player's level. */
export function ForeverDungeonCatalog({ lang, dungeons }: { lang: Lang; dungeons: readonly DungeonCardFacts[] }) {
  const t = instanceCopy[lang];
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const rows = dungeons.filter(d => matchesSearch(query, d.search) && matchesLevel(level, d.min, d.max));
  return <div className={styles.catalog}>
    <ForeverPanel>
      <ForeverFilters lang={lang} live onReset={query || level ? () => { setQuery(""); setLevel(""); } : undefined}
        search={<ForeverSearch id="dungeon-search" label={t.search} placeholder={t.searchHint} value={query} onChange={e => setQuery(e.target.value)} />}>
        <ForeverLevel id="dungeon-level" label={t.yourLevel} value={level} onChange={e => setLevel(e.target.value)} />
      </ForeverFilters>
      {!rows.length && <ForeverEmpty lang={lang} title={t.noResults} />}
    </ForeverPanel>
    {!!rows.length && <InstanceCardGrid long>{rows.map(d => <li key={d.slug}>
      <InstanceCard compact art={d.slug} href={p(lang, `/wow/forever/dungeons/${d.slug}`)} title={d.name} alias={d.alias} location={d.location}
        tag={d.fresh ? t.fresh : undefined} facts={[`${t.level} ${d.min}–${d.max}`, bossCount(d.bosses, lang)]} />
    </li>)}</InstanceCardGrid>}
  </div>;
}
