"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Lang } from "@/lib/i18n-paths";
import type { TierActivity, TierEntry, TierRole } from "@/lib/platform/games/intelligence";
import { tierSourcesCopy, type TierSourcesCopy } from "./tierSourcesCopy";
import { sourceKey, type ExternalTierSource, type SourceSlice, type TierSourceId, type TierSourceSlices } from "./tierSourceKeys";
import styles from "./tierWorkspace.module.css";

const ROLES = ["dps", "healer", "tank"] as const;
const TIER_ORDER = ["S", "A", "B", "C", "D", "F"];

export const SOURCE_META: Record<ExternalTierSource, { name: string; site: string; raid: boolean; page: (activity: TierActivity, role: TierRole, difficulty: string) => string }> = {
  mythicstats: { name: "mythicstats.com", site: "mythicstats.com", raid: false, page: () => "https://mythicstats.com/spec" },
  ugg: {
    name: "u.gg",
    site: "u.gg",
    raid: true,
    page: (activity, role, difficulty) => {
      const base = `https://u.gg/wow/tier-list/${role}-rankings`;
      if (activity === "mythic_plus") return base;
      const level = ({ raid_normal: "normal", raid_hero: "heroic", raid_myth: "mythic" } as Record<string, string>)[difficulty];
      return level ? `${base}/raid?difficulty=${level}` : `${base}/raid`;
    },
  },
};

/** Loads the three role lists of one external source for a mode (and raid
 *  difficulty). Slices rendered on the server (`initial`) are used as they are. */
export function useSourceRoles(source: TierSourceId, activity: TierActivity, difficulty: string, initial: TierSourceSlices) {
  const [state, setState] = useState<{ key: string; data?: SourceSlice; error?: boolean }>({ key: "" });
  const key = source === "gildra" || (source === "mythicstats" && activity === "raid") ? "" : sourceKey(source, activity, difficulty);
  const preloaded = key ? initial[key] : undefined;

  useEffect(() => {
    if (!key || preloaded || source === "gildra") return;
    const controller = new AbortController();
    Promise.all(ROLES.map(async (role) => {
      const params = new URLSearchParams({ source, activity, role, limit: "60" });
      if (activity === "raid") params.set("difficulty", difficulty);
      const response = await fetch(`/v1/meta/wow/tier-list?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`source tier list failed (${response.status})`);
      return await response.json() as { entries: TierEntry[]; updatedAt: string };
    })).then((snapshots) => {
      setState({ key, data: {
        roles: Object.fromEntries(ROLES.map((role, index) => [role, snapshots[index].entries])) as Record<TierRole, TierEntry[]>,
        updatedAt: snapshots.map((item) => item.updatedAt).sort()[0],
      } });
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ key, error: true });
    });
    return () => controller.abort();
  }, [key, preloaded, source, activity, difficulty]);

  const current = preloaded ? { key, data: preloaded } : state.key === key ? state : { key };
  return { data: current.data, error: Boolean(current.error), loading: Boolean(key) && !current.data && !current.error };
}

/** "updated 3h ago", computed after mount so the server HTML never disagrees with the clock. */
function useAgo(iso: string | undefined, copy: TierSourcesCopy) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!iso) return;
    const update = () => {
      const hours = Math.floor((Date.now() - Date.parse(iso)) / 3_600_000);
      setLabel(hours < 1 ? copy.justNow : hours < 48 ? copy.hoursAgo(hours) : copy.daysAgo(Math.floor(hours / 24)));
    };
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [iso, copy]);
  return label;
}

/** Badge «Source · updated N h ago» with the link back to the original page. */
export function SourceBadge({ lang, source, activity, role, difficulty, updatedAt }: { lang: Lang; source: ExternalTierSource; activity: TierActivity; role: TierRole; difficulty: string; updatedAt?: string }) {
  const copy = tierSourcesCopy[lang];
  const meta = SOURCE_META[source];
  const ago = useAgo(updatedAt, copy);
  return (
    <div className={styles.provenance}>
      <p className={styles.provenanceLine}>
        <span className={styles.provenanceDot} aria-hidden="true" />
        <span>{copy.sourceBy}: <b>{meta.name}</b></span>
        {ago && updatedAt ? <><span aria-hidden="true">·</span><time dateTime={updatedAt}>{ago}</time></> : null}
        <a className={styles.provenanceLink} href={meta.page(activity, role, difficulty)} target="_blank" rel="noreferrer">{copy.openOn(meta.site)}<ArrowUpRight aria-hidden="true" /></a>
      </p>
      <p className={styles.provenanceNote}>{copy.attribution[source]}</p>
    </div>
  );
}

type CompareRow = { key: string; specName: string; className: string; classSlug: string; tiers: (string | undefined)[]; average: number };

/** Spec rows × source tiers for one mode and role, sorted by the average position. */
export function SourceCompare({ lang, activity, role, columns, classStyle, renderSpec }: {
  lang: Lang;
  activity: TierActivity;
  role: TierRole;
  columns: { id: TierSourceId; label: string; short: string; entries?: TierEntry[] }[];
  classStyle: (slug: string) => CSSProperties;
  renderSpec: (entry: { specName: string; className: string; classSlug: string; specSlug: string }) => React.ReactNode;
}) {
  const copy = tierSourcesCopy[lang];
  const rows = useMemo(() => {
    const map = new Map<string, CompareRow & { positions: number[]; specSlug: string }>();
    columns.forEach((column, index) => {
      (column.entries ?? []).forEach((entry, position) => {
        const key = `${entry.classSlug}:${entry.specSlug}`;
        const row = map.get(key) ?? { key, specName: entry.specName, className: entry.className, classSlug: entry.classSlug, specSlug: entry.specSlug, tiers: columns.map(() => undefined), positions: [], average: 0 };
        row.tiers[index] = entry.tier;
        row.positions.push((position + 1) / Math.max(column.entries?.length ?? 1, 1));
        map.set(key, row);
      });
    });
    return [...map.values()].map((row) => ({ ...row, average: row.positions.reduce((sum, value) => sum + value, 0) / row.positions.length }))
      .sort((a, b) => a.average - b.average);
  }, [columns]);

  return (
    <div className={styles.compare}>
      <div className={styles.compareHead}>
        <p>{copy.compareLede}</p>
      </div>
      <div className={styles.tableBox} data-scrollbox>
        <table className={`${styles.table} ${styles.compareTable}`}>
          <caption className={styles.srOnly}>{`${copy.compareTitle} · ${activity} · ${role}`}</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.compareRank}>#</th>
              <th scope="col">{copy.spec}</th>
              {columns.map((column) => <th key={column.id} scope="col" className={styles.compareCol}><span className={styles.compareLong}>{column.label}</span><abbr className={styles.compareShort} title={column.label}>{column.short}</abbr></th>)}
              <th scope="col" className={`${styles.num} ${styles.compareAgree}`}>{copy.agreement}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              // A+ and A share a tier band: agreement compares the letter only.
              const known = row.tiers.filter((tier): tier is string => Boolean(tier)).map((tier) => tier.charAt(0));
              const counts = TIER_ORDER.map((tier) => known.filter((value) => value === tier).length);
              const top = Math.max(...counts);
              return (
                <tr key={row.key}>
                  <td className={styles.compareRank}>{index + 1}</td>
                  <td className={styles.specCell}>
                    <div className={styles.specInner}>
                      {renderSpec(row)}
                      <span className={styles.specButton} style={classStyle(row.classSlug)}>
                        <span className={styles.specName}>{row.specName}</span>
                        <span className={styles.className}>{row.className}</span>
                      </span>
                    </div>
                  </td>
                  {row.tiers.map((tier, column) => (
                    <td key={columns[column].id} className={styles.compareCol}>
                      {tier ? <span className={`${styles.tierMark} ${styles.tierMarkSm}`} data-tier={tier.charAt(0).toLowerCase()}><span className={styles.srOnly}>{columns[column].label} </span>{tier}</span> : <span className={styles.compareNone}>{copy.noTier}</span>}
                    </td>
                  ))}
                  <td className={`${styles.num} ${styles.compareAgree}`}>
                    <span className={top === known.length && known.length > 1 ? styles.agreeAll : styles.agreeSome}>{top === known.length && known.length > 1 ? <><span role="img" aria-label={copy.agreeAll} title={copy.agreeAll}>✓ </span><span className={styles.compareLong} aria-hidden="true">{copy.agreeAll}</span></> : <><span className={styles.compareLong}>{copy.agreeSome(top, known.length)}</span><span className={styles.compareShort}>{top}/{known.length}</span></>}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
