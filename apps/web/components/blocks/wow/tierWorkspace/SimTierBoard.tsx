"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { AtlasSection } from "@gildra/atlas-ui/AtlasSection";
import { AtlasTabs } from "@gildra/atlas-ui/AtlasTabs";
import { SpecSlot } from "@/components/SpecSlot";
import { tierSectionCopy } from "@/components/tierSectionCopy";
import type { Lang } from "@/lib/i18n-paths";
import { ANCHORS } from "@/lib/anchors";
import { lessMotion } from "@/lib/client/motionPreference";
import { MaterialLinkButton, MaterialPlaque, type AnyMaterialKit, type MaterialKit } from "@/components/wow/shared/materialAtlas";
import { SIM_GEAR, SIM_ROLES, SIM_TARGETS, simTierCopy, type SimGear, type SimRole, type SimTargets } from "./simTierCopy";
import { simRows, type SimRow, type SimTierResponse } from "./simTierRows";
import { TierMark, classKey, classStyle, tierStyle } from "./tierVisuals";
import { SourceAbout } from "./TierSources";
import styles from "./tierWorkspace.module.css";

const ENDPOINT = "/v1/meta/wow/tier-list/sim";
let request: Promise<SimTierResponse> | null = null;

/** One request per page view, shared by every mount of the tab. */
function loadSimTier() {
  request ??= fetch(ENDPOINT).then(async (response) => {
    if (!response.ok) throw new Error(`sim tier list failed (${response.status})`);
    return await response.json() as SimTierResponse;
  }).catch((error: unknown) => {
    request = null;
    throw error;
  });
  return request;
}

function useSimTier() {
  const [state, setState] = useState<{ data?: SimTierResponse; error?: boolean }>({});
  useEffect(() => {
    let live = true;
    loadSimTier().then((data) => { if (live) setState({ data }); }).catch(() => { if (live) setState({ error: true }); });
    return () => { live = false; };
  }, []);
  return state;
}

const isTargets = (value: number): value is SimTargets => (SIM_TARGETS as readonly number[]).includes(value);
const isGear = (value: string | null): value is SimGear => Boolean(value && (SIM_GEAR as readonly string[]).includes(value));

/**
 * The sim source tab of /tier-lists: mythistone.com's simulated damage by
 * target count (1/3/5/8) and gear set, damage specs and tanks, as horizontal
 * bars with the gap to the leader, and a spec card with its rank at every
 * target count. Targets and gear set live in the URL next to the page's own
 * source and role.
 */
export function SimTierBoard({ lang, role, onRole, sourcePicker, specNames, specHref, kits }: {
  lang: Lang;
  role: SimRole;
  onRole: (role: SimRole) => void;
  sourcePicker: ReactNode;
  specNames: Record<string, { specName: string; className: string }>;
  specHref: (classSlug: string, specSlug: string) => string | undefined;
  kits: { filters: AnyMaterialKit; table: AnyMaterialKit; about: AnyMaterialKit; roles: Record<string, MaterialKit> };
}) {
  const copy = simTierCopy[lang];
  const { data, error } = useSimTier();
  const [targets, setTargets] = useState<SimTargets>(1);
  const [gear, setGear] = useState<SimGear>("best");
  const [selectedKey, setSelectedKey] = useState("");
  const [urlRead, setUrlRead] = useState(false);
  const detailTitle = useRef<HTMLHeadingElement>(null);
  const number = useMemo(() => new Intl.NumberFormat(tierSectionCopy[lang].numberLocale), [lang]);
  const percent = useMemo(() => new Intl.NumberFormat(tierSectionCopy[lang].numberLocale, { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "always" }), [lang]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetParam = Number(params.get("targets"));
    if (isTargets(targetParam)) setTargets(targetParam);
    const gearParam = params.get("gear");
    if (isGear(gearParam)) setGear(gearParam);
    setUrlRead(true);
    return () => {
      // Leaving the tab: its own keys leave the address with it.
      const url = new URL(window.location.href);
      url.searchParams.delete("targets");
      url.searchParams.delete("gear");
      window.history.replaceState(window.history.state, "", url);
    };
  }, []);

  useEffect(() => {
    if (!urlRead) return;
    const url = new URL(window.location.href);
    if (targets === 1) url.searchParams.delete("targets"); else url.searchParams.set("targets", String(targets));
    if (gear === "best") url.searchParams.delete("gear"); else url.searchParams.set("gear", gear);
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [urlRead, targets, gear]);

  const tables = data?.data.tables;
  const rowsByRole = useMemo(() => Object.fromEntries(SIM_ROLES.map((value) => [value, simRows(tables?.find((item) => item.role === value && item.targets === targets), gear, specNames)])) as Record<SimRole, SimRow[]>, [tables, targets, gear, specNames]);
  const rows = rowsByRole[role];
  const selected = rows.find((row) => row.key === selectedKey) ?? rows[0];
  const top = rows[0]?.value ?? 1;
  const loading = !data && !error;
  const targetsLabel = copy.targetsLabel(targets);

  /** The selected spec at every target count, for the same gear set. */
  const byTargets = useMemo(() => selected ? SIM_TARGETS.map((count) => {
    const row = simRows(tables?.find((item) => item.role === role && item.targets === count), gear, specNames).find((item) => item.key === selected.key);
    return { count, row };
  }) : [], [selected, tables, role, gear, specNames]);

  const selectRow = (row: SimRow) => {
    setSelectedKey(row.key);
    if (!window.matchMedia("(max-width: 1199px)").matches) return;
    window.requestAnimationFrame(() => {
      document.getElementById("sim-detail")?.scrollIntoView({ behavior: lessMotion() ? "auto" : "smooth", block: "start" });
      detailTitle.current?.focus({ preventScroll: true });
    });
  };

  const behindLabel = (row: SimRow) => row.position === 1 ? copy.leader : `${percent.format(Number(row.behind.toFixed(1)))}%`;

  const controls = (
    <MaterialPlaque kit={kits.filters} className={styles.filters} role="group" aria-label={copy.title}>
      {sourcePicker}
      <div className={styles.controls}>
        <div className={`${styles.field} ${styles.fieldSource}`}>
          <span className={styles.label} id="sim-targets-label">{copy.targets}</span>
          <div className={styles.segmented} role="group" aria-labelledby="sim-targets-label">
            {SIM_TARGETS.map((count) => (
              <button type="button" key={count} className={styles.segment} aria-pressed={targets === count} onClick={() => setTargets(count)}>{copy.targetsLabel(count)}</button>
            ))}
          </div>
        </div>
        <div className={`${styles.field} ${styles.fieldGrow}`}>
          <label className={styles.label} htmlFor="sim-gear">{copy.gear}</label>
          <span className={styles.selectShell}>
            <select id="sim-gear" className={styles.select} value={gear} onChange={(event) => { if (isGear(event.target.value)) setGear(event.target.value); }}>
              {SIM_GEAR.map((value) => <option key={value} value={value}>{copy.gearNames[value]}</option>)}
            </select>
            <ChevronDown aria-hidden="true" />
          </span>
        </div>
      </div>
    </MaterialPlaque>
  );

  const bar = (row: SimRow, className: string) => (
    <span className={className} style={classStyle(row.class_slug)} aria-hidden="true"><span style={{ inlineSize: `${Math.max(2, row.value / top * 100).toFixed(1)}%` }} /></span>
  );

  const table = (simRole: SimRole) => (
    <div className={styles.tableBox} aria-busy={loading} data-scrollbox>
      {rowsByRole[simRole].length ? (
        <table className={`${styles.table} ${styles.simTable}`}>
          <caption className={styles.srOnly}>{copy.caption(copy.roles[simRole], targetsLabel, copy.gearNames[gear])}</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.simRank}>{copy.rank}</th>
              <th scope="col" className={styles.simTier}>{copy.tier}</th>
              <th scope="col">{copy.spec}</th>
              <th scope="col" className={styles.simBarCol}><span className={styles.srOnly}>{copy.gearNames[gear]}</span></th>
              <th scope="col" className={styles.num}>{copy.dps}</th>
              <th scope="col" className={`${styles.num} ${styles.simBehindCol}`}>{copy.behind}</th>
            </tr>
          </thead>
          <tbody>
            {rowsByRole[simRole].map((row) => {
              const isSelected = selected?.key === row.key;
              return (
                <tr key={row.key} className={isSelected ? styles.selectedRow : undefined} style={tierStyle(row.tier)}>
                  <td className={styles.simRank}>{row.position}</td>
                  <td className={styles.simTier}><TierMark tier={row.tier} label={copy.tier} size="sm" /></td>
                  <td className={styles.specCell}>
                    <div className={styles.specInner}>
                      <SpecSlot name={`${row.specName} ${row.className}`} cls={classKey(row.class_slug)} classSlug={row.class_slug} specSlug={row.spec_slug} />
                      <span className={styles.simSpecText}>
                        <button type="button" className={styles.specButton} style={classStyle(row.class_slug)} aria-controls="sim-detail" aria-current={isSelected ? "true" : undefined} onClick={() => selectRow(row)}>
                          <span className={styles.specName}>{row.specName}</span>
                          <span className={styles.className}>{row.className}</span>
                        </button>
                        {bar(row, `${styles.simBar} ${styles.simBarNarrow}`)}
                      </span>
                    </div>
                  </td>
                  <td className={styles.simBarCol}>{bar(row, styles.simBar)}</td>
                  <td className={`${styles.num} ${styles.simValue}`}>
                    <b>{number.format(row.value)}</b>
                    <span className={styles.simBehindNarrow}>{behindLabel(row)}</span>
                  </td>
                  <td className={`${styles.num} ${styles.simBehindCol} ${row.position === 1 ? styles.simLeader : ""}`}>{behindLabel(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : loading ? null : <p className={styles.empty}>{error ? copy.loadError : copy.empty}</p>}
      {loading ? <div className={styles.loading} role="status"><span aria-hidden="true" /><b>{copy.loading}</b></div> : null}
    </div>
  );

  const cardKit = kits.roles[role] ?? kits.roles.dps;
  const selectedPage = selected ? specHref(selected.class_slug, selected.spec_slug) : undefined;
  const total = rows.length;

  return (
    <div className={styles.workspace} id={ANCHORS.tierList}>
      <AtlasSection id={ANCHORS.builds} className={styles.section} title={copy.title} description={`${copy.sourceName} · ${targetsLabel} · ${copy.gearNames[gear]}`}>
        <div className={styles.sectionBody}>
          {controls}
          <div className={styles.board}>
            <div className={styles.main}>
              <MaterialPlaque kit={kits.table} className={styles.tablePlaque}>
                <AtlasTabs label={copy.role} variant="segmented" value={role} onChange={(id) => { onRole(id as SimRole); setSelectedKey(""); }}
                  tabs={SIM_ROLES.map((value) => ({
                    id: value,
                    label: copy.roles[value],
                    count: rowsByRole[value].length || undefined,
                    content: value === role ? <div className={styles.rolePanel}>{table(value)}</div> : null,
                  }))} />
              </MaterialPlaque>
            </div>

            <aside className={styles.detail} id="sim-detail" aria-labelledby={selected ? "sim-detail-title" : undefined} aria-label={selected ? undefined : copy.detailLabel}>
              <MaterialPlaque kit={cardKit} className={styles.detailPlaque}>
                <p className={styles.detailEyebrow}>{copy.detailLabel}</p>
                {selected ? (
                  <>
                    <div className={styles.detailHead}>
                      <SpecSlot name={`${selected.specName} ${selected.className}`} cls={classKey(selected.class_slug)} classSlug={selected.class_slug} specSlug={selected.spec_slug} size="lg" />
                      <div className={styles.detailName} style={classStyle(selected.class_slug)}>
                        <h3 id="sim-detail-title" ref={detailTitle} tabIndex={-1} className={styles.detailTitle}>{selected.specName} <span className={styles.className}>{selected.className}</span></h3>
                        <p className={styles.detailRank}><TierMark tier={selected.tier} label={copy.tier} size="sm" />{copy.rankLine(selected.position, total, targetsLabel)}</p>
                      </div>
                    </div>
                    <dl className={styles.metrics}>
                      {(["popular", "simcbis", "top50"] as const).map((set) => (
                        <div key={set} className={styles.metric}><dt>{copy.gearNames[set]}</dt><dd>{selected.dps[set] ? number.format(selected.dps[set]) : copy.notSimmed}</dd></div>
                      ))}
                      <div className={styles.metric}><dt>{copy.behind}</dt><dd>{behindLabel(selected)}</dd></div>
                    </dl>
                    <div className={styles.simByTargets} role="group" aria-label={copy.byTargets}>
                      <p className={styles.label}>{copy.byTargets}</p>
                      <div className={styles.simTargetGrid}>
                        {byTargets.map(({ count, row }) => (
                          <button type="button" key={count} className={styles.simTargetCell} aria-pressed={count === targets} disabled={!row} aria-label={copy.pickTargets(copy.targetsLabel(count))} onClick={() => setTargets(count as SimTargets)}>
                            <span className={styles.simTargetCount} aria-hidden="true">{count}</span>
                            {row ? <span className={styles.simTargetRank}><TierMark tier={row.tier} label={copy.tier} size="sm" />{copy.rank}{row.position}</span> : <span className={styles.simTargetRank}>{copy.notSimmed}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                    {selectedPage ? <div className={styles.detailActions}><MaterialLinkButton kit={cardKit} fit="block" href={selectedPage} variant="primary" iconAfter={<ArrowRight aria-hidden="true" />}>{copy.specPage}</MaterialLinkButton></div> : null}
                  </>
                ) : <p className={styles.detailEmpty}>{loading ? copy.loading : error ? copy.loadError : copy.empty}</p>}
              </MaterialPlaque>
            </aside>
          </div>
        </div>
      </AtlasSection>
      {data ? <SourceAbout lang={lang} source="sim" activity="mythic_plus" role={role} difficulty="" updatedAt={data.data.simmed_on ? `${data.data.simmed_on}T00:00:00Z` : data.checkedAt ?? data.fetchedAt} kit={kits.table} buttonKit={kits.about} /> : null}
    </div>
  );
}
