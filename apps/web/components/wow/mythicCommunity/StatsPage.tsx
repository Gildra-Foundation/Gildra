import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { AtlasDisclosure, AtlasFrame, AtlasHero, AtlasTable, AtlasTabs } from "@/components/atlas";
import { MaterialPlaque, MythicHubBackdrop, MythicHubMotion, type MaterialKit } from "@/components/wow/shared/materialAtlas";
import { dungeonArtDirections, dungeonBackdropSmall } from "@/lib/wow/dungeonArtDirection";
import { loadMythicPlusStats } from "@/lib/games/wow/mythicPlusRuns";
import {
  runsRegions, type CohortSpec, type CutoffTier, type DungeonStats, type RegionCutoffs, type RunsQuery, type RunsRegion,
  type RunsRole, type SpecPresence, type StatsResponse, type WorldCutoffs,
} from "@/lib/games/wow/mythicPlusRunsTypes";
import { trail } from "@/lib/routes/registry";
import { CutoffChart, type ChartSeries } from "./CutoffChart";
import {
  dungeonLabel, GroupIcons, hrefWith, isSeasonDungeon, LoadState, NoMatch, number, percent, roleIcons, shareOf, specIndex, specLabel, SpecToken, StaleNotice, type Locale, type SpecView,
} from "./CommunityParts";
import { communityCopy, type CommunityCopy } from "./communityCopy";
import { statsCopy, type StatsCopy } from "./statsCopy";
import community from "./community.module.css";
import styles from "./stats.module.css";

const kit = "voidscar-arena" as const;
type Scope = RunsRegion | "world";
const scopeTone: Record<Scope, 0 | 1 | 2 | 3 | 4> = { world: 0, eu: 1, us: 2, kr: 3, tw: 4 };
const tierTone: Record<string, 1 | 2 | 3> = { p999: 2, p990: 1, p900: 3 };
const kpiTiers = ["p999", "p990", "p900"] as const;
const roleOrder: RunsRole[] = ["dps", "tank", "healer"];
const visibleSpecs = 6;

type Copy = { copy: CommunityCopy; text: StatsCopy; locale: Locale };
type Ctx = Copy & { data: StatsResponse; specs: Map<number, SpecView> };

/** /wow/mythic-plus/stats: a one-screen-and-a-bit dashboard of the season's ratings, specs, groups and dungeons. */
export async function StatsPage({ locale, query }: { locale: Locale; query: RunsQuery }) {
  const copy = communityCopy[locale];
  const text = statsCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const base = `${prefix}/wow/mythic-plus/stats`;
  const result = await loadMythicPlusStats({ region: query.region, dungeon: query.dungeon });
  const data = result.state === "ready" ? result.data : null;
  const crumbs = trail(locale, "mythicPlus", { label: text.breadcrumb });
  const scope: Scope = (query.region as RunsRegion | undefined) ?? (data?.worldCutoffs ? "world" : "eu");
  const ctx = data ? { data, copy, text, locale, specs: specIndex(data.specs, locale) } : null;

  return (
    <AtlasFrame lang={locale} className={`${community.page} ${styles.page}`} still foot={false} dataAttributes={{ "data-mythic-hub": true }}>
      <MythicHubBackdrop />
      <MythicHubMotion />
      <div className={styles.hero} data-hub-hero>
        <AtlasHero align="start" className={styles.heroHeader} breadcrumbs={crumbs} title={text.title} lede={text.lede} />
        {ctx ? <Kpis {...ctx} scope={scope} /> : null}
      </div>
      {data ? <StaleNotice data={data} copy={copy} /> : null}
      {data ? <FilterBar data={data} query={query} base={base} copy={copy} text={text} locale={locale} /> : null}
      {!ctx ? <LoadState result={result} kit={kit} copy={copy} resetHref={base} /> : (
        <div className={styles.grid} data-hub-reveal>
          <Cutoffs {...ctx} scope={scope} base={base} query={query} />
          <Ladder {...ctx} scope={scope} />
          {ctx.data.sample.runs ? (
            <>
              <Specs {...ctx} query={query} />
              <div className={styles.column}>
                <Comps {...ctx} query={query} />
                <Sample {...ctx} />
              </div>
              <Dungeons {...ctx} query={query} />
            </>
          ) : <MaterialPlaque kit={kit} className={`${styles.card} ${styles.full}`}><NoMatch copy={copy} resetHref={base} /></MaterialPlaque>}
        </div>
      )}
    </AtlasFrame>
  );
}

// ---- Data helpers -----------------------------------------------------------

function scopeCutoffs(data: StatsResponse, scope: Scope): WorldCutoffs | RegionCutoffs | undefined {
  return scope === "world" ? data.worldCutoffs : data.cutoffs[scope];
}

/** Change of a daily series against the point a week before its last day (null without that point). */
function weekDelta(points: Array<[string, number]> | undefined): number | null {
  if (!points || points.length < 2) return null;
  const [lastDay, last] = points[points.length - 1];
  const target = Date.parse(`${lastDay}T00:00:00Z`) - 7 * 86_400_000;
  for (let index = points.length - 2; index >= 0; index -= 1) {
    if (Date.parse(`${points[index][0]}T00:00:00Z`) <= target) return Math.round((last - points[index][1]) * 10) / 10;
  }
  return null;
}

const tierDelta = (cutoffs: WorldCutoffs | RegionCutoffs | undefined, key: string) => weekDelta(cutoffs?.history.find((item) => item.key === key)?.points);
const scopeName = (scope: Scope, copy: CommunityCopy, text: StatsCopy) => (scope === "world" ? text.world : copy.regions[scope]);
const scopeShort = (scope: Scope, copy: CommunityCopy, text: StatsCopy) => (scope === "world" ? text.world : copy.regionsShort[scope]);

function signed(value: number, locale: Locale, digits = 0) {
  const body = number(Math.abs(value), locale, digits);
  return value > 0 ? `+${body}` : value < 0 ? `−${body}` : body;
}

/** A small ▲/▼ change; `title` says over what period. */
function Delta({ value, locale, digits = 0, unit = "", hint }: { value: number | null | undefined; locale: Locale; digits?: number; unit?: string; hint?: string }) {
  if (value === null || value === undefined) return null;
  const rounded = Number(value.toFixed(digits));
  const tone = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
  return (
    <span className={styles.delta} data-tone={tone} title={hint}>
      <span aria-hidden="true">{tone === "up" ? "▲" : tone === "down" ? "▼" : "•"}</span>{signed(rounded, locale, digits)}
      {unit ? <span className={styles.unit}>{unit}</span> : null}
      {hint ? <span className={community.srOnly}> {hint}</span> : null}
    </span>
  );
}

function Sparkline({ values, label, width = 76, height = 22 }: { values: number[]; label: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (index: number) => 1 + (index / (values.length - 1)) * (width - 2);
  const y = (value: number) => 2 + (1 - (value - min) / Math.max(1, max - min)) * (height - 4);
  const points = values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  return (
    <svg className={styles.spark} viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label}>
      <polyline points={points} />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.2" />
    </svg>
  );
}

function Card({ id, title, kit: cardKit = kit, className, children, aside }: { id: string; title: ReactNode; kit?: MaterialKit; className?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <MaterialPlaque kit={cardKit} as="section" aria-labelledby={`${id}-title`} id={id} className={`${styles.card} ${className ?? ""}`}>
      <header className={styles.cardHead}>
        <h2 id={`${id}-title`} className={styles.cardTitle}>{title}</h2>
        {aside}
      </header>
      {children}
    </MaterialPlaque>
  );
}

// ---- Hero numbers -------------------------------------------------------------

function Kpis({ data, copy, text, locale, specs, scope }: Ctx & { scope: Scope }) {
  const cutoffs = scopeCutoffs(data, scope);
  const tier = (key: string) => cutoffs?.tiers.find((item) => item.key === key);
  const tag = scopeShort(scope, copy, text);
  const lead = data.specPresence[0];
  const items: Array<{ key: string; value: ReactNode; label: string; extra?: ReactNode }> = [];
  for (const key of kpiTiers) {
    const item = tier(key);
    if (item) items.push({ key, value: number(item.score, locale), label: `${text.tier(item.percent)} · ${tag}`, extra: <Delta value={tierDelta(cutoffs, key)} locale={locale} hint={text.week} /> });
  }
  if (cutoffs?.players) items.push({ key: "rated", value: compact(cutoffs.players, locale), label: `${text.rated} · ${tag}` });
  if (data.sample.runs) items.push({ key: "max", value: `+${data.overall.maxLevel}`, label: text.highestKey });
  if (lead && specs.get(lead.spec)) {
    const spec = specs.get(lead.spec)!;
    items.push({ key: "lead", value: <span className={styles.kpiSpec}><SpecToken spec={spec} size="sm" name={false} />{percent(lead.presence, locale)}</span>, label: specLabel(spec) });
  }
  return (
    <dl className={styles.kpis}>
      {items.map((item) => (
        <div key={item.key} className={styles.kpi}>
          <dt>{item.label}</dt>
          <dd><b>{item.value}</b>{item.extra}</dd>
        </div>
      ))}
    </dl>
  );
}

function compact(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: value >= 1_000_000 ? 2 : 0 }).format(value);
}

// ---- Filters ----------------------------------------------------------------------

function FilterBar({ data, query, base, copy, text, locale }: Copy & { data: StatsResponse; query: RunsQuery; base: string }) {
  const scopes: Array<Scope> = ["world", ...runsRegions];
  const current = (query.region as Scope | undefined) ?? "world";
  return (
    <MaterialPlaque kit={kit} as="nav" aria-label={copy.filters} className={styles.filterBar}>
      <ul className={styles.segment} aria-label={text.scope}>
        {scopes.map((scope) => (
          <li key={scope}>
            <a href={hrefWith(base, { region: scope === "world" ? undefined : scope, dungeon: query.dungeon })} aria-current={current === scope ? "page" : undefined} data-tone={scopeTone[scope]}>
              {scope === "world" ? text.world : copy.regionsShort[scope]}
            </a>
          </li>
        ))}
      </ul>
      <ul className={styles.chips} aria-label={copy.dungeon}>
        {[{ slug: "", name: copy.allDungeons, lang: locale as string }, ...data.dungeons.map((dungeon) => ({ slug: dungeon.slug, ...dungeonLabel(dungeon.slug, dungeon.name, locale) }))].map((tile) => {
          const season = tile.slug && isSeasonDungeon(tile.slug) ? tile.slug : null;
          return (
            <li key={tile.slug || "all"}>
              <a
                className={styles.chip}
                href={hrefWith(base, { region: query.region, dungeon: tile.slug || undefined })}
                aria-current={(query.dungeon ?? "") === tile.slug ? "page" : undefined}
                style={{ "--dungeon-accent": season ? dungeonArtDirections[season].accent : undefined } as CSSProperties}
              >
                <span className={styles.chipArt} aria-hidden="true">
                  <Image src={season ? dungeonBackdropSmall(season) : "/assets/wow/mythic/hub/gateway-768.webp"} alt="" fill sizes="132px" />
                </span>
                <span className={styles.chipName} lang={tile.lang}>{tile.name}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </MaterialPlaque>
  );
}

// ---- Rating cutoffs ---------------------------------------------------------------

function Cutoffs({ data, copy, text, locale, scope, base, query }: Ctx & { scope: Scope; base: string; query: RunsQuery }) {
  const scopes = (["world", ...runsRegions] as Scope[]).filter((item) => scopeCutoffs(data, item)?.tiers.length);
  if (!scopes.length) return null;
  const columns = kpiTiers.map((key) => scopeCutoffs(data, scopes[0])!.tiers.find((tier) => tier.key === key)).filter(Boolean) as CutoffTier[];
  const single = scope !== "world";
  const cutoffs = scopeCutoffs(data, scope);
  const series: ChartSeries[] = single
    ? (cutoffs?.history ?? []).filter((item) => tierTone[item.key]).map((item) => ({ key: item.key, label: text.tier(columns.find((tier) => tier.key === item.key)?.percent ?? cutoffs!.tiers.find((tier) => tier.key === item.key)?.percent ?? 0), tone: tierTone[item.key], points: item.points }))
    : scopes.map((item) => ({ key: item, label: scopeShort(item, copy, text), tone: scopeTone[item], points: scopeCutoffs(data, item)!.history.find((entry) => entry.key === "p990")?.points ?? [] }));
  const chartLabel = single ? text.trendTiers(scopeName(scope, copy, text)) : text.trendAll;
  return (
    <Card id="cutoffs" title={text.cutoffsTitle} className={styles.wide}>
      <div className={styles.cutoffBody}>
        <table className={styles.cutoffTable}>
          <thead>
            <tr><th scope="col"><span className={community.srOnly}>{copy.region}</span></th>{columns.map((tier) => <th key={tier.key} scope="col">{text.tier(tier.percent)}</th>)}</tr>
          </thead>
          <tbody>
            {scopes.map((item) => {
              const block = scopeCutoffs(data, item)!;
              return (
                <tr key={item} data-tone={scopeTone[item]} aria-current={item === scope ? "true" : undefined}>
                  <th scope="row"><a href={hrefWith(base, { region: item === "world" ? undefined : item, dungeon: query.dungeon })}><span className={styles.regionTag}>{scopeShort(item, copy, text)}</span></a></th>
                  {columns.map((column) => {
                    const tier = block.tiers.find((entry) => entry.key === column.key);
                    return <td key={column.key}>{tier ? <><b>{number(tier.score, locale)}</b><Delta value={tierDelta(block, column.key)} locale={locale} hint={text.week} /></> : null}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <figure className={styles.chartBox}>
          <figcaption className={styles.label}>{chartLabel}</figcaption>
          <CutoffChart series={series} label={chartLabel} locale={locale} />
        </figure>
      </div>
    </Card>
  );
}

// ---- Players by rating ------------------------------------------------------------

function Ladder({ data, text, locale, scope }: Ctx & { scope: Scope }) {
  const regions = scope === "world" ? runsRegions.filter((region) => data.cutoffs[region]) : runsRegions.filter((region) => region === scope && data.cutoffs[region]);
  if (!regions.length) return null;
  const blocks = regions.map((region) => data.cutoffs[region]!);
  const population = blocks.reduce((sum, block) => sum + block.players, 0);
  const sum = <T extends { players: number }>(pick: (block: RegionCutoffs) => T | undefined) => {
    const found = blocks.map(pick);
    return found.every(Boolean) ? found.reduce((total, item) => total + item!.players, 0) : null;
  };
  const milestones = blocks[0].milestones.map((item) => ({ score: item.score, players: sum((block) => block.milestones.find((entry) => entry.score === item.score)) }))
    .filter((item): item is { score: number; players: number } => item.players !== null);
  // "All dungeons timed at +N" saturates at the top 0.1%: keep a level only while the count still drops.
  const timed: Array<{ level: number; players: number }> = [];
  for (const item of blocks[0].all_timed) {
    const players = sum((block) => block.all_timed.find((entry) => entry.level === item.level));
    if (players === null) continue;
    if (timed.length && players >= timed[timed.length - 1].players) break;
    timed.push({ level: item.level, players });
  }
  const shown = timed.slice(-3);
  const share = (players: number) => (population ? (players / population) * 100 : 0);
  const row = (key: string, label: string, players: number) => (
    <li key={key} className={styles.ladderRow}>
      <span className={styles.ladderLabel}>{label}</span>
      <span className={styles.bar} aria-hidden="true"><span style={{ inlineSize: `${Math.max(1.5, Math.min(100, share(players)))}%` }} /></span>
      <b>{shareOf(share(players), players, locale)}</b>
      <span className={styles.muted}>{compact(players, locale)}</span>
    </li>
  );
  return (
    <Card id="ladder" title={text.ladderTitle} kit="the-blinding-vale">
      <ul className={styles.ladder}>{milestones.map((item) => row(`m${item.score}`, text.milestone(number(item.score, locale)), item.players))}</ul>
      {shown.length ? (
        <>
          <h3 className={styles.label}>{text.allTimedTitle}</h3>
          <ul className={styles.ladder}>{shown.map((item) => row(`t${item.level}`, `+${item.level}`, item.players))}</ul>
        </>
      ) : null}
    </Card>
  );
}

// ---- Specializations -----------------------------------------------------------------

type SpecRow = { spec: number; presence?: SpecPresence; cohort?: CohortSpec };

function Specs({ data, copy, text, locale, specs, query }: Ctx & { query: RunsQuery }) {
  const cohorts = new Map((data.cohorts?.specs ?? []).map((item) => [item.spec, item]));
  const presence = new Map(data.specPresence.map((item) => [item.spec, item]));
  const rowsOf = (role: RunsRole): SpecRow[] => {
    const ids = new Set([...data.specPresence.filter((item) => item.role === role).map((item) => item.spec), ...[...cohorts.values()].filter((item) => item.role === role).map((item) => item.spec)]);
    return [...ids].filter((id) => specs.has(id)).map((id) => ({ spec: id, presence: presence.get(id), cohort: cohorts.get(id) }))
      .sort((a, b) => (b.presence?.runs ?? 0) - (a.presence?.runs ?? 0) || (b.cohort?.p1 ?? 0) - (a.cohort?.p1 ?? 0));
  };
  const presenceTop = Math.max(1, ...data.specPresence.map((item) => item.presence));
  const titleTop = Math.max(1, ...[...cohorts.values()].map((item) => item.titleShare));
  const hasCohorts = cohorts.size > 0;
  const table = (rows: SpecRow[], offset: number, role: RunsRole) => (
    <AtlasTable
      className={styles.specTable}
      label={`${text.specsTitle}: ${copy.rolesPlural[role]}`}
      rows={rows}
      rowKey={(row) => String(row.spec)}
      columns={[
        { key: "rank", header: "#", numeric: true, className: styles.rankCol, cell: (_, index) => offset + index + 1 },
        { key: "spec", header: text.spec, rowHeader: true, cell: (row) => <SpecToken spec={specs.get(row.spec)} size="sm" /> },
        {
          key: "runs", header: text.inTopRuns, cell: (row) => (
            <span className={styles.meterCell} style={{ "--meter-color": specs.get(row.spec)?.color } as CSSProperties}>
              <span className={styles.bar} aria-hidden="true"><span style={{ inlineSize: `${((row.presence?.presence ?? 0) / presenceTop) * 100}%` }} /></span>
              <b>{row.presence ? shareOf(row.presence.presence, row.presence.runs, locale) : "—"}</b>
              <Delta value={row.presence?.delta} locale={locale} digits={1} unit={text.pp} hint={text.week} />
            </span>
          ),
        },
        ...(hasCohorts ? [
          {
            key: "title", header: text.inTitle, className: styles.optCol, cell: (row: SpecRow) => row.cohort ? (
              <span className={styles.meterCell} data-compact style={{ "--meter-color": specs.get(row.spec)?.color } as CSSProperties} title={text.titlePlayers(number(row.cohort.title, locale))}>
                <span className={styles.bar} aria-hidden="true"><span style={{ inlineSize: `${(row.cohort.titleShare / titleTop) * 100}%` }} /></span>
                <b>{shareOf(row.cohort.titleShare, row.cohort.title, locale)}</b>
              </span>
            ) : null,
          },
          {
            key: "top1", header: <abbr title={text.specTop1Hint}>{text.specTop1}</abbr>, numeric: true, cell: (row: SpecRow) => row.cohort ? (
              <span className={styles.trendCell}>
                <Sparkline values={row.cohort.trend} label={`${specLabel(specs.get(row.spec))}: ${row.cohort.trend.map((value) => number(value, locale)).join(", ")}`} />
                <b>{number(row.cohort.p1, locale)}</b>
                <Delta value={row.cohort.delta} locale={locale} hint={text.week} />
              </span>
            ) : null,
          },
        ] : []),
      ]}
    />
  );
  const tabs = roleOrder.map((role) => {
    const rows = rowsOf(role);
    const Icon = roleIcons[role];
    return {
      id: role,
      label: <span className={styles.tabLabel}><Icon aria-hidden="true" />{copy.rolesPlural[role]}</span>,
      content: (
        <div>
          {table(rows.slice(0, visibleSpecs), 0, role)}
          {rows.length > visibleSpecs ? <AtlasDisclosure className={styles.more} summary={text.moreSpecs(rows.length - visibleSpecs)}>{table(rows.slice(visibleSpecs), visibleSpecs, role)}</AtlasDisclosure> : null}
        </div>
      ),
    };
  });
  return (
    <Card id="specs" title={text.specsTitle} kit="kings-rest" className={styles.wide} aside={query.dungeon ? <span className={styles.scopeNote}>{dungeonName(data, query.dungeon, locale)}</span> : null}>
      <AtlasTabs label={text.specsTitle} variant="segmented" defaultTab="dps" tabs={tabs} />
    </Card>
  );
}

function dungeonName(data: StatsResponse, slug: string, locale: Locale) {
  const dungeon = data.dungeons.find((item) => item.slug === slug);
  return dungeon ? dungeonLabel(dungeon.slug, dungeon.name, locale).name : slug;
}

// ---- Compositions and sample ---------------------------------------------------------------

function Comps({ data, text, locale, specs, query }: Ctx & { query: RunsQuery }) {
  const diversity = data.diversity;
  if (!diversity) return null;
  const prefix = locale === "ru" ? "/ru" : "";
  const top = Math.max(1, ...diversity.top.map((item) => item.share));
  return (
    <Card id="comps" title={text.compsTitle} kit="den-of-nalorakk">
      <dl className={styles.facts}>
        <div><dt>{text.comps}</dt><dd>{number(diversity.comps, locale)}</dd></div>
        <div><dt>{text.topComp}</dt><dd>{percent(diversity.topShare, locale)}</dd></div>
        <div><dt>{text.top10}</dt><dd>{percent(diversity.top10Share, locale)}</dd></div>
      </dl>
      <ol className={styles.compList}>
        {diversity.top.map((group) => (
          <li key={`${group.tank}-${group.healer}-${group.dps.join("-")}`}>
            <GroupIcons group={group} specs={specs} />
            <span className={styles.bar} aria-hidden="true"><span style={{ inlineSize: `${(group.share / top) * 100}%` }} /></span>
            <b>{percent(group.share, locale)}</b>
          </li>
        ))}
      </ol>
      <a className={styles.cardLink} href={hrefWith(`${prefix}/wow/mythic-plus/comps`, { region: query.region, dungeon: query.dungeon })}>{text.allComps}<ArrowRight aria-hidden="true" /></a>
    </Card>
  );
}

function Sample({ data, copy, text, locale }: Ctx) {
  const depth = Object.entries(data.depth ?? {}) as Array<[RunsRegion, number]>;
  const groups = new Map<number, RunsRegion[]>();
  for (const [region, runs] of depth) groups.set(runs, [...(groups.get(runs) ?? []), region]);
  const parts = [...groups.entries()].sort((a, b) => b[0] - a[0])
    .map(([runs, regions]) => text.sampleDepthPart(number(runs, locale), runsRegions.filter((region) => regions.includes(region)).map((region) => copy.regionsShort[region]).join(", ")));
  const depthLine = parts.length ? text.sampleDepth(parts.join("; ")) : "";
  return (
    <Card id="sample" title={text.sampleTitle} kit="the-blinding-vale">
      <p className={styles.sampleLead}><b>{number(data.sample.runs, locale)}</b> {text.sampleRuns} · +{data.sample.minLevel}–{data.sample.maxLevel}</p>
      {depthLine ? <p className={styles.muted}>{depthLine}</p> : null}
    </Card>
  );
}

// ---- Dungeons --------------------------------------------------------------------

function Dungeons({ data, text, locale, specs, query }: Ctx & { query: RunsQuery }) {
  const prefix = locale === "ru" ? "/ru" : "";
  const max = Math.max(0, ...data.dungeonStats.map((row) => row.maxLevel));
  // Most pushed first: highest key, then the share of runs within one level of the sample's top, then the best margin.
  const upper = (row: DungeonStats) => (row.levels ?? []).filter((level) => level.level >= max - 1).reduce((sum, level) => sum + level.runs, 0) / Math.max(1, row.runs);
  const rows = [...data.dungeonStats].sort((a, b) => b.maxLevel - a.maxLevel || upper(b) - upper(a) || (b.bestTimeLeft ?? 0) - (a.bestTimeLeft ?? 0));
  const levels = [...new Set(data.dungeonStats.flatMap((row) => (row.levels ?? []).map((level) => level.level)))].sort((a, b) => a - b);
  return (
    <Card id="dungeons" title={text.dungeonsTitle} kit="ruby-life-pools" className={styles.full}
      aside={levels.length > 1 ? (
        <ul className={styles.legend} aria-label={text.levelMix}>
          {levels.map((level, index) => <li key={level} data-step={levelStep(index, levels.length)}>+{level}</li>)}
        </ul>
      ) : null}
    >
      <ol className={styles.dungeons}>
        {rows.map((row, index) => {
          const season = isSeasonDungeon(row.slug) ? row.slug : null;
          const dungeon = data.dungeons.find((item) => item.slug === row.slug);
          const name = dungeonLabel(row.slug, dungeon?.name ?? row.slug, locale);
          const standout = row.standout ? specs.get(row.standout.spec) : undefined;
          return (
            <li key={row.slug} className={styles.dungeon} data-current={row.slug === query.dungeon || undefined} style={{ "--dungeon-accent": season ? dungeonArtDirections[season].accent : undefined } as CSSProperties}>
              <span className={styles.dungeonArt} aria-hidden="true">{season ? <Image src={dungeonBackdropSmall(season)} alt="" fill sizes="(max-width: 700px) 100vw, 340px" /> : null}</span>
              <a className={styles.dungeonName} href={hrefWith(`${prefix}/wow/mythic-plus/routes`, { dungeon: row.slug, region: query.region })} lang={name.lang} aria-label={text.openRoutes(name.name)} aria-current={row.slug === query.dungeon ? "true" : undefined}>
                <span className={styles.dungeonRank}>{index + 1}</span><span className={styles.dungeonTitle}>{name.name}</span>
              </a>
              <p className={styles.dungeonKey}>
                <b>+{row.maxLevel}</b>
                {row.runsAtMax ? <span title={text.atHighestHint(row.runsAtMax, row.maxLevel)}>{text.atHighest(number(row.runsAtMax, locale))}<span className={community.srOnly}> {text.atHighestHint(row.runsAtMax, row.maxLevel)}</span></span> : null}
              </p>
              {row.bestTimeLeft !== undefined ? <p className={styles.margin}>{text.bestMargin} <b>{percent(row.bestTimeLeft, locale)}</b></p> : null}
              {row.levels?.length ? (
                <span className={styles.stack} role="img" aria-label={`${text.levelMix}: ${row.levels.map((level) => `+${level.level} ${percent((level.runs / row.runs) * 100, locale)}`).join(", ")}`}>
                  {row.levels.map((level) => <span key={level.level} data-step={levelStep(levels.indexOf(level.level), levels.length)} style={{ inlineSize: `${(level.runs / row.runs) * 100}%` }} />)}
                </span>
              ) : null}
              {standout && row.standout ? (
                <p className={styles.standout} title={text.standoutHint(specLabel(standout), percent(row.standout.presence, locale), percent(row.standout.overall, locale))} style={{ "--class-color": standout.color } as CSSProperties}>
                  <span className={styles.label}>{text.standout}</span>
                  <SpecToken spec={standout} size="sm" name={false} />
                  <Delta value={row.standout.presence - row.standout.overall} locale={locale} digits={1} hint={text.standoutHint(specLabel(standout), percent(row.standout.presence, locale), percent(row.standout.overall, locale))} />
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** 1…5 colour steps of the key-level ramp: the highest level is always the brightest. */
function levelStep(index: number, count: number) {
  if (index < 0) return 1;
  return Math.max(1, 5 - (count - 1 - index));
}
