"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Flame, Skull } from "lucide-react";
import { clock } from "@/lib/games/wow/mythicPlusRunsTypes";
import { forcesShare, type ReplayPull, type RunReplay } from "@/lib/games/wow/mythicPlusReplayModel";
import { upgradeMarks } from "@/lib/games/wow/mythicPlusRunTypes";
import { lessMotion } from "@gildra/atlas-ui/motionPreference";
import { communityCopy } from "./communityCopy";
import styles from "./runReplay.module.css";

export type ReplayEnemyLabel = { name: string; lang?: string; portrait?: string };

type Props = {
  locale: "en" | "ru";
  replay: RunReplay;
  /** Dungeon map (planner canvas, 3:2) and its painted frame; absent for dungeons we have no map of. */
  map?: { image: string; frameStyle: CSSProperties; markerImage: string };
  enemies: Record<number, ReplayEnemyLabel>;
  /** Class colour per player name. */
  colors: Record<string, string | undefined>;
  timerMs: number;
  clearMs: number;
};

const percent = (value: number) => `${Math.max(0, Math.min(100, value))}%`;
const timeAttr = (ms: number) => `PT${Math.max(0, Math.round(ms / 1000))}S`;

/** Markers closer than this (% of the map) are fanned out so each stays clickable. */
function spread(pulls: ReplayPull[]) {
  const placed: Array<{ n: number; x: number; y: number }> = [];
  for (const pull of pulls) {
    if (pull.x === undefined || pull.y === undefined) continue;
    let { x, y } = pull;
    for (let step = 0; step < 6 && placed.some((other) => Math.hypot((other.x - x) * 1.5, other.y - y) < 4.6); step += 1) {
      const angle = (step + 1) * 1.9;
      x = pull.x + Math.cos(angle) * 2.6 * (1 + step / 3);
      y = pull.y + Math.sin(angle) * 3.9 * (1 + step / 3);
    }
    placed.push({ n: pull.n, x, y });
  }
  return new Map(placed.map((point) => [point.n, point]));
}

export function RunReplay({ locale, replay, map, enemies, colors, timerMs, clearMs }: Props) {
  const copy = communityCopy[locale].replay;
  const [selected, setSelected] = useState(1);
  const [hover, setHover] = useState<number | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const positions = useMemo(() => spread(replay.pulls), [replay.pulls]);
  const pull = replay.pulls.find((entry) => entry.n === selected) ?? replay.pulls[0];
  const shown = hover ?? selected;
  const number = new Intl.NumberFormat(locale === "ru" ? "ru" : "en", { maximumFractionDigits: 1 });

  function reveal(n: number, smooth: boolean) {
    const point = positions.get(n), box = viewport.current;
    if (!point || !box || (box.scrollWidth <= box.clientWidth + 4 && box.scrollHeight <= box.clientHeight + 4)) return;
    box.scrollTo({ left: (point.x / 100) * box.scrollWidth - box.clientWidth / 2, top: (point.y / 100) * box.scrollHeight - box.clientHeight / 2, behavior: smooth && !lessMotion() ? "smooth" : "instant" });
  }
  function choose(n: number, scroll = false) {
    setSelected(n);
    if (scroll) reveal(n, true);
  }
  // On a phone the map scrolls inside its frame: open it on the first pull.
  useEffect(() => {
    const frame = requestAnimationFrame(() => reveal(1, false));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  const route = replay.pulls.flatMap((entry) => { const point = positions.get(entry.n); return point ? [{ n: entry.n, x: point.x * 1.5, y: point.y }] : []; });
  const pathTo = (limit: number) => route.filter((point) => point.n <= limit).map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");

  return (
    <div className={styles.replay} style={map ? { "--pull-marker-image": `url("${map.markerImage}")` } as CSSProperties : undefined}>
      <div className={styles.workspace} data-map={map ? "" : undefined}>
        {map ? (
          <figure className={styles.frame} style={map.frameStyle}>
            <span className={styles.frameArt} aria-hidden="true" />
            <div ref={viewport} className={styles.viewport} role="region" tabIndex={0} aria-label={copy.mapLabel}>
              <div className={styles.map}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the planner canvas keeps its own pixels and marker plane */}
                <img src={map.image} alt="" width={1680} height={1120} decoding="async" />
                <svg className={styles.path} viewBox="0 0 150 100" preserveAspectRatio="none" aria-hidden="true">
                  <path d={pathTo(Infinity)} className={styles.pathAhead} />
                  <path d={pathTo(selected)} className={styles.pathDone} />
                </svg>
                {replay.pulls.map((entry) => {
                  const point = positions.get(entry.n);
                  if (!point) return null;
                  return (
                    <button
                      key={entry.n}
                      type="button"
                      className={styles.marker}
                      style={{ left: `${point.x}%`, top: `${point.y}%` }}
                      data-boss={entry.boss ? "" : undefined}
                      data-done={entry.n < selected ? "" : undefined}
                      aria-pressed={entry.n === selected}
                      aria-controls="run-pull"
                      aria-label={`${copy.pull} ${entry.n}${entry.boss ? ` · ${entry.boss}` : ""} · ${clock(entry.toMs)}`}
                      onClick={() => choose(entry.n)}
                      onPointerEnter={(event) => { if (event.pointerType === "mouse") setHover(entry.n); }}
                      onPointerLeave={() => setHover(null)}
                    >
                      <b aria-hidden="true">{entry.n}</b>
                      {entry.deaths ? <span className={styles.markerDeaths} aria-hidden="true"><Skull />{entry.deaths > 1 ? entry.deaths : null}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </figure>
        ) : null}
        {pull ? <PullPanel pull={pull} replay={replay} enemies={enemies} colors={colors} copy={copy} number={number} onStep={(n) => choose(n, true)} /> : null}
      </div>

      <Timeline replay={replay} timerMs={timerMs} clearMs={clearMs} selected={selected} shown={shown} colors={colors} copy={copy} onChoose={choose} onHover={setHover} />
    </div>
  );
}

type Copy = (typeof communityCopy)["en"]["replay"];

function PullPanel({ pull, replay, enemies, colors, copy, number, onStep }: {
  pull: ReplayPull; replay: RunReplay; enemies: Props["enemies"]; colors: Props["colors"]; copy: Copy; number: Intl.NumberFormat; onStep: (n: number) => void;
}) {
  const deaths = replay.deaths.filter((death) => death.pull === pull.n);
  const count = pull.enemies.reduce((sum, enemy) => sum + enemy.count, 0);
  const start = pull.startMs ?? pull.fromMs;
  const fight = pull.boss ? replay.fights.find((entry) => entry.kill && entry.name === pull.boss) : undefined;
  return (
    <aside id="run-pull" className={styles.panel} aria-label={`${copy.pull} ${pull.n}`}>
      <header className={styles.panelHead}>
        <b className={styles.panelNumber} aria-hidden="true">{pull.n}</b>
        <div className={styles.panelTitle}>
          <h3 aria-live="polite" aria-atomic="true">{pull.boss ?? `${copy.pull} ${pull.n}`}</h3>
          <span>{copy.enemies(count)}{replay.totalForces && pull.forces ? ` · ${copy.forces} ${number.format(forcesShare(pull.forces, replay.totalForces))}%` : ""}</span>
        </div>
        <div className={styles.panelSteps}>
          <button type="button" disabled={pull.n <= 1} aria-label={copy.previous} onClick={() => onStep(pull.n - 1)}><ChevronLeft aria-hidden="true" /></button>
          <button type="button" disabled={pull.n >= replay.pulls.length} aria-label={copy.next} onClick={() => onStep(pull.n + 1)}><ChevronRight aria-hidden="true" /></button>
        </div>
      </header>
      <dl className={styles.panelFacts}>
        <div><dt>{copy.time}</dt><dd><time dateTime={timeAttr(start)}>{clock(start)}</time>{pull.toMs > start + 1_000 ? <>–<time dateTime={timeAttr(pull.toMs)}>{clock(pull.toMs)}</time></> : null}</dd></div>
        {fight ? <div><dt>{copy.fight}</dt><dd>{clock(fight.endMs - fight.startMs)}</dd></div> : pull.startMs !== undefined && pull.toMs > pull.startMs ? <div><dt>{copy.fight}</dt><dd>{clock(pull.toMs - pull.startMs)}</dd></div> : null}
        <div><dt>{copy.deaths}</dt><dd>{deaths.length}</dd></div>
      </dl>
      <ul className={styles.enemies}>
        {pull.enemies.map((enemy) => {
          const label = enemies[enemy.npcId];
          return (
            <li key={enemy.npcId}>
              {/* eslint-disable-next-line @next/next/no-img-element -- 40 px portrait already sized on disk */}
              {label?.portrait ? <img src={label.portrait} alt="" width={40} height={40} loading="lazy" decoding="async" /> : <span className={styles.portraitBlank} aria-hidden="true" />}
              <span className={styles.enemyName} lang={label?.lang}>{label?.name ?? `#${enemy.npcId}`}</span>
              <span className={styles.enemyCount}>×{enemy.count}</span>
              {replay.totalForces && enemy.forces ? <span className={styles.enemyForces}>{number.format(forcesShare(enemy.forces, replay.totalForces))}%</span> : <span className={styles.enemyForces} />}
            </li>
          );
        })}
      </ul>
      {deaths.length ? (
        <ul className={styles.deaths}>
          {deaths.map((death, index) => (
            <li key={`${death.player}-${death.atMs}-${index}`}>
              <Skull aria-hidden="true" />
              <time dateTime={timeAttr(death.atMs)}>{clock(death.atMs)}</time>
              <b style={{ color: colors[death.player] }}>{death.player}</b>
              {death.ability ? (
                <span className={styles.killer} lang={death.ability.lang}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- game icon from Blizzard's render CDN, as the affixes */}
                  {death.ability.icon ? <img src={`https://render.worldofwarcraft.com/eu/icons/56/${death.ability.icon}.jpg`} alt="" width={18} height={18} loading="lazy" decoding="async" /> : null}
                  {death.ability.name}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}

function Timeline({ replay, timerMs, clearMs, selected, shown, colors, copy, onChoose, onHover }: {
  replay: RunReplay; timerMs: number; clearMs: number; selected: number; shown: number; colors: Props["colors"]; copy: Copy;
  onChoose: (n: number, scroll?: boolean) => void; onHover: (n: number | null) => void;
}) {
  const scale = Math.max(timerMs, clearMs, replay.durationMs);
  const at = (ms: number) => (ms / scale) * 100;
  const marks = [...upgradeMarks].map((mark) => ({ label: `+${mark.chests}`, ms: timerMs * mark.share })).concat({ label: "+1", ms: timerMs });
  const total = replay.totalForces || 1;
  const curve = replay.curve.map(([ms, forces]) => `${at(ms).toFixed(2)},${(100 - Math.min(100, (forces / total) * 100)).toFixed(2)}`);
  const area = curve.length > 1 ? `M0,100 L${curve.join(" L")} L${at(replay.curve[replay.curve.length - 1][0]).toFixed(2)},100 Z` : "";
  const line = curve.length > 1 ? `M${curve.join(" L")}` : "";
  const ticks: number[] = [];
  for (let ms = 5 * 60_000; ms < scale - 60_000; ms += 5 * 60_000) ticks.push(ms);
  const shownPull = replay.pulls.find((pull) => pull.n === shown);

  return (
    <div className={styles.timeline} role="group" aria-label={copy.timeline}>
      <div className={styles.plot}>
        <svg className={styles.curve} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={area} className={styles.curveArea} />
          <path d={line} className={styles.curveLine} />
        </svg>
        {replay.combat.map(([start, end], index) => (
          <span key={`c${index}`} className={styles.combat} style={{ left: percent(at(start)), width: percent(at(end) - at(start)) }} aria-hidden="true" />
        ))}
        {replay.fights.map((fight, index) => (
          <span key={`f${index}`} className={styles.fight} data-wipe={fight.kill ? undefined : ""} style={{ left: percent(at(fight.startMs)), width: percent(at(fight.endMs) - at(fight.startMs)) }} title={`${fight.name}${fight.kill ? "" : ` · ${copy.wipe}`}`} aria-hidden="true" />
        ))}
        {shownPull ? <span className={styles.cursor} style={{ left: percent(at(shownPull.toMs)) }} aria-hidden="true" /> : null}
        {marks.map((mark) => (
          <span key={mark.label} className={styles.threshold} style={{ left: percent(at(mark.ms)) }} data-reached={clearMs <= mark.ms ? "" : undefined} aria-hidden="true"><span>{mark.label}</span></span>
        ))}
        <span className={styles.full} aria-hidden="true">100%</span>
      </div>

      <ol className={styles.pulls} aria-label={copy.pulls}>
        {replay.pulls.map((pull) => {
          const start = pull.startMs ?? pull.fromMs;
          return (
            <li key={pull.n} style={{ left: percent(at(start)), width: `max(10px, ${percent(at(pull.toMs) - at(start))})` }}>
              <button
                type="button"
                data-boss={pull.boss ? "" : undefined}
                aria-pressed={pull.n === selected}
                aria-controls="run-pull"
                aria-label={`${copy.pull} ${pull.n}${pull.boss ? ` · ${pull.boss}` : ""} · ${clock(start)}`}
                onClick={() => onChoose(pull.n, true)}
                onPointerEnter={(event) => { if (event.pointerType === "mouse") onHover(pull.n); }}
                onPointerLeave={() => onHover(null)}
              >{at(pull.toMs) - at(start) >= 1.6 || pull.n === selected ? <span aria-hidden="true">{pull.n}</span> : null}</button>
            </li>
          );
        })}
      </ol>

      <div className={styles.events}>
        {replay.lust.map((ms) => (
          <span key={`l${ms}`} className={styles.lust} style={{ left: percent(at(ms)) }} title={`${copy.lust} · ${clock(ms)}`}>
            <Flame aria-hidden="true" /><span className={styles.srOnly}>{copy.lust} {clock(ms)}</span>
          </span>
        ))}
        {replay.deaths.map((death, index) => (
          <span key={`d${index}`} className={styles.death} style={{ left: percent(at(death.atMs)), color: colors[death.player] }} title={`${clock(death.atMs)} · ${death.player}${death.ability ? ` · ${death.ability.name}` : ""}`}>
            <Skull aria-hidden="true" /><span className={styles.srOnly}>{clock(death.atMs)} {death.player}{death.ability ? ` — ${death.ability.name}` : ""}</span>
          </span>
        ))}
      </div>

      <div className={styles.axis} aria-hidden="true">
        <span style={{ left: 0 }}>0:00</span>
        {ticks.map((ms) => <span key={ms} style={{ left: percent(at(ms)) }}>{clock(ms)}</span>)}
      </div>

      <ul className={styles.legend} aria-hidden="true">
        <li><i className={styles.legendForces} />{copy.forces}</li>
        <li><i className={styles.legendBoss} />{copy.boss}</li>
        {replay.fights.some((fight) => !fight.kill) ? <li><i className={styles.legendWipe} />{copy.wipe}</li> : null}
        <li><Skull />{copy.deaths}</li>
        {replay.lust.length ? <li><Flame />{copy.lust}</li> : null}
      </ul>
    </div>
  );
}

/** The dungeon map in its frame without a route (a run with no log). */
export function MapStill({ image, frameStyle, className }: { image: string; frameStyle: CSSProperties; className?: string }) {
  return (
    <figure className={`${styles.frame} ${className ?? ""}`} style={frameStyle} data-still="" aria-hidden="true">
      <span className={styles.frameArt} />
      <div className={styles.viewport}>
        <div className={styles.map}>
          {/* eslint-disable-next-line @next/next/no-img-element -- same planner canvas as the route map */}
          <img src={image} alt="" width={1680} height={1120} loading="lazy" decoding="async" />
        </div>
      </div>
    </figure>
  );
}
