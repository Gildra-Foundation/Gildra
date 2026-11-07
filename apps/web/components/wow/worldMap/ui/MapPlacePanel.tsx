"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronUp, DoorOpen, Hourglass, LocateFixed, Pickaxe, Skull, X } from "lucide-react";
import type { AtlasEvent, AtlasPoi, Lang } from "@/lib/wow/worldMap/bundle";
import { worldMapCopy } from "../worldMapCopy";
import type { PlaceFacts } from "./placeFacts";
import styles from "../worldMapViewer.module.css";

export type PanelSelection = { type: "poi"; poi: AtlasPoi; where: string } | { type: "event"; event: AtlasEvent } | null;

const INSTANCE_ICON = { raid: Skull, dungeon: DoorOpen, delve: Pickaxe } as const;

/**
 * The place panel: the chosen point or event, else what the place in focus
 * holds — its dungeons, raids and delves (links to their pages) and the events
 * of the timeline there. On desktop it hangs under the title; on phones it is
 * a bottom sheet that opens from a handle.
 */
export function MapPlacePanel({ lang, facts, selection, sheet, onClose, onPoi, onEvent }: {
  lang: Lang; facts: PlaceFacts | null; selection: PanelSelection; sheet: boolean;
  onClose(): void; onPoi(poi: AtlasPoi): void; onEvent(event: AtlasEvent): void;
}) {
  const copy = worldMapCopy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  const [open, setOpen] = useState(false);
  // The chosen event is in the card already: the list shows the others.
  const chosen = selection?.type === "event" ? selection.event.id : null;
  const events = facts?.events.filter((event) => event.id !== chosen) ?? [];
  const hasFacts = Boolean(facts && (facts.instances.length || events.length));
  // A new choice opens the sheet; the place's lists stay folded until asked for.
  const [shown, setShown] = useState(selection);
  if (shown !== selection) { setShown(selection); if (selection) setOpen(true); }
  if (!selection && !hasFacts) return null;

  const instancesTitle = facts?.instances.some((poi) => poi.kind === "delve") ? copy.instancesAndDelves : copy.layer.instances;
  const detail = selection ? (
    <article className={styles.card} aria-live="polite">
      <button type="button" className={styles.cardClose} onClick={onClose} aria-label={copy.close}><X aria-hidden="true" /></button>
      {selection.type === "poi" ? (
        <>
          <p className={styles.cardKind}>
            {copy.kind[selection.poi.kind]}{selection.poi.faction && selection.poi.faction !== "neutral" ? ` · ${copy.faction[selection.poi.faction]}` : ""}
          </p>
          <h2 className={styles.cardTitle}>{selection.poi.name}</h2>
          {selection.where ? <p className={styles.cardText}>{selection.where}</p> : null}
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

  const lists = facts && hasFacts ? (
    <div className={styles.placeLists}>
      {facts.instances.length ? (
        <section aria-labelledby="map-place-instances">
          <h2 id="map-place-instances" className={styles.placeHeading}>{instancesTitle}</h2>
          <ul className={styles.placeList}>
            {facts.instances.map((poi) => {
              const Icon = INSTANCE_ICON[poi.kind as keyof typeof INSTANCE_ICON] ?? DoorOpen;
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
        </section>
      ) : null}
      {events.length ? (
        <section aria-labelledby="map-place-events">
          <h2 id="map-place-events" className={styles.placeHeading}>{copy.events}</h2>
          <ul className={styles.placeList}>
            {events.map((event) => (
              <li key={event.id}>
                <span className={styles.placeIcon} data-event="" aria-hidden="true"><Hourglass /></span>
                <button type="button" className={styles.placeName} onClick={() => onEvent(event)}>
                  <span>{event.title}</span>
                  <span className={styles.placeMeta}>{copy.patch} {event.patch}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  ) : null;

  if (!sheet) return <div className={styles.place} data-map-ui>{detail}{lists}</div>;
  return (
    <div className={styles.place} data-map-ui data-sheet="" data-open={open ? "" : undefined}>
      {lists ? (
        <button type="button" className={styles.sheetHandle} aria-expanded={open} aria-controls="map-place-sheet" onClick={() => setOpen((o) => !o)}>
          <span>{[facts?.instances.length ? instancesTitle : "", events.length ? copy.events : ""].filter(Boolean).join(" · ")}</span>
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
