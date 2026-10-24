import Image from "next/image";
import type { CSSProperties } from "react";
import type { MetaSpec } from "@/lib/games/wow/mythicPlusMetaView";
import type { MythicMetaCopy } from "./mythicMetaCopy";
import styles from "./mythicMeta.module.css";

const percent = (value: number, locale: "en" | "ru") => `${value.toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
export const formatPresence = percent;

/** Octagon spec icon + English spec name, class name in its class colour. */
export function SpecIdentity({ spec, size = "md", showClass = true }: { spec: MetaSpec; size?: "sm" | "md" | "lg"; showClass?: boolean }) {
  const px = size === "lg" ? 64 : size === "sm" ? 28 : 40;
  return (
    <span className={styles.identity} data-size={size} style={{ "--class-color": spec.color } as CSSProperties}>
      <span className={styles.octagon} aria-hidden="true">
        {spec.icon ? <Image src={spec.icon} alt="" width={px} height={px} sizes={`${px}px`} /> : null}
      </span>
      <span className={styles.identityText}>
        <span className={styles.specName} lang="en">{spec.specName}</span>
        {showClass ? <span className={styles.className} lang="en">{spec.className}</span> : null}
      </span>
    </span>
  );
}

/** Week-on-week change in percentage points; words for screen readers, arrow and number for the eye. */
export function Delta({ value, copy, locale }: { value: number | null; copy: MythicMetaCopy; locale: "en" | "ru" }) {
  if (value === null) return <span className={styles.delta} data-trend="new">{copy.newEntry}</span>;
  if (Math.abs(value) < 0.05) return <span className={styles.delta} data-trend="flat" title={copy.noChange}>±0</span>;
  const shown = Math.abs(value).toLocaleString(locale, { maximumFractionDigits: 1 });
  const up = value > 0;
  return (
    <span className={styles.delta} data-trend={up ? "up" : "down"}>
      <span aria-hidden="true">{up ? "▲" : "▼"} {shown}</span>
      <span className={styles.srOnly}>{up ? copy.up(shown) : copy.down(shown)}</span>
    </span>
  );
}

/** Tiny server-rendered line of a series (no chart library); null breaks the line. */
export function Sparkline({ values, label, width = 96, height = 28, max }: { values: Array<number | null>; label: string; width?: number; height?: number; max?: number }) {
  const top = max ?? Math.max(1, ...values.map((value) => value ?? 0));
  const step = values.length > 1 ? (width - 4) / (values.length - 1) : 0;
  const point = (value: number, index: number) => `${(2 + index * step).toFixed(1)},${(height - 3 - (value / top) * (height - 6)).toFixed(1)}`;
  const runs: string[][] = [[]];
  values.forEach((value, index) => {
    if (value === null) runs.push([]);
    else runs[runs.length - 1].push(point(value, index));
  });
  const last = values.length - 1;
  const end = values[last];
  return (
    <svg className={styles.sparkline} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {runs.filter((run) => run.length).map((run, index) => <polyline key={index} points={run.join(" ")} />)}
      {end !== null && end !== undefined ? <circle cx={2 + last * step} cy={height - 3 - (end / top) * (height - 6)} r="2.5" /> : null}
    </svg>
  );
}

/** "Week 1: 7.8%, Week 2: …" — the sparkline's accessible name. */
export function trendLabel(spec: MetaSpec, copy: MythicMetaCopy, locale: "en" | "ru") {
  return `${spec.specName}: ${spec.trend.map((value, index) => `${copy.week(index + 1)} ${value === null ? "—" : percent(value, locale)}`).join(", ")}`;
}

export function PresenceBar({ value, max }: { value: number; max: number }) {
  return <span className={styles.bar} aria-hidden="true"><span style={{ inlineSize: `${Math.min(100, (value / max) * 100).toFixed(1)}%` }} /></span>;
}
