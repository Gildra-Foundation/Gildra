import Image from "next/image";
import { Flag, HeartPulse, Shield, Skull, Swords, Users } from "lucide-react";
import type { CSSProperties } from "react";
import type { RaidPullPlan, RaidPullRole } from "./raidPullTypes";
import { raidBossPlannerCopy } from "./raidBossPlannerCopy";
import frame from "./raidPulls.module.css";
import styles from "./raidBossPlanner.module.css";

const markerIcons = { boss: Skull, add: Swords, objective: Flag, tank: Shield, healer: HeartPulse, dps: Swords, group: Users };

/** Deliberately schematic geometry; never overlaid as measured arena positions. */
export function RaidBossDiagram({ plan, active, locale, role, background }: { plan: RaidPullPlan; active: number; locale: "ru" | "en"; role: RaidPullRole | "all"; background: "grid" | "art" }) {
  const pull = plan.pulls[active];
  const diagram = plan.encounter?.diagrams[pull.id];
  const t = raidBossPlannerCopy[locale];
  if (!diagram) return null;
  const markers = diagram.markers.filter(marker => role === "all" || !["tank", "healer", "dps"].includes(marker.kind) || marker.kind === role);
  return <figure className={`${frame.mapFigure} ${styles.diagram}`} data-raid-schematic data-boss-diagram={pull.id}>
    <figcaption><span>{pull.title[locale]}</span><small>{t.grid}</small></figcaption>
    <div className={frame.mapViewport} role="group" aria-label={`${t.grid}: ${pull.title[locale]}`}>
      <div className={styles.diagramPlane} data-layout={diagram.layout} data-background={background}>
        {background === "art" && <Image src={plan.artwork} alt="" fill sizes="(max-width: 900px) 100vw, 800px" className={styles.diagramArt} />}
        {diagram.zones.map((zone, index) => <span key={`${zone.label.en}:${zone.x}:${zone.y}:${zone.rotate ?? 0}`} className={styles.zone} data-kind={zone.kind} aria-hidden="true" style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%`, rotate: zone.rotate ? `${zone.rotate}deg` : undefined } as CSSProperties}><b>{index + 1}</b></span>)}
        {markers.map((marker) => {
          const Icon = markerIcons[marker.kind];
          return <span key={`${marker.kind}:${marker.x}:${marker.y}:${marker.label.en}`} className={styles.marker} data-kind={marker.kind} style={{ "--marker-x": `${marker.x}%`, "--marker-y": `${marker.y}%` } as CSSProperties}><span><Icon size={22} aria-hidden="true" /></span><b>{marker.label[locale]}</b></span>;
        })}
      </div>
    </div>
    <ol className={styles.diagramKey}>{diagram.zones.map((zone, index) => <li key={`${zone.label.en}:${zone.x}:${zone.y}:${zone.rotate ?? 0}`}><b>{index + 1}</b>{zone.label[locale]} <small>· {t[zone.kind]}</small></li>)}</ol>
    <p className={frame.mapNote}>{t.schematic}</p>
  </figure>;
}
