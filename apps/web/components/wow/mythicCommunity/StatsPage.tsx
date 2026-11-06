import type { CSSProperties } from "react";
import { ArrowDown, Users } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection, AtlasTable, AtlasTabs } from "@/components/atlas";
import { AtlasStats } from "@gildra/atlas-ui/AtlasStats";
import { MaterialLinkButton, MaterialPlaque, MythicHubBackdrop, MythicHubMotion } from "@/components/wow/shared/materialAtlas";
import { dungeonArtDirections } from "@/lib/wow/dungeonArtDirection";
import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import { loadMythicPlusStats } from "@/lib/games/wow/mythicPlusRuns";
import { runsRegions, runsRoles, type RegionCutoffs, type RunsQuery, type RunsRegion, type RunsRole, type StatsResponse } from "@/lib/games/wow/mythicPlusRunsTypes";
import { trail } from "@/lib/routes/registry";
import { CutoffChart, type ChartSeries } from "./CutoffChart";
import { FilterForm, hrefWith, LoadState, NoMatch, number, percent, shareOf, SourceLine, specIndex, SpecToken, StaleNotice, type Locale } from "./CommunityParts";
import { communityCopy, type CommunityCopy } from "./communityCopy";
import styles from "./community.module.css";

const kit = "voidscar-arena" as const;
const dataKit = "the-blinding-vale" as const;
const roleKits: Record<RunsRole, DungeonSlug> = { tank: "den-of-nalorakk", healer: "the-blinding-vale", dps: "ruby-life-pools" };
const regionTone: Record<RunsRegion, 1 | 2 | 3 | 4> = { eu: 1, us: 2, kr: 3, tw: 4 };
const tierTone: Record<string, 1 | 2 | 3 | 4> = { p999: 2, p990: 1, p900: 3 };

/** /wow/mythic-plus/stats: rating cutoffs per region and what the season's top timed keys are made of. */
export async function StatsPage({ locale, query }: { locale: Locale; query: RunsQuery }) {
  const copy = communityCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const base = `${prefix}/wow/mythic-plus/stats`;
  const result = await loadMythicPlusStats(query);
  const data = result.state === "ready" ? result.data : null;
  const crumbs = trail(locale, "mythicPlus", { label: copy.stats.breadcrumb });
  const regions = data ? runsRegions.filter((region) => data.cutoffs[region] && (!query.region || query.region === region)) : [];
  const lead = (query.region as RunsRegion | undefined) ?? (regions.includes("eu") ? "eu" : regions[0]);
  const leadCutoffs = lead ? data?.cutoffs[lead] : undefined;
  const tier = (key: string) => leadCutoffs?.tiers.find((item) => item.key === key);
  const stats = data ? [
    ...(tier("p990") ? [{ value: number(tier("p990")!.score, locale), label: `${copy.stats.top1} · ${copy.regionsShort[lead!]}` }] : []),
    ...(tier("p999") ? [{ value: number(tier("p999")!.score, locale), label: `${copy.stats.top01} · ${copy.regionsShort[lead!]}` }] : []),
    ...(data.sample.runs ? [{ value: `+${data.overall.maxLevel}`, label: copy.highestKey.toLowerCase() }] : []),
  ] : [];

  return (
    <AtlasFrame lang={locale} className={styles.page} still foot={false} dataAttributes={{ "data-mythic-hub": true }}>
      <MythicHubBackdrop />
      <MythicHubMotion />
      <div className={styles.hero} data-hub-hero>
        <AtlasHero
          align="start"
          className={styles.heroHeader}
          breadcrumbs={crumbs}
          title={copy.stats.title}
          lede={copy.stats.lede}
          actions={<div className={styles.actions} data-hub-actions>
            <MaterialLinkButton kit={kit} href="#cutoffs" variant="primary" fit="stack" iconAfter={<ArrowDown aria-hidden="true" />}>{copy.stats.cutoffsTitle}</MaterialLinkButton>
            <MaterialLinkButton kit="den-of-nalorakk" href={hrefWith(`${prefix}/wow/mythic-plus/comps`, { dungeon: query.dungeon, region: query.region, minLevel: query.minLevel })} fit="stack" icon={<Users aria-hidden="true" />}>{copy.stats.toComps}</MaterialLinkButton>
          </div>}
        />
        {stats.length ? <div className={styles.heroFacts}><AtlasStats items={stats} /></div> : null}
      </div>
      {data ? <StaleNotice data={data} copy={copy} /> : null}
      <FilterForm id="stats-filters" kit={kit} data={data} query={query} copy={copy} action={base} fields={["region", "dungeon", "minLevel"]} />
      {!data ? <LoadState result={result} kit={kit} copy={copy} resetHref={base} /> : (
        <>
          {regions.length ? <div data-hub-reveal><Cutoffs data={data} regions={regions} copy={copy} locale={locale} /></div> : null}
          {regions.length ? <div data-hub-reveal><Milestones data={data} regions={regions} copy={copy} locale={locale} /></div> : null}
          {data.sample.runs ? (
            <>
              <div data-hub-reveal><Specs data={data} copy={copy} locale={locale} /></div>
              <div data-hub-reveal><Dungeons data={data} copy={copy} locale={locale} /></div>
            </>
          ) : <MaterialPlaque kit={kit} className={styles.state}><NoMatch copy={copy} resetHref={base} /></MaterialPlaque>}
        </>
      )}
      <SourceLine copy={copy} hubHref={`${prefix}/wow/mythic-plus`} kit={kit} />
    </AtlasFrame>
  );
}

type Ctx = { data: StatsResponse; copy: CommunityCopy; locale: Locale };

function Cutoffs({ data, regions, copy, locale }: Ctx & { regions: RunsRegion[] }) {
  const blocks = regions.map((region) => [region, data.cutoffs[region]!] as const);
  const keys = blocks[0][1].tiers.map((tier) => tier.key);
  const rows = keys.map((key) => ({ key, percent: blocks[0][1].tiers.find((tier) => tier.key === key)!.percent }));
  const single = regions.length === 1;
  const series: ChartSeries[] = single
    ? blocks[0][1].history.filter((item) => tierTone[item.key]).map((item) => ({ key: item.key, label: copy.stats.tier(rows.find((row) => row.key === item.key)?.percent ?? 0), tone: tierTone[item.key], points: item.points }))
    : blocks.map(([region, cutoffs]) => ({ key: region, label: copy.regionsShort[region], tone: regionTone[region], points: cutoffs.history.find((item) => item.key === "p990")?.points ?? [] }));
  const chartLabel = single ? copy.stats.trendTiers(copy.regions[regions[0]]) : copy.stats.trendAll;
  return (
    <AtlasSection id="cutoffs" className={styles.section} title={copy.stats.cutoffsTitle} description={copy.stats.cutoffsText}>
      <MaterialPlaque kit={kit} className={styles.tablePlaque}>
        <AtlasTable
          className={styles.table}
          layout="scroll"
          label={copy.stats.cutoffsTitle}
          rows={rows}
          rowKey={(row) => row.key}
          columns={[
            { key: "tier", header: copy.share, rowHeader: true, cell: (row) => copy.stats.tier(row.percent) },
            ...(single ? [
              { key: "score", header: copy.stats.rating, numeric: true, cell: (row: { key: string }) => scoreOf(blocks[0][1], row.key, locale) },
              { key: "players", header: copy.stats.playersColumn, numeric: true, cell: (row: { key: string }) => {
                const tier = blocks[0][1].tiers.find((item) => item.key === row.key);
                return tier ? number(tier.players, locale) : "—";
              } },
            ] : blocks.map(([region, cutoffs]) => ({
              key: region, header: copy.regionsShort[region], label: copy.regions[region], numeric: true,
              cell: (row: { key: string }) => scoreOf(cutoffs, row.key, locale),
            }))),
          ]}
        />
        <h3 className={styles.chartTitle}>{chartLabel}</h3>
        <CutoffChart series={series} label={chartLabel} locale={locale} />
      </MaterialPlaque>
    </AtlasSection>
  );
}

function scoreOf(cutoffs: RegionCutoffs, key: string, locale: Locale) {
  const tier = cutoffs.tiers.find((item) => item.key === key);
  return tier ? number(tier.score, locale) : "—";
}

function Milestones({ data, regions, copy, locale }: Ctx & { regions: RunsRegion[] }) {
  const blocks = regions.map((region) => [region, data.cutoffs[region] as RegionCutoffs] as const);
  const scores = blocks[0][1].milestones.map((item) => item.score);
  if (!scores.length) return null;
  return (
    <AtlasSection id="milestones" className={styles.section} title={copy.stats.milestonesTitle}>
      <MaterialPlaque kit={dataKit} className={styles.tablePlaque}>
      <ul className={styles.milestones}>
        {scores.map((score) => (
          <li key={score} className={styles.milestone}>
              <h3 className={styles.milestoneTitle}>{copy.stats.milestone(number(score, locale))}</h3>
              <dl className={styles.milestoneList}>
                {blocks.map(([region, cutoffs]) => {
                  const item = cutoffs.milestones.find((entry) => entry.score === score);
                  return item ? (
                    <div key={region} className={styles.milestoneRow}>
                      <dt>{regions.length === 1 ? copy.regions[region] : copy.regionsShort[region]}</dt>
                      <dd>
                        <span className={styles.meter} aria-hidden="true"><span style={{ inlineSize: `${Math.min(100, item.share)}%` }} /></span>
                        <b>{percent(item.share, locale)}</b>
                      </dd>
                    </div>
                  ) : null;
                })}
              </dl>
          </li>
        ))}
      </ul>
      </MaterialPlaque>
    </AtlasSection>
  );
}

function Specs({ data, copy, locale }: Ctx) {
  const specs = specIndex(data.specs);
  const table = (role: RunsRole) => {
    const rows = data.specPresence.filter((item) => item.role === role);
    const top = Math.max(...rows.map((row) => row.presence), 1);
    return (
      <div className={styles.roleTint} style={{ "--role-accent": dungeonArtDirections[roleKits[role]].accent } as CSSProperties}>
        <AtlasTable
          className={styles.table}
          label={`${copy.stats.specsTitle}: ${copy.rolesPlural[role]}`}
          rows={rows}
          rowKey={(row) => String(row.spec)}
          columns={[
            { key: "rank", header: "#", numeric: true, className: styles.rankCol, cell: (_, index) => index + 1 },
            { key: "spec", header: copy.stats.spec, rowHeader: true, cell: (row) => <SpecToken spec={specs.get(row.spec)} size="sm" /> },
            { key: "presence", header: copy.stats.presence, cell: (row) => <span className={styles.presenceCell}><span className={styles.meter} aria-hidden="true"><span style={{ inlineSize: `${(row.presence / top) * 100}%` }} /></span><b>{shareOf(row.presence, row.runs, locale)}</b></span> },
            { key: "runs", header: copy.comps.openRuns, numeric: true, cell: (row) => number(row.runs, locale) },
            { key: "median", header: copy.medianKey, numeric: true, className: styles.wideCol, cell: (row) => `+${number(row.medianLevel, locale, 1)}` },
          ]}
        />
      </div>
    );
  };
  return (
    <AtlasSection id="specs" className={styles.section} title={copy.stats.specsTitle} description={copy.stats.specsText}>
      <MaterialPlaque kit="kings-rest" className={styles.tablePlaque}>
        <AtlasTabs
          label={copy.stats.specsTitle}
          variant="segmented"
          defaultTab="dps"
          tabs={(["dps", "tank", "healer"] as RunsRole[]).filter((role) => runsRoles.includes(role)).map((role) => ({
            id: role, label: copy.rolesPlural[role], count: data.specPresence.filter((item) => item.role === role).length, content: table(role),
          }))}
        />
      </MaterialPlaque>
    </AtlasSection>
  );
}

function Dungeons({ data, copy, locale }: Ctx) {
  const names = new Map(data.dungeons.map((dungeon) => [dungeon.slug, dungeon]));
  const topLevel = Math.max(1, ...data.levels.map((level) => level.runs));
  const rows = [...data.dungeonStats].sort((a, b) => b.medianLevel - a.medianLevel || b.maxLevel - a.maxLevel || b.medianTimeLeft - a.medianTimeLeft);
  return (
    <AtlasSection id="dungeons" className={styles.section} title={copy.stats.dungeonsTitle} description={copy.stats.dungeonsText}>
      <MaterialPlaque kit={dataKit} className={styles.tablePlaque}>
        <AtlasTable
          className={styles.table}
          layout="cards"
          label={copy.stats.dungeonsTitle}
          rows={rows}
          rowKey={(row) => row.slug}
          columns={[
            { key: "dungeon", header: copy.dungeon, rowHeader: true, cell: (row) => <span className={styles.dungeonName} style={{ "--dungeon-accent": dungeonArtDirections[row.slug as DungeonSlug]?.accent } as CSSProperties} lang="en">{names.get(row.slug)?.name ?? row.slug}</span> },
            { key: "max", header: copy.highestKey, numeric: true, cell: (row) => `+${row.maxLevel}` },
            { key: "median", header: copy.medianKey, numeric: true, cell: (row) => `+${number(row.medianLevel, locale, 1)}` },
            { key: "left", header: copy.timeLeft, numeric: true, cell: (row) => percent(row.medianTimeLeft, locale) },
          ]}
        />
        <h3 className={styles.chartTitle}>{copy.stats.levelsTitle}</h3>
        <ol className={styles.levels} aria-label={copy.stats.levelsTitle}>
          {[...data.levels].reverse().map((level) => (
            <li key={level.level} className={styles.levelRow}>
              <span className={styles.levelKey}>{copy.level(level.level)}</span>
              <span className={styles.meter} aria-hidden="true"><span style={{ inlineSize: `${(level.runs / topLevel) * 100}%` }} /></span>
              <b>{number(level.runs, locale)}</b>
            </li>
          ))}
        </ol>
      </MaterialPlaque>
    </AtlasSection>
  );
}
