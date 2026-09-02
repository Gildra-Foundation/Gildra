"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { LeagueChampion } from "@/lib/league";
import styles from "./league.module.css";

const roles = ["All", "Assassin", "Fighter", "Mage", "Marksman", "Support", "Tank"];

export function ChampionCatalog({ champions, locale }: { champions: LeagueChampion[]; locale: "en_US" | "ru_RU" }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("All");
  const [sort, setSort] = useState<"asc" | "desc">("asc");
  const filtered = useMemo(() => champions
    .filter((champion) => role === "All" || champion.tags.includes(role))
    .filter((champion) => `${champion.name} ${champion.title} ${champion.slug}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (sort === "asc" ? 1 : -1) * a.name.localeCompare(b.name, locale === "ru_RU" ? "ru" : "en")), [champions, locale, query, role, sort]);

  return <>
    <div className={styles.controls}>
      <label className={styles.search}>
        <span aria-hidden="true">⌕</span>
        <span className="sr-only">Search champions</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={locale === "ru_RU" ? "Найти чемпиона" : "Search champions"} />
        <kbd>/</kbd>
      </label>
      <div className={styles.roleTabs} aria-label="Champion role">
        {roles.map((value) => <button key={value} type="button" aria-pressed={role === value} onClick={() => setRole(value)}>{value}</button>)}
      </div>
      <button className={styles.sort} type="button" onClick={() => setSort((value) => value === "asc" ? "desc" : "asc")}>Name {sort === "asc" ? "↑" : "↓"}</button>
    </div>
    <div className={styles.resultLine}><span>{filtered.length} champions</span><i /></div>
    {filtered.length > 0 ? <div className={styles.championGrid}>
      {filtered.map((champion) => <Link className={styles.championCard} key={champion.id} href={`/league-of-legends/champions/${champion.slug}?locale=${locale}`}>
        <div className={styles.cardImage}>
          {champion.assets.tile || champion.assets.splash ? <img src={champion.assets.tile ?? champion.assets.splash ?? ""} alt="" loading="lazy" /> : <span>{champion.name.slice(0, 1)}</span>}
          <em>{champion.id}</em>
        </div>
        <div className={styles.cardCopy}><strong>{champion.name}</strong><small>{champion.title}</small><div>{champion.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>
      </Link>)}
    </div> : <div className={styles.empty}><strong>No champions found</strong><span>Try another name or role.</span></div>}
  </>;
}
