"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, DoorOpen, Hourglass, MapPin, Search, X } from "lucide-react";
import type { AtlasBundle, AtlasMap, Lang } from "@/lib/wow/worldMap/bundle";
import { altNames, buildSearch, type AltNames, type SearchHit } from "../mapSearch";
import { worldMapCopy } from "../worldMapCopy";
import { capitalNames, isCity } from "../worldMapModel";
import styles from "../worldMapViewer.module.css";

const RECENT_KEY = "gildra.worldMap.recent";
const RECENT_MAX = 5;

function readRecent(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((key): key is string => typeof key === "string").slice(0, RECENT_MAX) : [];
  } catch { return []; }
}

/**
 * Search over the map's places and events: arrows move through the results,
 * Enter flies there, Escape clears. The names in the other language are found
 * too (they arrive with the first search). Recent picks wait under an empty field.
 */
export function MapSearchBox({ lang, bundle, bundleUrl, byId, exists, onPick }: {
  lang: Lang; bundle: AtlasBundle; bundleUrl: string; byId: Map<number, AtlasMap> | undefined;
  /** Whether a map is drawn in the era on screen: places of other times are not offered. */
  exists(mapId: number): boolean;
  onPick(hit: SearchHit): void;
}) {
  const copy = worldMapCopy[lang];
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [alt, setAlt] = useState<AltNames | null>(null);
  // The viewer runs in the browser only: the stored picks are there on the first render.
  const [recent, setRecent] = useState<string[]>(readRecent);
  const asked = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const search = useMemo(() => buildSearch(bundle, alt), [bundle, alt]);
  const cities = useMemo(() => capitalNames(bundle), [bundle]);
  const hits = useMemo(() => {
    const now = (hit: SearchHit) => hit.type === "event" || exists(hit.type === "map" ? hit.map.id : hit.poi.map);
    return (query.trim() ? search(query, 24) : search.byKeys(recent)).filter(now).slice(0, 8);
  }, [search, query, recent, exists]);
  const list = useRef<HTMLUListElement>(null);
  // Arrows keep the active result in sight.
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(`[id="hit-${hits[active]?.key}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, hits]);
  const showing = open && (query.trim() !== "" || hits.length > 0);

  // The other language's names: one request, on the first focus of the field.
  const wantAlt = () => {
    if (asked.current) return;
    asked.current = true;
    const other = lang === "ru" ? "en" : "ru";
    fetch(bundleUrl.replace(`/atlas/${lang}`, `/atlas/${other}`)).then((r) => (r.ok ? r.json() : null)).then((data: AtlasBundle | null) => { if (data) setAlt(altNames(data)); }).catch(() => {});
  };

  const pick = (hit: SearchHit) => {
    const next = [hit.key, ...recent.filter((key) => key !== hit.key)].slice(0, RECENT_MAX);
    setRecent(next);
    try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode: no memory */ }
    setQuery("");
    setOpen(false);
    input.current?.blur();
    onPick(hit);
  };

  const meta = (hit: SearchHit) => {
    if (hit.type === "event") return `${copy.patch} ${hit.event.patch}`;
    const kind = hit.type === "map" ? copy.type[byId && isCity(hit.map, byId, cities) ? "city" : hit.map.type] : copy.kind[hit.poi.kind];
    return hit.context ? `${kind} · ${hit.context}` : kind;
  };
  const Icon = (hit: SearchHit) => (hit.type === "event" ? Hourglass : hit.type === "poi" && (hit.poi.kind === "dungeon" || hit.poi.kind === "raid" || hit.poi.kind === "delve") ? DoorOpen : MapPin);

  return (
    <div className={styles.searchBox} data-map-ui data-open={showing ? "" : undefined}>
      <label className={styles.searchField}>
        <Search aria-hidden="true" />
        <input ref={input} type="search" value={query} placeholder={copy.search} aria-label={copy.searchLabel}
          role="combobox" aria-expanded={showing} aria-controls="world-map-hits" aria-autocomplete="list"
          aria-activedescendant={showing && hits[active] ? `hit-${hits[active].key}` : undefined}
          onFocus={() => { setOpen(true); wantAlt(); }} onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(hits.length - 1, a + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === "Enter" && showing && hits[active]) { e.preventDefault(); pick(hits[active]); }
            if (e.key === "Escape") { e.stopPropagation(); if (query) setQuery(""); else input.current?.blur(); }
          }} />
        {query ? (
          <button type="button" className={styles.searchClear} aria-label={copy.clear} onMouseDown={(e) => e.preventDefault()} onClick={() => { setQuery(""); input.current?.focus(); }}>
            <X aria-hidden="true" />
          </button>
        ) : null}
      </label>
      {showing ? (
        <ul ref={list} id="world-map-hits" role="listbox" aria-label={query.trim() ? copy.searchLabel : copy.recent} className={styles.hits} data-map-ui-scroll>
          {!query.trim() ? <li className={styles.hitsHeading} role="presentation"><Clock aria-hidden="true" />{copy.recent}</li> : null}
          {hits.length ? hits.map((hit, i) => {
            const HitIcon = Icon(hit);
            return (
              <li key={hit.key} id={`hit-${hit.key}`} role="option" aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()} onClick={() => pick(hit)} onMouseEnter={() => setActive(i)}>
                <HitIcon aria-hidden="true" className={styles.hitIcon} data-type={hit.type} />
                <span className={styles.hitTitle}>{hit.title}</span>
                <span className={styles.hitMeta}>{meta(hit)}</span>
              </li>
            );
          }) : <li className={styles.nothing} role="presentation">{copy.nothing}</li>}
        </ul>
      ) : null}
    </div>
  );
}
