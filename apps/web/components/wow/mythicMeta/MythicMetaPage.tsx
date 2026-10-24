import {
  AtlasBadge, AtlasEmpty, AtlasError, AtlasFrame, AtlasHero, AtlasLinkButton, AtlasNotice, AtlasPanel, AtlasSection, AtlasTable, AtlasTabs,
} from "@/components/atlas";
import { loadMythicPlusMeta } from "@/lib/games/wow/mythicPlusMeta";
import { metaRoles, mythicPlusMetaView, type MetaRole, type MetaSpec, type MythicPlusMetaView } from "@/lib/games/wow/mythicPlusMetaView";
import { trail } from "@/lib/routes/registry";
import { Delta, formatPresence, PresenceBar, SpecIdentity, Sparkline, trendLabel } from "./MetaParts";
import { mythicMetaCopy, type MythicMetaCopy } from "./mythicMetaCopy";
import styles from "./mythicMeta.module.css";

type Locale = "en" | "ru";

const topCount = 5;
const number = (value: number, locale: Locale, digits = 0) => value.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
const dateTime = (iso: string, copy: MythicMetaCopy) => new Intl.DateTimeFormat(copy.dateLocale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso)) + " UTC";

/** /wow/mythic-plus/meta: leaders by role, every spec of a role, how diverse the week is, and the source line. */
export async function MythicMetaPage({ locale }: { locale: Locale }) {
  const copy = mythicMetaCopy[locale];
  const result = await loadMythicPlusMeta();
  const view = result.state === "ready" ? mythicPlusMetaView(result.meta.data) : null;
  const crumbs = trail(locale, "mythicPlus", { label: copy.breadcrumb });

  if (result.state !== "ready" || !view) {
    return (
      <AtlasFrame lang={locale} scene="mythicPlus">
        <AtlasHero breadcrumbs={crumbs} title={copy.title} lede={copy.lede} />
        <AtlasSection title={copy.allTitle}>
          {result.state === "error"
            ? <AtlasError title={copy.errorTitle}>{copy.error}</AtlasError>
            : <AtlasEmpty title={copy.emptyTitle}>{copy.empty}</AtlasEmpty>}
        </AtlasSection>
      </AtlasFrame>
    );
  }

  const { meta } = result;
  const season = copy.season(view.season.number, view.season.label);
  const eyebrow = `${season} · ${copy.week(view.week.week)}`;
  const stats = [
    { value: number(view.week.averageKey, locale, 1), label: copy.averageKey },
    ...(view.period ? [
      { value: number(view.period.keys, locale), label: copy.keys },
      { value: number(view.period.unique_characters, locale), label: copy.characters },
    ] : []),
    { value: number(view.week.gini.all, locale, 2), label: copy.gini },
  ];
  const affixes = view.period?.affixes.length ? (
    <ul className={styles.affixes} aria-label={copy.affixes}>
      {view.period.affixes.map((affix) => <li key={affix}><AtlasBadge tone="neutral">{affix}</AtlasBadge></li>)}
    </ul>
  ) : null;
  const ctx = { view, copy, locale };

  return (
    <AtlasFrame lang={locale} scene="mythicPlus" className={styles.page}>
      <AtlasHero
        breadcrumbs={crumbs}
        eyebrow={eyebrow}
        title={copy.title}
        lede={copy.lede}
        actions={affixes}
        statsLabel={copy.statsLabel}
        stats={stats}
      />
      {meta.status === "stale" ? <AtlasNotice tone="caution">{copy.stale}</AtlasNotice> : null}

      <TopByRole {...ctx} />
      <EveryRole {...ctx} />
      <Diversity {...ctx} />

      <SourceLine copy={copy} fetchedAt={meta.checkedAt ?? meta.fetchedAt} url={view.sourceUrl} />
    </AtlasFrame>
  );
}

type Ctx = { view: MythicPlusMetaView; copy: MythicMetaCopy; locale: Locale };

function TopByRole({ view, copy, locale }: Ctx) {
  return (
    <AtlasSection id="top" title={copy.topTitle} description={copy.topText}>
      <div className={styles.podium}>
        {metaRoles.map((role) => (
          <AtlasPanel key={role} className={styles.podiumRole} as="section" aria-labelledby={`top-${role}`}>
            <h3 id={`top-${role}`} className={styles.roleTitle}>{copy.roles[role]}</h3>
            <ol className={styles.podiumList}>
              {view.roles[role].slice(0, topCount).map((spec) => (
                <li key={spec.key} className={styles.podiumItem} data-first={spec.rank === 1 || undefined}>
                  <span className={styles.podiumRank}>{spec.rank}</span>
                  <SpecIdentity spec={spec} size={spec.rank === 1 ? "lg" : "md"} />
                  <span className={styles.podiumValue}>
                    <b>{formatPresence(spec.presence, locale)}</b>
                    <Delta value={spec.delta} copy={copy} locale={locale} />
                  </span>
                </li>
              ))}
            </ol>
          </AtlasPanel>
        ))}
      </div>
    </AtlasSection>
  );
}

function roleTable(specs: MetaSpec[], role: MetaRole, { copy, locale }: Ctx) {
  const max = Math.max(...specs.map((spec) => spec.presence), 1);
  const trendMax = Math.max(1, ...specs.flatMap((spec) => spec.trend.map((value) => value ?? 0)));
  return (
    <AtlasTable
      label={`${copy.allTitle}: ${copy.roles[role]}`}
      rows={specs}
      rowKey={(spec) => spec.key}
      columns={[
        { key: "rank", header: copy.rank, numeric: true, className: styles.rankCol, cell: (spec) => spec.rank },
        { key: "spec", header: copy.spec, rowHeader: true, cell: (spec) => <SpecIdentity spec={spec} size="sm" /> },
        { key: "presence", header: copy.presenceShort, label: copy.presence, cell: (spec) => <span className={styles.presenceCell}><PresenceBar value={spec.presence} max={max} /><b>{formatPresence(spec.presence, locale)}</b></span> },
        { key: "change", header: <><span className={styles.wideOnly}>{copy.change}</span><span className={styles.narrowOnly} aria-hidden="true">±</span><span className={`${styles.narrowOnly} ${styles.srOnly}`}>{copy.change}</span></>, label: copy.change, numeric: true, cell: (spec) => <Delta value={spec.delta} copy={copy} locale={locale} /> },
        { key: "trend", header: copy.trend, className: styles.seasonCol, cell: (spec) => <Sparkline values={spec.trend} max={trendMax} label={trendLabel(spec, copy, locale)} /> },
      ]}
    />
  );
}

function EveryRole(ctx: Ctx) {
  const { view, copy } = ctx;
  return (
    <AtlasSection id="all" title={copy.allTitle} description={copy.allText}>
      <AtlasTabs
        label={copy.rolesLabel}
        variant="segmented"
        defaultTab="dps"
        tabs={(["dps", "tank", "healer"] as MetaRole[]).map((role) => ({ id: role, label: copy.roles[role], count: view.roles[role].length, content: roleTable(view.roles[role], role, ctx) }))}
      />
    </AtlasSection>
  );
}

function Diversity({ view, copy, locale }: Ctx) {
  const rows: Array<{ key: "all" | MetaRole; label: string }> = [{ key: "all", label: copy.diversityAll }, ...metaRoles.map((role) => ({ key: role, label: copy.roles[role] }))];
  return (
    <AtlasSection id="diversity" title={copy.diversityTitle} description={copy.diversityText}>
      <ul className={styles.gini}>
        {rows.map((row) => {
          const value = view.week.gini[row.key];
          const before = view.previous?.gini[row.key];
          return (
            <li key={row.key} className={styles.giniItem}>
              <span className={styles.giniLabel}>{row.label}</span>
              <b className={styles.giniValue}>{number(value, locale, 2)}</b>
              <span className={styles.giniScale} aria-hidden="true"><span style={{ insetInlineStart: `${value * 100}%` }} /></span>
              <Sparkline values={view.weeks.map((week) => week.gini[row.key])} max={1} width={120} label={`${row.label}: ${view.weeks.map((week) => `${copy.week(week.week)} ${number(week.gini[row.key], locale, 2)}`).join(", ")}`} />
              {before !== undefined ? <span className={styles.giniBefore}>{copy.weekShort(view.previous!.week)}: {number(before, locale, 2)}</span> : null}
            </li>
          );
        })}
      </ul>
    </AtlasSection>
  );
}

function SourceLine({ copy, fetchedAt, url }: { copy: MythicMetaCopy; fetchedAt: string; url: string }) {
  return (
    <AtlasSection id="source" className={styles.source} title={copy.sourceTitle}>
      <p className={styles.sourceLine}>
        {copy.source} <a href={url} rel="noreferrer">mythicstats.com</a>
        {" · "}{copy.updated} <time dateTime={fetchedAt}>{dateTime(fetchedAt, copy)}</time>
      </p>
      <p className={styles.sourceNote}>{copy.sourceNote}</p>
      <AtlasLinkButton href={url} external variant="ghost" size="sm">{copy.openSource}</AtlasLinkButton>
    </AtlasSection>
  );
}
