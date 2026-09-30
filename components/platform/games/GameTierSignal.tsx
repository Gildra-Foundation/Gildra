"use client";

import { useState } from "react";
import type { Lang } from "@/lib/i18n";
import type { TierEntry, TierRole } from "@/lib/platform/games/intelligence";
import { GameSparkline } from "./GameSparkline";
import styles from "./gameHub.module.css";

type RoleSignalData = Record<TierRole, { entries: TierEntry[]; series: number[] }>;

export function GameTierSignal({
  accent,
  signalLabel,
  lang,
  providerLabel,
  roles,
}: {
  accent: string;
  signalLabel: string;
  lang: Lang;
  providerLabel: string;
  roles: RoleSignalData;
}) {
  const [role, setRole] = useState<TierRole>("dps");
  const { entries, series } = roles[role];
  const roleLabels: Record<TierRole, string> = {
    dps: "DPS",
    healer: lang === "ru" ? "ЛЕКАРИ" : "HEALERS",
    tank: lang === "ru" ? "ТАНКИ" : "TANKS",
  };
  const formatNumber = (value: number) => new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "en-US", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);

  return (
    <section className={styles.signalPanel} data-reveal>
      <header className={styles.signalHeading}>
        <div><span>{providerLabel}</span><h2>{lang === "ru" ? "Живой тир-лист Mythic+" : "Live Mythic+ tier list"}</h2></div>
        <div role="radiogroup" aria-label={signalLabel}>
          {(["dps", "healer", "tank"] as const).map((value) => (
            <button type="button" role="radio" aria-checked={role === value} className={role === value ? styles.rangeActive : ""} onClick={() => setRole(value)} key={value}>
              {roleLabels[value]}
            </button>
          ))}
        </div>
      </header>
      <div className={styles.tierSignalContent}>
        <div className={styles.tierRows}>
          {entries.map((entry) => <a href={entry.guideUrl || entry.sourceUrl} target="_blank" rel="noreferrer" className={styles.tierEntry} key={`${entry.role}-${entry.specSlug}`} data-reveal-item>
            <span className={styles.tierRank}>{entry.rank}</span>
            <b className={styles[`tier${entry.tier.replace("+", "Plus")}`] ?? ""}>{entry.tier}</b>
            <span><strong>{entry.specName}</strong><small>{entry.className}</small></span>
            <em>{entry.score !== undefined ? formatNumber(entry.score) : entry.maxKey ? `+${entry.maxKey}` : "—"}</em>
            <i className={entry.rankChange && entry.rankChange > 0 ? styles.positive : entry.rankChange && entry.rankChange < 0 ? styles.negative : ""}>{entry.rankChange ? `${entry.rankChange > 0 ? "+" : ""}${entry.rankChange}` : "—"}</i>
          </a>)}
        </div>
        <aside className={styles.tierTelemetry}>
          <div><small>{lang === "ru" ? "Лидер роли" : "Role leader"}</small><strong>{entries[0]?.specName ?? "—"}</strong><span>{entries[0]?.tier ? `${entries[0].tier} tier` : "—"}</span></div>
          {series.length > 1 ? <GameSparkline values={series} accent={accent} /> : null}
        </aside>
      </div>
    </section>
  );
}
