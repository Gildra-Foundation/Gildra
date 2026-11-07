"use client";

import { useState, type ReactNode } from "react";
import { ArrowUpRight, ChevronDown, ChevronUp, Hourglass, LocateFixed, MapPin, X } from "lucide-react";
import type { AtlasEvent, AtlasMap, AtlasPoi, Lang } from "@/lib/wow/worldMap/bundle";
import { worldMapCopy } from "../worldMapCopy";
import { EVENT_ICON, KIND_ICON } from "./mapIcons";
import type { PlaceFacts } from "./placeFacts";
import styles from "../worldMapViewer.module.css";

export type PanelSelection = { type: "poi"; poi: AtlasPoi; where: string; target?: string } | { type: "event"; event: AtlasEvent } | null;
type Section = "instances" | "places" | "events";

const FOLDED_KEY = "gildra.worldMap.folded";
function readFolded(): Section[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(FOLDED_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((key): key is Section => key === "instances" || key === "places" || key === "events") : [];
  } catch { return []; }
}

/**
 * The place panel: the chosen point or event, else what the place in focus
 * holds — its dungeons, raids and delves (links to their pages), its zones or
 * cities, and the events of the timeline there. Each list folds (the choice
 * is kept for the next visit). On desktop it hangs under the title; on phones
 * it is a bottom sheet that opens from a handle.
 */
export function MapPlacePanel({ lang, facts, places, placesTitle, placesKind, selection, sheet, onClose, onPoi, onEvent, onMap, onHoverMap }: {
  lang: Lang; facts: PlaceFacts | null; places: AtlasMap[]; placesTitle: string; placesKind: "zone" | "city"; selection: PanelSelection; sheet: boolean;
  onClose(): void; onPoi(poi: AtlasPoi): void; onEvent(event: AtlasEvent): void; onMap(id: number): void; onHoverMap(id: number | null): void;
}) {
  const copy = worldMapCopy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  const [open, setOpen] = useState(false);
  const [folded, setFolded] = useState<Section[]>(readFolded);
  // The chosen event is in the card already: the list shows the others.
  const chosen = selection?.type === "event" ? selection.event.id : null;
  const events = facts?.events.filter((event) => event.id !== chosen) ?? [];
  const instances = facts?.instances ?? [];
  const hasLists = Boolean(instances.length || events.length || places.length);
  // A new choice opens the sheet; the place's lists stay folded until asked for.
  const [shown, setShown] = useState(selection);
  if (shown !== selection) { setShown(selection); if (selection) setOpen(true); }
  if (!selection && !hasLists) return null;

  const fold = (section: Section) => {
    const next = folded.includes(section) ? folded.filter((key) => key !== section) : [...folded, section];
    setFolded(next);
    try { window.localStorage.setItem(FOLDED_KEY, JSON.stringify(next)); } catch { /* the choice lasts this visit */ }
  };
  const instancesTitle = instances.some((poi) => poi.kind === "delve") ? copy.instancesAndDelves : copy.instances;

  const detail = selection ? (
    <article className={styles.card} aria-live="polite" data-kind={selection.type === "poi" ? selection.poi.kind : "event"}>
      <button type="button" className={styles.cardClose} onClick={onClose} aria-label={copy.close}><X aria-hidden="true" /></button>
      {selection.type === "poi" ? (
        <>
          <p className={styles.cardKind}>
            {copy.kind[selection.poi.kind]}{selection.poi.faction && selection.poi.faction !== "neutral" ? ` · ${copy.faction[selection.poi.faction]}` : ""}
          </p>
          <h2 className={styles.cardTitle}>{selection.poi.name}</h2>
          {selection.target ? <p className={styles.cardText}>{copy.leadsTo}: {selection.target}</p> : selection.where ? <p className={styles.cardText}>{selection.where}</p> : null}
          {selection.poi.href ? <a className={styles.cardLink} href={`${prefix}${selection.poi.href}`}>{copy.open}<ArrowUpRight aria-hidden="true" /></a> : null}
        </>
      ) : (
        <>
          <p className={styles.cardKind}>{copy.patch} {selection.event.patch}{selection.event.year ? ` · ${selection.event.year}` : ""}</p>
          <h2 className={styles.cardTitle}>{selection.event.title}</h2>
          <p className={styles.cardText}>{selection.event.summary}</p>
          {selection.event.links.length ? (
            <div className={styles.cardActions}>
              {selection.event.links.map((link) => (
                <a key={link.href} className={styles.cardLink} href={`${prefix}${link.href}`}>{link.label ?? copy.open}<ArrowUpRight aria-hidden="true" /></a>
              ))}
            </div>
          ) : null}
        </>
      )}
    </article>
  ) : null;

  const section = (key: Section, title: string, body: ReactNode) => {
    const isOpen = !folded.includes(key);
    return (
      <section key={key} className={styles.placeSection} aria-labelledby={`map-place-${key}`}>
        <h2 className={styles.placeHeading}>
          <button type="button" id={`map-place-${key}`} aria-expanded={isOpen} aria-controls={`map-place-${key}-list`} onClick={() => fold(key)}>
            <span>{title}</span>
            <ChevronDown aria-hidden="true" />
          </button>
        </h2>
        <div id={`map-place-${key}-list`} className={styles.placeFold} data-open={isOpen ? "" : undefined} inert={!isOpen}>
          <div>{body}</div>
        </div>
      </section>
    );
  };

  const lists = hasLists ? (
    <div className={styles.placeLists}>
      {instances.length ? section("instances", instancesTitle, (
        <ul className={styles.placeList}>
          {instances.map((poi) => {
            const Icon = KIND_ICON[poi.kind];
            return (
              <li key={poi.id} data-kind={poi.kind}>
                <span className={styles.placeIcon} aria-hidden="true"><Icon /></span>
                <a href={`${prefix}${poi.href}`} className={styles.placeName}>
                  <span>{poi.name}</span>
                  <span className={styles.placeMeta}>{copy.kind[poi.kind]}</span>
                </a>
                <button type="button" className={styles.placeLocate} onClick={() => onPoi(poi)} aria-label={`${copy.showOnMap}: ${poi.name}`} title={copy.showOnMap}><LocateFixed aria-hidden="true" /></button>
              </li>
            );
          })}
        </ul>
      )) : null}
      {places.length ? section("places", placesTitle, (
        <ul className={styles.placeList} data-places="">
          {places.map((map) => (
            <li key={map.id} data-kind={placesKind} onPointerEnter={() => onHoverMap(map.id)} onPointerLeave={() => onHoverMap(null)}>
              <span className={styles.placeIcon} aria-hidden="true">{placesKind === "city" ? <KIND_ICON.city /> : <MapPin />}</span>
              <button type="button" className={styles.placeName} onClick={() => onMap(map.id)} onFocus={() => onHoverMap(map.id)} onBlur={() => onHoverMap(null)}>
                <span>{map.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )) : null}
      {events.length ? section("events", copy.events, (
        <ul className={styles.placeList}>
          {events.map((event) => {
            const Rune = EVENT_ICON[event.kind ?? ""] ?? Hourglass;
            return (
              <li key={event.id}>
                <span className={styles.placeIcon} data-event="" aria-hidden="true"><Rune /></span>
                <button type="button" className={styles.placeName} onClick={() => onEvent(event)}>
                  <span>{event.title}</span>
                  <span className={styles.placeMeta}>{copy.patch} {event.patch}{event.year ? ` · ${event.year}` : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )) : null}
    </div>
  ) : null;

  if (!sheet) {
    return (
      <div className={styles.place} data-map-ui>
        <div className={styles.placeScroll} data-map-ui-scroll>{detail}{lists}</div>
      </div>
    );
  }
  const handleTitle = [instances.length ? instancesTitle : "", places.length ? placesTitle : "", events.length ? copy.events : ""].filter(Boolean).slice(0, 2).join(" · ");
  return (
    <div className={styles.place} data-map-ui data-sheet="" data-open={open ? "" : undefined}>
      {lists ? (
        <button type="button" className={styles.sheetHandle} aria-expanded={open} aria-controls="map-place-sheet" onClick={() => setOpen((o) => !o)}>
          <span>{handleTitle}</span>
          <ChevronUp aria-hidden="true" />
        </button>
      ) : null}
      <div id="map-place-sheet" className={styles.sheetBody} hidden={!open && !selection} data-map-ui-scroll>
        {detail}
        {open ? lists : null}
      </div>
    </div>
  );
}
