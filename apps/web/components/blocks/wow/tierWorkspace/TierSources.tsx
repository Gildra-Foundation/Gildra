"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { Lang } from "@/lib/i18n-paths";
import type { TierEntry, TierRole } from "@/lib/platform/games/intelligence";
import { tierSourcesCopy } from "./tierSourcesCopy";
import { listParams, sourceKey, type ListQuery, type SourceSlice, type TierMode, type TierSourceSlices } from "./tierSourceKeys";
import styles from "./tierWorkspace.module.css";

const ROLES = ["dps", "healer", "tank"] as const;

type ListResponse = { entries: TierEntry[]; updatedAt: string; tiersDerived?: boolean };

/** Responses shared by every mount for the page view: switching back to a tab needs no new request. */
const listCache = new Map<string, Promise<SourceSlice>>();

function loadList(query: ListQuery) {
  const key = sourceKey(query);
  let request = listCache.get(key);
  if (!request) {
    request = Promise.all(ROLES.map(async (role) => {
      const response = await fetch(`/v1/meta/wow/tier-list?${listParams(query, role)}`);
      // A role the source does not rank (no tanks in an arena list) is an empty row, not a failure.
      if (response.status === 404) return { entries: [], updatedAt: "" } satisfies ListResponse;
      if (!response.ok) throw new Error(`tier list failed (${response.status})`);
      return await response.json() as ListResponse;
    })).then((snapshots) => {
      if (snapshots.every((item) => !item.entries.length)) throw new Error("tier list is empty");
      return {
        roles: Object.fromEntries(ROLES.map((role, index) => [role, snapshots[index].entries])) as Record<TierRole, TierEntry[]>,
        updatedAt: snapshots.map((item) => item.updatedAt).filter(Boolean).sort()[0] ?? "",
        tiersDerived: snapshots.some((item) => item.tiersDerived),
      };
    }).catch((error: unknown) => {
      listCache.delete(key);
      throw error;
    });
    listCache.set(key, request);
  }
  return request;
}

/** The three role lists of one source tab. Slices rendered on the server (`initial`) are used as they are;
 *  `null` loads nothing (another tab is open). */
export function useTierList(query: ListQuery | null, initial: TierSourceSlices) {
  const key = query ? sourceKey(query) : "";
  const preloaded = key ? initial[key] : undefined;
  const [state, setState] = useState<{ key: string; data?: SourceSlice; error?: boolean }>({ key: "" });

  useEffect(() => {
    if (!query || preloaded) return;
    let live = true;
    loadList(query).then((data) => { if (live) setState({ key, data }); }).catch(() => { if (live) setState({ key, error: true }); });
    return () => { live = false; };
    // The key carries every part of the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, preloaded]);

  const current = preloaded ? { key, data: preloaded } : state.key === key ? state : { key };
  return { data: current.data, error: Boolean(current.error), loading: Boolean(key) && !current.data && !current.error };
}

export type CompareColumn = { source: string; status: string; tiersDerived?: boolean; entries: TierEntry[] };
export type CompareResponse = { activity: TierMode; role: TierRole; bracket?: string; updatedAt: string; columns: CompareColumn[]; consensus: TierEntry[] };

const compareCache = new Map<string, Promise<CompareResponse>>();

/** Every source's list and the consensus for one mode and role (GET /v1/meta/wow/tier-list/compare). */
export function useTierCompare(params: { mode: TierMode; role: TierRole; bracket?: string; difficulty?: string } | null) {
  const search = useMemo(() => {
    if (!params) return "";
    const query = new URLSearchParams({ activity: params.mode, role: params.role });
    if (params.mode === "pvp" && params.bracket) query.set("bracket", params.bracket);
    if (params.mode === "raid" && params.difficulty) query.set("difficulty", params.difficulty);
    return query.toString();
  }, [params]);
  const [state, setState] = useState<{ key: string; data?: CompareResponse; error?: boolean }>({ key: "" });

  useEffect(() => {
    if (!search) return;
    let request = compareCache.get(search);
    if (!request) {
      request = fetch(`/v1/meta/wow/tier-list/compare?${search}`).then(async (response) => {
        if (!response.ok) throw new Error(`comparison failed (${response.status})`);
        return await response.json() as CompareResponse;
      }).catch((error: unknown) => {
        compareCache.delete(search);
        throw error;
      });
      compareCache.set(search, request);
    }
    let live = true;
    request.then((data) => { if (live) setState({ key: search, data }); }).catch(() => { if (live) setState({ key: search, error: true }); });
    return () => { live = false; };
  }, [search]);

  const current = state.key === search ? state : { key: search };
  return { data: current.data, error: Boolean(current.error), loading: Boolean(search) && !current.data && !current.error };
}

type Spec = { specName: string; className: string; classSlug: string; specSlug: string };

/** Spec rows (consensus order) × the consensus tier and every source's own tier, with how far they agree. */
export function SourceCompare({ lang, caption, data, sourceLabel, classStyle, tierStyle, renderSpec, specNames, href, busy }: {
  lang: Lang;
  caption: string;
  data: CompareResponse;
  sourceLabel: (source: string) => string;
  classStyle: (slug: string) => CSSProperties;
  tierStyle: (tier: string) => CSSProperties;
  renderSpec: (entry: Spec) => ReactNode;
  specNames: (entry: TierEntry) => Spec;
  href: (entry: Spec) => string | undefined;
  busy: boolean;
}) {
  const copy = tierSourcesCopy[lang];
  const columns = data.columns;
  const rows = useMemo(() => data.consensus.map((entry) => {
    const tiers = columns.map((column) => column.entries.find((item) => item.classSlug === entry.classSlug && item.specSlug === entry.specSlug)?.tier);
    // A+ and A share a band: agreement compares the letter, against the consensus letter.
    const letters = tiers.filter((tier): tier is string => Boolean(tier)).map((tier) => tier.charAt(0));
    return { entry, spec: specNames(entry), tiers, agree: letters.filter((letter) => letter === entry.tier.charAt(0)).length, known: letters.length };
  }), [columns, data.consensus, specNames]);

  return (
    <div className={styles.tableBox} data-scrollbox aria-busy={busy} data-loading={busy || undefined}>
      <table className={`${styles.table} ${styles.compareTable}`}>
        <caption className={styles.srOnly}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.compareRank}>#</th>
            <th scope="col" className={styles.compareSpecHead}>{copy.spec}</th>
            <th scope="col" className={`${styles.compareCol} ${styles.compareConsensus}`}>{copy.consensus}</th>
            {columns.map((column) => <th key={column.source} scope="col" className={styles.compareCol}>{sourceLabel(column.source)}</th>)}
            <th scope="col" className={`${styles.num} ${styles.compareAgree}`}>{copy.agreement}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ entry, spec, tiers, agree, known }, index) => {
            const link = href(spec);
            const name = <><span className={styles.specName}>{spec.specName}</span><span className={styles.className}>{spec.className}</span></>;
            return (
              <tr key={`${entry.classSlug}:${entry.specSlug}`}>
                <td className={styles.compareRank}>{index + 1}</td>
                <th scope="row" className={styles.specCell}>
                  <span className={styles.specInner}>
                    {renderSpec(spec)}
                    {link ? <a className={styles.specLink} href={link} style={classStyle(entry.classSlug)}>{name}</a> : <span className={styles.specButton} style={classStyle(entry.classSlug)}>{name}</span>}
                  </span>
                </th>
                <td className={`${styles.compareCol} ${styles.compareConsensus}`}>
                  <span className={`${styles.tierChip} ${styles.tierChipStrong}`} style={tierStyle(entry.tier)}><span className={styles.srOnly}>{copy.consensus} </span>{entry.tier}</span>
                </td>
                {tiers.map((tier, column) => (
                  <td key={columns[column].source} className={styles.compareCol}>
                    {tier ? <span className={styles.tierChip} style={tierStyle(tier)}><span className={styles.srOnly}>{sourceLabel(columns[column].source)} </span>{tier}</span> : <span className={styles.compareNone} aria-label={copy.noTier}>—</span>}
                  </td>
                ))}
                <td className={`${styles.num} ${styles.compareAgree}`}>
                  <span className={styles.agreeMeter} aria-label={copy.agreeSome(agree, known)} title={copy.agreeSome(agree, known)}>
                    <span className={styles.agreeTrack} aria-hidden="true"><span style={{ inlineSize: `${known ? Math.round(agree / known * 100) : 0}%` }} /></span>
                    <span aria-hidden="true">{agree}/{known}</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
