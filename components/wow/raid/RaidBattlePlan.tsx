import type { CSSProperties } from "react";
import Image from "next/image";
import { Flag, Swords } from "lucide-react";
import { RaidDisclosure } from "./RaidDisclosure";
import type { RaidTactic, TacticalPhase } from "./midnightRaidTactics";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import styles from "./raidGuide.module.css";

/**
 * Battle plan of one encounter: every phase shows its raid-lead call; step order,
 * target priority, failures and the arena plan fold underneath.
 */
export function RaidBattlePlan({ tactic, bossArtwork, locale }: { tactic: RaidTactic; bossArtwork: string; locale: RaidLocale }) {
  const copy = raidGuideCopy[locale];
  return (
    <ol className={styles.phases} data-testid="raid-tactical-board">
      {tactic.phases.map((phase, index) => (
        <li key={phase.id} className={styles.phase}>
          <span className={styles.phaseIndex} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <div className={styles.phaseBody}>
            <h3 className={styles.phaseName}>{phase.name[locale]}</h3>
            <p className={styles.phaseCall}>{phase.summary[locale]}</p>
            <RaidDisclosure summary={copy.planMore}>
              <div className={styles.phaseDetail}>
                <div className={styles.phaseLists}>
                  <section>
                    <h4>{copy.steps}</h4>
                    <ol className={styles.numbered}>{phase.steps.map((step) => <li key={step.en}>{step[locale]}</li>)}</ol>
                  </section>
                  <section>
                    <h4>{copy.priorities}</h4>
                    <ol className={styles.numbered}>{phase.priorities.map((item) => <li key={item.en}>{item[locale]}</li>)}</ol>
                  </section>
                  <section>
                    <h4>{copy.dangers}</h4>
                    <ul className={styles.warnings}>{phase.dangers.map((item) => <li key={item.en}>{item[locale]}</li>)}</ul>
                  </section>
                </div>
                <ArenaPlan phase={phase} bossArtwork={bossArtwork} locale={locale} />
              </div>
            </RaidDisclosure>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Schematic arena: numbered zones (explained in the key) and encounter markers; no player markers. */
function ArenaPlan({ phase, bossArtwork, locale }: { phase: TacticalPhase; bossArtwork: string; locale: RaidLocale }) {
  const copy = raidGuideCopy[locale];
  return (
    <figure className={styles.arena}>
      <div className={styles.arenaBoard} data-layout={phase.layout} role="img" aria-label={copy.arenaLabel(phase.name[locale])}>
        {phase.zones.map((zone, index) => (
          <span
            key={`${zone.label.en}-${index}`}
            className={styles.zone}
            data-kind={zone.kind}
            style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%`, transform: zone.rotate ? `rotate(${zone.rotate}deg)` : undefined } as CSSProperties}
          >
            <b>{index + 1}</b>
          </span>
        ))}
        {phase.markers.map((marker, index) => (
          <span key={`${marker.label.en}-${index}`} className={styles.marker} data-kind={marker.kind} style={{ left: `${marker.x}%`, top: `${marker.y}%` }}>
            <span className={styles.markerIcon}>
              {marker.kind === "boss" ? <Image src={bossArtwork} alt="" width={40} height={40} /> : marker.kind === "add" ? <Swords /> : <Flag />}
            </span>
            {/* Boss names are game terms and stay English. */}
            <b>{marker.kind === "boss" ? marker.label.en : marker.label[locale]}</b>
          </span>
        ))}
      </div>
      <figcaption className={styles.arenaLegend}>
        <ol>
          {phase.zones.map((zone, index) => (
            <li key={`${zone.label.en}-${index}`} data-kind={zone.kind}><b>{index + 1}</b>{zone.label[locale]} <small>· {copy.zoneKinds[zone.kind]}</small></li>
          ))}
        </ol>
        <span>{copy.arenaNorth}</span>
      </figcaption>
    </figure>
  );
}
