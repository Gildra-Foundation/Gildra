import type { CSSProperties } from "react";
import { ArrowDown, ArrowLeft, ArrowUpRight, HeartPulse, ListOrdered, Shield, Swords } from "lucide-react";
import {
  AtlasEmpty, AtlasError, AtlasFrame, AtlasHero, AtlasNotice, AtlasSection, AtlasTable, AtlasTabs,
} from "@/components/atlas";
import { AtlasStats } from "@gildra/atlas-ui/AtlasStats";
import {
  MythicHubBackdrop, MythicHubLinkButton as AtlasLinkButton, MythicHubMotion, MythicHubOrnaments, mythicHubButtonLayout, mythicHubControlLayout,
} from "@/components/wow/shared/materialAtlas";
import { dungeonArtDirections } from "@/lib/wow/dungeonArtDirection";
import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import { loadMythicPlusMeta } from "@/lib/games/wow/mythicPlusMeta";
import { metaRoles, mythicPlusMetaView, type MetaRole, type MetaSpec, type MythicPlusMetaView } from "@/lib/games/wow/mythicPlusMetaView";
import { trail } from "@/lib/routes/registry";
import { Delta, formatPresence, PresenceBar, SpecIdentity, Sparkline, trendLabel } from "./MetaParts";
import { mythicMetaCopy, type MythicMetaCopy } from "./mythicMetaCopy";
import styles from "./mythicMeta.module.css";

type Locale = "en" | "ru";

const topCount = 5;
/** Painted materials of the Mythic+ kit: one dungeon set per role plaque, Voidscar for the page itself (as on the hub's meta link). */
const pageKit: DungeonSlug = "voidscar-arena";
const roleKits: Record<MetaRole, DungeonSlug> = { tank: "den-of-nalorakk", healer: "the-blinding-vale", dps: "ruby-life-pools" };
const roleIcons = { tank: Shield, healer: HeartPulse, dps: Swords } satisfies Record<MetaRole, unknown>;
const kitStyle = (slug: DungeonSlug) => ({ ...mythicHubControlLayout(slug), "--meta-kit-accent": dungeonArtDirections[slug].accent } as CSSProperties);
const number = (value: number, locale: Locale, digits = 0) => value.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
const dateTime = (iso: string, copy: MythicMetaCopy) => new Intl.DateTimeFormat(copy.dateLocale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso)) + " UTC";

/** /wow/mythic-plus/meta: leaders by role, every spec of a role, how diverse the week is, and the source line. */
export async function MythicMetaPage({ locale }: { locale: Locale }) {
  const copy = mythicMetaCopy[locale];
  const result = await loadMythicPlusMeta();
  const view = result.state === "ready" ? mythicPlusMetaView(result.meta.data) : null;
  const crumbs = trail(locale, "mythicPlus", { label: copy.breadcrumb });
  const prefix = locale === "ru" ? "/ru" : "";

  if (result.state !== "ready" || !view) {
    return (
      <AtlasFrame lang={locale} className={styles.page} still foot={false} dataAttributes={{ "data-mythic-hub": true }}>
        <MythicHubBackdrop />
        <div className={styles.hero}>
          <AtlasHero align="start" className={styles.heroHeader} breadcrumbs={crumbs} title={copy.title} lede={copy.lede} />
        </div>
        <div className={styles.statePlaque} style={kitStyle(pageKit)}>
          {result.state === "error"
            ? <AtlasError title={copy.errorTitle}>{copy.error}</AtlasError>
            : <AtlasEmpty title={copy.emptyTitle}>{copy.empty}</AtlasEmpty>}
        </div>
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
  const ctx = { view, copy, locale };

  return (
    <AtlasFrame lang={locale} className={styles.page} still foot={false} dataAttributes={{ "data-mythic-hub": true }}>
      <MythicHubBackdrop />
      <MythicHubMotion />
      <div className={styles.hero} data-hub-hero>
        <AtlasHero
          align="start"
          className={styles.heroHeader}
          breadcrumbs={crumbs}
          eyebrow={eyebrow}
          title={copy.title}
          lede={copy.lede}
          actions={<div className={styles.actions} data-hub-actions>
            <span className={styles.actionSlot} style={mythicHubButtonLayout(pageKit)}><AtlasLinkButton className={styles.assetButton} href="#top" variant="primary" iconAfter={<ArrowDown aria-hidden="true" />}>{copy.topTitle}</AtlasLinkButton></span>
            <span className={styles.actionSlot} style={mythicHubButtonLayout("kings-rest")}><AtlasLinkButton className={styles.assetButton} href="#all" icon={<ListOrdered aria-hidden="true" />}>{copy.allTitle}</AtlasLinkButton></span>
          </div>}
        />
        <div className={styles.weekFacts}>
          <AtlasStats label={copy.statsLabel} items={stats} />
          {view.period?.affixes.length ? (
            <ul className={styles.affixes} aria-label={copy.affixes}>
              {view.period.affixes.map((affix) => <li key={affix} lang="en">{affix}</li>)}
            </ul>
          ) : null}
        </div>
      </div>
      {meta.status === "stale" ? <AtlasNotice tone="caution">{copy.stale}</AtlasNotice> : null}

      <div data-hub-reveal><TopByRole {...ctx} /></div>
      <div data-hub-reveal><EveryRole {...ctx} /></div>
      <div data-hub-reveal><Diversity {...ctx} /></div>

      <SourcePlaque copy={copy} fetchedAt={meta.checkedAt ?? meta.fetchedAt} url={view.sourceUrl} hubHref={`${prefix}/wow/mythic-plus`} />
    </AtlasFrame>
  );
}

type Ctx = { view: MythicPlusMetaView; copy: MythicMetaCopy; locale: Locale };

function TopByRole({ view, copy, locale }: Ctx) {
  return (
    <AtlasSection id="top" className={styles.section} title={copy.topTitle} description={copy.topText}>
      <div className={styles.podium}>
        {metaRoles.map((role) => {
          const Icon = roleIcons[role];
          const [leader, ...rest] = view.roles[role].slice(0, topCount);
          return (
            <section key={role} className={styles.rolePlaque} style={kitStyle(roleKits[role])} aria-labelledby={`top-${role}`}>
              <h3 id={`top-${role}`} className={styles.roleTitle}><Icon aria-hidden="true" />{copy.roles[role]}</h3>
              <ol className={styles.podiumList}>
                {leader ? (
                  <li className={styles.leader}>
                    <span className={styles.podiumRank}>{leader.rank}</span>
                    <SpecIdentity spec={leader} size="lg" />
                    <span className={styles.leaderValue}>
                      <b>{formatPresence(leader.presence, locale)}</b>
                      <Delta value={leader.delta} copy={copy} locale={locale} />
                    </span>
                    <span className={styles.leaderTrack} aria-hidden="true"><span style={{ inlineSize: `${Math.min(100, leader.presence)}%` }} /></span>
                  </li>
                ) : null}
                {rest.map((spec) => (
                  <li key={spec.key} className={styles.podiumItem}>
                    <span className={styles.podiumRank}>{spec.rank}</span>
                    <SpecIdentity spec={spec} size="md" />
                    <span className={styles.podiumValue}>
                      <b>{formatPresence(spec.presence, locale)}</b>
                      <Delta value={spec.delta} copy={copy} locale={locale} />
                    </span>
                  </li>
                ))}
              </ol>
              <MythicHubOrnaments slug={roleKits[role]} />
            </section>
          );
        })}
      </div>
    </AtlasSection>
  );
}

function roleTable(specs: MetaSpec[], role: MetaRole, { copy, locale }: Ctx) {
  const max = Math.max(...specs.map((spec) => spec.presence), 1);
  const trendMax = Math.max(1, ...specs.flatMap((spec) => spec.trend.map((value) => value ?? 0)));
  return (
    <div className={styles.tableTint} style={{ "--meta-role-accent": dungeonArtDirections[roleKits[role]].accent } as CSSProperties}>
      <AtlasTable
        className={styles.metaTable}
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
    </div>
  );
}

function EveryRole(ctx: Ctx) {
  const { view, copy } = ctx;
  return (
    <AtlasSection id="all" className={styles.section} title={copy.allTitle} description={copy.allText}>
      <div className={styles.tablePlaque} style={kitStyle(pageKit)}>
        <AtlasTabs
          label={copy.rolesLabel}
          variant="segmented"
          defaultTab="dps"
          tabs={(["dps", "tank", "healer"] as MetaRole[]).map((role) => ({ id: role, label: copy.roles[role], count: view.roles[role].length, content: roleTable(view.roles[role], role, ctx) }))}
        />
      </div>
    </AtlasSection>
  );
}

function Diversity({ view, copy, locale }: Ctx) {
  const rows: Array<{ key: "all" | MetaRole; label: string }> = [{ key: "all", label: copy.diversityAll }, ...metaRoles.map((role) => ({ key: role, label: copy.roles[role] }))];
  return (
    <AtlasSection id="diversity" className={styles.section} title={copy.diversityTitle} description={copy.diversityText}>
      <ul className={styles.gini}>
        {rows.map((row) => {
          const value = view.week.gini[row.key];
          const before = view.previous?.gini[row.key];
          const kit = row.key === "all" ? pageKit : roleKits[row.key];
          return (
            <li key={row.key} className={styles.giniItem} style={kitStyle(kit)}>
              <span className={styles.giniLabel}>{row.label}</span>
              <b className={styles.giniValue}>{number(value, locale, 2)}</b>
              <span className={styles.giniScale} aria-hidden="true"><span style={{ insetInlineStart: `${value * 100}%` }} /></span>
              <span className={styles.giniFoot}>
                <Sparkline values={view.weeks.map((week) => week.gini[row.key])} max={1} width={120} label={`${row.label}: ${view.weeks.map((week) => `${copy.week(week.week)} ${number(week.gini[row.key], locale, 2)}`).join(", ")}`} />
                {before !== undefined ? <span className={styles.giniBefore}>{copy.weekShort(view.previous!.week)}: {number(before, locale, 2)}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </AtlasSection>
  );
}

function SourcePlaque({ copy, fetchedAt, url, hubHref }: { copy: MythicMetaCopy; fetchedAt: string; url: string; hubHref: string }) {
  return (
    <section id="source" className={styles.sourcePlaque} style={kitStyle(pageKit)} aria-labelledby="meta-source-title" data-hub-reveal>
      <span className={styles.sourceText}>
        <strong id="meta-source-title">{copy.sourceTitle}</strong>
        <span>
          {copy.source} <a href={url} rel="noreferrer">mythicstats.com</a>
          {" · "}{copy.updated} <time dateTime={fetchedAt}>{dateTime(fetchedAt, copy)}</time>
        </span>
        <a className={styles.hubLink} href={hubHref}><ArrowLeft aria-hidden="true" />{copy.backToHub}</a>
      </span>
      <span className={styles.sourceAction} style={mythicHubButtonLayout("the-blinding-vale")}>
        <AtlasLinkButton className={styles.assetButton} href={url} external iconAfter={<ArrowUpRight aria-hidden="true" />}>{copy.openSource}</AtlasLinkButton>
      </span>
    </section>
  );
}
