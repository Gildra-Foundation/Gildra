"use client";
import { useEffect, useRef } from "react";
import { Link2 } from "lucide-react";
import { AtlasTabs } from "@gildra/atlas-ui/AtlasTabs";
import type { Lang } from "@/lib/i18n-paths";
import { MapViewport } from "./map/MapViewport";
import { mapCopy } from "./map/mapCopy";
import { navigateDungeon, readDungeonLocation, useDungeonLocation } from "./map/navigation";
import { revealEncounter } from "./DungeonRoute";
import styles from "./map/map.module.css";

export type InstanceMap = { src: string; width: number; height: number; label?: Partial<Record<Lang, string>> };
/** One-based encounter/floor indexes; positions are optional verified area anchors, never inferred. */
export type MapAssociation = { encounter: number; floor: number; x?: number; y?: number };
export function InstanceMaps({ maps, src, viewBox, name, lang, bosses = [], associations = [], selectedEncounter }: {
  maps?: InstanceMap[]; src?: string; viewBox?: string; name: string; lang: Lang; bosses?: string[]; associations?: MapAssociation[]; selectedEncounter?: number;
}) {
  const location = readDungeonLocation(useDungeonLocation());
  const t = mapCopy[lang];
  const floors = maps?.length ? maps : src ? [{ src, width: undefined, height: undefined, label: undefined }] : [];
  const valid = associations.filter(item => Number.isInteger(item.floor) && item.floor > 0 && item.floor <= floors.length && Number.isInteger(item.encounter) && item.encounter > 0 && item.encounter <= bosses.length);
  const associatedFloor = valid.find(item => item.encounter === location.encounter)?.floor;
  const requested = location.mapFloor ?? associatedFloor ?? location.floor ?? 1;
  const floor = requested >= 1 && requested <= floors.length ? requested : 1;
  const initialFloor = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (initialFloor.current === undefined) initialFloor.current = readDungeonLocation(window.location.search + window.location.hash).mapFloor ?? null;
    if (initialFloor.current !== floor) return;
    initialFloor.current = null;
    document.getElementById(`map-floor-${floor}`)?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [floor]);
  if (!floors.length) return null;
  const content = (map: typeof floors[number], index: number) => {
    const selected = valid.find(item => item.encounter === (location.encounter ?? selectedEncounter) && item.floor === index + 1);
    const activePoint = selected && Number.isFinite(selected.x) && Number.isFinite(selected.y) ? { x: selected.x!, y: selected.y! } : undefined;
    const label = map.label?.[lang] ?? `${t.floor} ${index + 1}`;
    return <div id={`map-floor-${index + 1}`} className={styles.step}>
      <MapViewport key={map.src} src={map.src} width={map.width} height={map.height} viewBox={maps?.length ? undefined : viewBox} label={`${t.map}: ${name} — ${label}`} lang={lang} activePoint={activePoint}
        tools={floors.length > 1 && <a href={`?mapFloor=${index + 1}#map-floor-${index + 1}`} aria-label={t.link} title={t.link} onClick={event => {
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); navigateDungeon(`#map-floor-${index + 1}`, index + 1);
        }}><Link2 aria-hidden="true" /></a>}>
        {valid.filter(item => item.floor === index + 1 && Number.isFinite(item.x) && Number.isFinite(item.y) && item.x! >= 0 && item.x! <= 100 && item.y! >= 0 && item.y! <= 100).map(item => <a
          key={item.encounter} className={styles.pin} style={{ left: `${item.x}%`, top: `${item.y}%` }} href={`?mapFloor=${item.floor}#encounter-${item.encounter}`}
          aria-label={`${item.encounter}. ${t.area}: ${bosses[item.encounter - 1]}`} aria-current={(location.encounter ?? selectedEncounter) === item.encounter ? "true" : undefined}
          onClick={event => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigateDungeon(`#encounter-${item.encounter}`, item.floor); requestAnimationFrame(() => revealEncounter(`#encounter-${item.encounter}`, true)); }}>{item.encounter}</a>)}
      </MapViewport>
    </div>;
  };
  return <div className={styles.root} data-instance-map data-floor={floor}>
    {floors.length === 1 ? content(floors[0], 0) : <AtlasTabs label={t.map} value={String(floor)} onChange={id => navigateDungeon(`#map-floor-${id}`, Number(id))} tabs={floors.map((map, index) => ({ id: String(index + 1), label: map.label?.[lang] ?? `${t.floor} ${index + 1}`, content: content(map, index) }))} />}
  </div>;
}
