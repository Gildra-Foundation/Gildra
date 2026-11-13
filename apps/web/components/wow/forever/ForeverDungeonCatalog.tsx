"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { AtlasField, AtlasInput } from "@gildra/atlas-ui/AtlasField";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasEmpty } from "@gildra/atlas-ui/AtlasState";
import { MaterialPlaque } from "@/components/wow/shared/materialAtlas";
import { p, type Lang } from "@/lib/i18n-paths";
import { FOREVER_KIT } from "./foreverKit";
import { bossCount, instanceCopy } from "./instanceCopy";
import type { DungeonCardFacts } from "./instanceFacts";
import { InstanceCard, InstanceCardGrid } from "./InstanceCard";
import { matchesSearch, matchesLevel } from "./foreverFilters";
import ux from "./foreverUx.module.css";
import styles from "./foreverInstances.module.css";

/** Every dungeon as a card with its painting; search by name or place, filter by the player's level. */
export function ForeverDungeonCatalog({ lang, dungeons }: { lang: Lang; dungeons: readonly DungeonCardFacts[] }) {
  const t = instanceCopy[lang];
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const rows = dungeons.filter(d => matchesSearch(query, d.search) && matchesLevel(level, d.min, d.max));
  const reset = () => { setQuery(""); setLevel(""); };
  return <>
    <MaterialPlaque kit={FOREVER_KIT} className={styles.filterPlaque} role="search" aria-label={t.filters}>
      <div className={`${ux.filters} ${styles.filterRow}`}>
        <AtlasField label={t.search} htmlFor="dungeon-search"><AtlasInput id="dungeon-search" type="search" icon={<Search aria-hidden="true" />} value={query} onChange={e => setQuery(e.target.value)} /></AtlasField>
        <AtlasField label={t.yourLevel} htmlFor="dungeon-level"><AtlasInput id="dungeon-level" type="number" min={1} max={60} inputMode="numeric" value={level} onChange={e => setLevel(e.target.value)} /></AtlasField>
        {(query || level) && <AtlasButton variant="ghost" onClick={reset}>{t.reset}</AtlasButton>}
      </div>
    </MaterialPlaque>
    {rows.length ? <InstanceCardGrid>{rows.map(d => <li key={d.slug}>
      <InstanceCard compact art={d.slug} href={p(lang, `/wow/forever/dungeons/${d.slug}`)} title={d.name} alias={d.alias} location={d.location}
        tag={d.fresh ? t.fresh : undefined} facts={[`${t.level} ${d.min}–${d.max}`, bossCount(d.bosses, lang)]} />
    </li>)}</InstanceCardGrid> : <AtlasEmpty title={t.noResults} action={<AtlasButton onClick={reset}>{t.reset}</AtlasButton>} />}
  </>;
}
